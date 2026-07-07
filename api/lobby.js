import express from "express";
const router = express.Router();
export default router;

import requireUser from "#middleware/requireUser";
import requireBody from "#middleware/requireBody";
import {
  createLobby,
  getLobbyByCode,
  getLobbyById,
  addPlayerToLobby,
  removePlayerFromLobby,
  getLobbyPlayers,
  isPlayerInLobby,
  updateLobbyStatus,
} from "#db/queries/lobby";
import { createMatch } from "#db/queries/matches";
import { getIO } from "#socket";

router.use(requireUser);

router.route("/").post(async (req, res) => {
  const { maxRounds, winScore, isPrivate } = req.body ?? {};
  const lobby = await createLobby(req.user.id, {
    maxRounds,
    winScore,
    isPrivate,
  });
  res.status(201).send(lobby);
});

router.route("/:code").get(async (req, res) => {
  const lobby = await getLobbyByCode(req.params.code);
  if (!lobby) return res.status(404).send("Lobby not found.");

  const players = await getLobbyPlayers(lobby.id);
  res.send({ ...lobby, players });
});

router.route("/:code/players").post(async (req, res) => {
  const lobby = await getLobbyByCode(req.params.code);
  if (!lobby) return res.status(404).send("Lobby not found.");
  if (lobby.status !== "lobby") {
    return res.status(400).send("This lobby's match has already started.");
  }

  const player = await addPlayerToLobby(lobby.id, req.user.id);

  const players = await getLobbyPlayers(lobby.id);
  getIO().to(`lobby:${lobby.code}`).emit("lobby:players", players);

  res.status(201).send(player);
});

router.route("/:code/players/me").delete(async (req, res) => {
  const lobby = await getLobbyByCode(req.params.code);
  if (!lobby) return res.status(404).send("Lobby not found.");

  const player = await removePlayerFromLobby(lobby.id, req.user.id);
  if (!player) return res.status(404).send("You are not in this lobby.");

  const players = await getLobbyPlayers(lobby.id);
  getIO().to(`lobby:${lobby.code}`).emit("lobby:players", players);

  res.send(player);
});

/** Host starts the match: flips lobby status and creates a matches row. */
router.route("/:code/start").post(async (req, res) => {
  const lobby = await getLobbyByCode(req.params.code);
  if (!lobby) return res.status(404).send("Lobby not found.");
  if (lobby.host_id !== req.user.id) {
    return res.status(403).send("Only the host can start the match.");
  }

  const inLobby = await isPlayerInLobby(lobby.id, req.user.id);
  if (!inLobby) return res.status(403).send("You are not in this lobby.");

  await updateLobbyStatus(lobby.id, "in_progress");
  const match = await createMatch(lobby.id);

  getIO().to(`lobby:${lobby.code}`).emit("lobby:match_started", {
    matchId: match.id,
  });

  res.status(201).send(match);
});
