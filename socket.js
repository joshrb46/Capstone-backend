import { Server } from "socket.io";
import { getUserBySessionToken } from "#db/queries/users";
import { getLobbyByCode, addPlayerToLobby, setPlayerConnected, getLobbyPlayers } from "#db/queries/lobby";
import { submitGuess } from "#db/queries/scoring";
import { getRoundById } from "#db/queries/rounds";
import { getWordById } from "#db/queries/words";
import { isPlayerInMatch } from "#db/queries/matches";
import { maskMessageForViewer } from "#lib/scoring";

let io;

/** Call once from server.js after the HTTP server is created. */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN ?? /localhost/ },
  });

  io.on("connection", (socket) => {
    // Client identifies itself right after connecting, same x-session-token
    // pattern as REST: no separate socket auth scheme. Takes an optional
    // ack callback so the client can wait for this to actually finish
    // before emitting anything that depends on socket.data.userId being
    // set (e.g. lobby:join) — otherwise a fast client could fire the next
    // event before this async handler resolves.
    socket.on("identify", async ({ sessionToken }, ack) => {
      const user = await getUserBySessionToken(sessionToken).catch(() => null);
      if (!user) {
        socket.emit("error:identify", "Invalid session token.");
        return ack?.({ ok: false });
      }
      socket.data.userId = user.id;
      socket.data.username = user.username;
      ack?.({ ok: true });
    });

    // Joins the Socket.IO room for a lobby (room name = lobby code),
    // marks the player connected, and broadcasts the updated player list.
    socket.on("lobby:join", async ({ code }) => {
      if (!socket.data.userId) {
        return socket.emit("error:lobby_join", "Call 'identify' first.");
      }

      const lobby = await getLobbyByCode(code).catch(() => null);
      if (!lobby) return socket.emit("error:lobby_join", "Lobby not found.");

      await addPlayerToLobby(lobby.id, socket.data.userId);
      socket.data.lobbyCode = code.toUpperCase();
      socket.data.lobbyId = lobby.id;
      socket.join(`lobby:${lobby.code}`);

      const players = await getLobbyPlayers(lobby.id);
      io.to(`lobby:${lobby.code}`).emit("lobby:players", players);
    });

    // Joins the room used for in-match broadcasts (round/chat events).
    // Lets clients receive round:* and chat:message events emitted from
    // the REST routes above without duplicating logic over sockets.
    socket.on("match:join", ({ matchId }) => {
      socket.join(`match:${matchId}`);
    });

    socket.on("match:leave", ({ matchId }) => {
      socket.leave(`match:${matchId}`);
    });

    // Drawing sync — the drawer emits these; the backend rebroadcasts to
    // everyone else in the match room. No DB writes: strokes are ephemeral.
    // draw:stroke carries one point in the current path; type is "start"|"move"|"end".
    socket.on("draw:stroke", ({ matchId, ...data }) => {
      if (!socket.data.userId) return;
      socket.to(`match:${matchId}`).emit("draw:stroke", data);
    });

    // draw:clear is emitted when the drawer clears the canvas so guessers
    // wipe theirs too.
    socket.on("draw:clear", ({ matchId }) => {
      if (!socket.data.userId) return;
      socket.to(`match:${matchId}`).emit("draw:clear");
    });

    // Optional socket-native chat path (REST POST /rounds/:id/messages also works).
    socket.on("chat:send", async ({ roundId, message }) => {
      if (!socket.data.userId) {
        return socket.emit("error:chat_send", "Call 'identify' first.");
      }

      const round = await getRoundById(roundId).catch(() => null);
      if (!round) return socket.emit("error:chat_send", "Round not found.");

      const isMember = await isPlayerInMatch(round.match_id, socket.data.userId).catch(() => false);
      if (!isMember) {
        return socket.emit("error:chat_send", "You are not a player in this match.");
      }

      const word = round.word_id ? await getWordById(round.word_id) : null;
      const { chatMessage, correct, points, drawerBonus } = await submitGuess({
        round,
        word,
        userId: socket.data.userId,
        message,
      });

      const payload = { ...chatMessage, username: socket.data.username };

      // Sender gets the unmasked message directly; everyone else in the
      // room gets a masked copy so the chat feed can't leak the answer.
      socket.emit("chat:message", payload);
      socket
        .to(`match:${round.match_id}`)
        .emit("chat:message", maskMessageForViewer(payload, null, round));

      if (correct) {
        io.to(`match:${round.match_id}`).emit("round:correct_guess", {
          roundId: round.id,
          userId: socket.data.userId,
          username: socket.data.username,
          points,
          drawerBonus,
        });
      }
    });

    socket.on("disconnect", async () => {
      if (socket.data.lobbyId && socket.data.userId) {
        await setPlayerConnected(socket.data.lobbyId, socket.data.userId, false).catch(() => {});
        const players = await getLobbyPlayers(socket.data.lobbyId).catch(() => []);
        io.to(`lobby:${socket.data.lobbyCode}`).emit("lobby:players", players);
      }
    });
  });

  return io;
}

/** Used by REST routes to emit events after a DB write. */
export function getIO() {
  if (!io) throw new Error("Socket.IO has not been initialized yet.");
  return io;
}
