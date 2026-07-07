import express from "express";
const router = express.Router();
export default router;

import requireUser from "#middleware/requireUser";
import {
  isPlayerInMatch,
  getMatchById,
  getMatchesByLobby,
  getMatchPlayers,
  endMatch,
} from "#db/queries/matches";
import { getLobbyById, isPlayerInLobby } from "#db/queries/lobby";
import { getIO } from "#socket";

router.use(requireUser);

/** Most recent match for a lobby — lets a client that (re)loads the page
 * recover the active/last match id without having caught the socket event. */
router.route("/lobby/:lobbyId").get(async (req, res) => {
  const inLobby = await isPlayerInLobby(req.params.lobbyId, req.user.id);
  if (!inLobby)
    return res.status(403).send("You are not a player in this lobby.");

  const matches = await getMatchesByLobby(req.params.lobbyId);
  if (matches.length === 0)
    return res.status(404).send("No matches for this lobby yet.");
  res.send(matches[0]);
});

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
