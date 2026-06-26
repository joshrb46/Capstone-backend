import { Server } from "socket.io";
import { getUserById } from "#db/queries/users";
import { getLobbyByCode, addPlayerToLobby, setPlayerConnected, getLobbyPlayers } from "#db/queries/lobby";
import { createChatMessage } from "#db/queries/chatMessages";
import { getRoundById } from "#db/queries/rounds";

let io;

/** Call once from server.js after the HTTP server is created. */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN ?? /localhost/ },
  });

  io.on("connection", (socket) => {
    // Client identifies itself right after connecting, same x-user-id
    // pattern as REST: no separate socket auth scheme.
    socket.on("identify", async ({ userId }) => {
      const user = await getUserById(userId).catch(() => null);
      if (!user) return socket.emit("error:identify", "Invalid user id.");
      socket.data.userId = user.id;
      socket.data.username = user.username;
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

    // Optional socket-native chat path (REST POST /rounds/:id/messages also works).
    socket.on("chat:send", async ({ roundId, message }) => {
      if (!socket.data.userId) {
        return socket.emit("error:chat_send", "Call 'identify' first.");
      }

      const round = await getRoundById(roundId).catch(() => null);
      if (!round) return socket.emit("error:chat_send", "Round not found.");

      const chatMessage = await createChatMessage(roundId, socket.data.userId, message);
      io.to(`match:${round.match_id}`).emit("chat:message", {
        ...chatMessage,
        username: socket.data.username,
      });
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
