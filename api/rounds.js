import express from "express";
const router = express.Router();
export default router;

import requireUser from "#middleware/requireUser";
import requireBody from "#middleware/requireBody";
import requireRound from "#middleware/requireRound";
import requireMatchPlayer from "#middleware/requireMatchPlayer";
import requireDrawer from "#middleware/requireDrawer";
import {
  createRound,
  getRoundsByMatch,
  getRoundWordOptions,
  chooseWord,
  endRound,
} from "#db/queries/rounds";
import { getChatMessagesByRound } from "#db/queries/chatMessages";
import { submitGuess } from "#db/queries/scoring";
import { getWordById } from "#db/queries/words";
import { maskMessageForViewer } from "#lib/scoring";
import { getIO } from "#socket";

router.use(requireUser);

/** List rounds for a match. Only players in the match can see them. */
router.route("/match/:matchId").get(
  requireMatchPlayer((req) => req.params.matchId),
  async (req, res) => {
    const rounds = await getRoundsByMatch(req.params.matchId);
    res.send(rounds);
  },
);

/** Creates the next round. drawerId is supplied by the caller (turn-order logic lives upstream). */
router.route("/match/:matchId").post(
  requireBody(["roundNumber", "drawerId"]),
  requireMatchPlayer((req) => req.params.matchId),
  async (req, res) => {
    const { roundNumber, drawerId, durationSeconds } = req.body;
    const round = await createRound(
      req.params.matchId,
      roundNumber,
      drawerId,
      durationSeconds,
    );

    getIO().to(`match:${req.params.matchId}`).emit("round:created", round);
    res.status(201).send(round);
  },
);

// Word options reveal the answer to the drawer's word — only players in
// the match (i.e. potential guessers/drawer) should be able to see them.
router.route("/:id").get(
  requireRound,
  requireMatchPlayer((req) => req.round.match_id),
  async (req, res) => {
    const wordOptions = await getRoundWordOptions(req.round.id);
    res.send({ ...req.round, word_options: wordOptions });
  },
);

router.route("/:id/choose-word").post(
  requireBody(["wordId"]),
  requireRound,
  requireMatchPlayer((req) => req.round.match_id),
  requireDrawer,
  async (req, res) => {
    const round = await chooseWord(req.params.id, req.body.wordId);
    if (!round) {
      return res.status(400).send("Round not found or word already chosen.");
    }

    getIO().to(`match:${round.match_id}`).emit("round:word_chosen", {
      roundId: round.id,
      status: round.status,
    });
    res.send(round);
  },
);

router.route("/:id/end").post(
  requireRound,
  requireMatchPlayer((req) => req.round.match_id),
  async (req, res) => {
    const round = await endRound(req.params.id);
    getIO().to(`match:${round.match_id}`).emit("round:ended", round);
    res.send(round);
  },
);

/** Chat / guess messages for a round. Storage only — scoring not implemented yet. */
router.route("/:id/messages").get(
  requireRound,
  requireMatchPlayer((req) => req.round.match_id),
  async (req, res) => {
    const messages = await getChatMessagesByRound(req.round.id);
    res.send(
      messages.map((m) => maskMessageForViewer(m, req.user.id, req.round)),
    );
  },
);

router.route("/:id/messages").post(
  requireBody(["message"]),
  requireRound,
  requireMatchPlayer((req) => req.round.match_id),
  async (req, res) => {
    const word = req.round.word_id
      ? await getWordById(req.round.word_id)
      : null;

    const { chatMessage, correct, points, drawerBonus } = await submitGuess({
      round: req.round,
      word,
      userId: req.user.id,
      message: req.body.message,
    });

    const payload = { ...chatMessage, username: req.user.username };

    // Broadcast a masked copy to the room — anyone who isn't the drawer
    // or the guesser shouldn't be able to read the answer off the live
    // feed. The sender gets the unmasked version below since they
    // already know what they typed.
    getIO()
      .to(`match:${req.round.match_id}`)
      .emit("chat:message", maskMessageForViewer(payload, null, req.round));

    if (correct) {
      getIO().to(`match:${req.round.match_id}`).emit("round:correct_guess", {
        roundId: req.round.id,
        userId: req.user.id,
        username: req.user.username,
        points,
        drawerBonus,
      });
    }

    res.status(201).send(payload);
  },
);
