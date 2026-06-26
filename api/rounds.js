import express from "express";
const router = express.Router();
export default router;

import requireUser from "#middleware/requireUser";
import requireBody from "#middleware/requireBody";
import {
  createRound,
  getRoundById,
  getRoundsByMatch,
  getRoundWordOptions,
  chooseWord,
  endRound,
} from "#db/queries/rounds";
import {
  createChatMessage,
  getChatMessagesByRound,
} from "#db/queries/chatMessages";
import { getIO } from "#socket";

router.use(requireUser);

/** List rounds for a match. */
router.route("/match/:matchId").get(async (req, res) => {
  const rounds = await getRoundsByMatch(req.params.matchId);
  res.send(rounds);
});

/** Creates the next round. drawerId is supplied by the caller (turn-order logic lives upstream). */
router
  .route("/match/:matchId")
  .post(requireBody(["roundNumber", "drawerId"]), async (req, res) => {
    const { roundNumber, drawerId, durationSeconds } = req.body;
    const round = await createRound(
      req.params.matchId,
      roundNumber,
      drawerId,
      durationSeconds,
    );

    getIO().to(`match:${req.params.matchId}`).emit("round:created", round);
    res.status(201).send(round);
  });

router.route("/:id").get(async (req, res) => {
  const round = await getRoundById(req.params.id);
  if (!round) return res.status(404).send("Round not found.");

  const wordOptions = await getRoundWordOptions(round.id);
  res.send({ ...round, word_options: wordOptions });
});

router
  .route("/:id/choose-word")
  .post(requireBody(["wordId"]), async (req, res) => {
    const round = await chooseWord(req.params.id, req.body.wordId);
    if (!round) {
      return res.status(400).send("Round not found or word already chosen.");
    }

    getIO().to(`match:${round.match_id}`).emit("round:word_chosen", {
      roundId: round.id,
      status: round.status,
    });
    res.send(round);
  });

router.route("/:id/end").post(async (req, res) => {
  const round = await endRound(req.params.id);
  if (!round) return res.status(404).send("Round not found.");

  getIO().to(`match:${round.match_id}`).emit("round:ended", round);
  res.send(round);
});

/** Chat / guess messages for a round. Storage only — scoring not implemented yet. */
router.route("/:id/messages").get(async (req, res) => {
  const messages = await getChatMessagesByRound(req.params.id);
  res.send(messages);
});

router
  .route("/:id/messages")
  .post(requireBody(["message"]), async (req, res) => {
    const round = await getRoundById(req.params.id);
    if (!round) return res.status(404).send("Round not found.");

    const chatMessage = await createChatMessage(
      round.id,
      req.user.id,
      req.body.message,
    );

    getIO()
      .to(`match:${round.match_id}`)
      .emit("chat:message", {
        ...chatMessage,
        username: req.user.username,
      });

    res.status(201).send(chatMessage);
  });
