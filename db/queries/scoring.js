import db from "#db/client";
import { hasGuessedCorrectly } from "#db/queries/chatMessages";
import {
  computeGuesserPoints,
  computeDrawerBonus,
  isCorrectGuess,
} from "#lib/scoring";

/**
 * Inserts a chat message and, if it's a correct first-time guess, awards
 * points to both the guesser and the drawer — all inside one transaction
 * so the stored message and the score it earned can never drift apart
 * (e.g. a crash between "insert message" and "award points").
 *
 * `word` should be the round's chosen word row (or null if none chosen
 * yet). Returns the stored chat message plus scoring details.
 */
export async function submitGuess({ round, word, userId, message }) {
  const isDrawer = userId === round.drawer_id;
  const isLive = round.status === "drawing" && word;

  let correct = false;
  if (isLive && !isDrawer && isCorrectGuess(word.text, message)) {
    // Only the first correct guess per user per round scores — re-typing
    // the word afterward is just stored as a normal (uncorrect) message.
    correct = !(await hasGuessedCorrectly(round.id, userId));
  }

  const points = correct ? computeGuesserPoints(round) : 0;
  const drawerBonus = correct ? computeDrawerBonus(points) : 0;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const {
      rows: [chatMessage],
    } = await client.query(
      `INSERT INTO chat_messages
        (round_id, user_id, message, is_correct_guess, points_awarded)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [round.id, userId, message, correct, points],
    );

    let allGuessersCorrect = false;

    if (correct) {
      await client.query(
        `UPDATE match_players SET score = score + $3 WHERE match_id = $1 AND user_id = $2`,
        [round.match_id, userId, points],
      );
      await client.query(
        `UPDATE match_players SET score = score + $3 WHERE match_id = $1 AND user_id = $2`,
        [round.match_id, round.drawer_id, drawerBonus],
      );

      // Once every non-drawer player in the match has correctly guessed
      // this round's word, there's no reason to keep waiting on the
      // clock — let the caller end the round immediately.
      const {
        rows: [{ count: totalGuessers }],
      } = await client.query(
        `SELECT COUNT(*)::int AS count FROM match_players
         WHERE match_id = $1 AND user_id != $2`,
        [round.match_id, round.drawer_id],
      );
      const {
        rows: [{ count: correctGuessers }],
      } = await client.query(
        `SELECT COUNT(DISTINCT user_id)::int AS count FROM chat_messages
         WHERE round_id = $1 AND is_correct_guess = true`,
        [round.id],
      );
      allGuessersCorrect = totalGuessers > 0 && correctGuessers >= totalGuessers;
    }

    await client.query("COMMIT");
    return { chatMessage, correct, points, drawerBonus, allGuessersCorrect };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
