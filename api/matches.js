import express from "express";
const router = express.Router();
export default router;

import requireUser from "#middleware/requireUser";
import {
  isPlayerInMatch,
  getMatchById,
  getMatchPlayers,
  endMatch,
} from "#db/queries/matches";
import { getLobbyById } from "#db/queries/lobby";
import { getIO } from "#socket";

router.use(requireUser);

router.route("/:id").get(async (req, res) => {
  const match = await getMatchById(req.params.id);
  if (!match) return res.status(404).send("Match not found.");

  const isMember = await isPlayerInMatch(match.id, req.user.id);
  if (!isMember) {
    return res.status(403).send("You are not a player in this match.");
  }

  const players = await getMatchPlayers(match.id);
  res.send({ ...match, players });
});

router.route("/:id/end").post(async (req, res) => {
  const match = await getMatchById(req.params.id);
  if (!match) return res.status(404).send("Match not found.");

  const lobby = await getLobbyById(match.lobby_id);
  if (lobby.host_id !== req.user.id) {
    return res.status(403).send("Only the host can end the match.");
  }

  const ended = await endMatch(match.id);
  const players = await getMatchPlayers(match.id);

  getIO()
    .to(`match:${match.id}`)
    .emit("match:ended", { ...ended, players });

  res.send(ended);
});
