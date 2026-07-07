import db from "#db/client";
import { getRandomWords } from "#db/queries/words";

/**
 * Creates a new round for a match, picks a drawer, and offers 3 random
 * word choices. Drawer/word selection logic stays at the "skeleton" level
 * per scope — no turn-order or scoring rules enforced here yet.
 */
export async function createRound(
  matchId,
  roundNumber,
  drawerId,
  durationSeconds = 80,
) {
  const sql = `
  INSERT INTO rounds
    (match_id, round_number, drawer_id, duration_seconds)
  VALUES
    ($1, $2, $3, $4)
  RETURNING *
  `;
  const {
    rows: [round],
  } = await db.query(sql, [matchId, roundNumber, drawerId, durationSeconds]);

  const options = await getRandomWords(3);
  for (const word of options) {
    await db.query(
      `INSERT INTO round_word_options (round_id, word_id) VALUES ($1, $2)`,
      [round.id, word.id],
    );
  }

  return { ...round, word_options: options };
}

export async function getRoundById(id) {
  const sql = `SELECT * FROM rounds WHERE id = $1`;
  const {
    rows: [round],
  } = await db.query(sql, [id]);
  return round;
}

export async function getRoundsByMatch(matchId) {
  const sql = `
  SELECT * FROM rounds
  WHERE match_id = $1
  ORDER BY round_number ASC
  `;
  const { rows } = await db.query(sql, [matchId]);
  return rows;
}

export async function getRoundWordOptions(roundId) {
  const sql = `
  SELECT round_word_options.id AS option_id, words.*
  FROM round_word_options
  JOIN words ON words.id = round_word_options.word_id
  WHERE round_word_options.round_id = $1
  `;
  const { rows } = await db.query(sql, [roundId]);
  return rows;
}

/** Drawer picks a word; moves round into the 'drawing' state. */
export async function chooseWord(roundId, wordId) {
  const sql = `
  UPDATE rounds
  SET word_id = $2, status = 'drawing', drawing_started_at = now()
  WHERE id = $1 AND status = 'choosing_word'
  RETURNING *
  `;
  const {
    rows: [round],
  } = await db.query(sql, [roundId, wordId]);
  return round;
}

export async function endRound(roundId) {
  const sql = `
  UPDATE rounds
  SET status = 'round_end', ended_at = now()
  WHERE id = $1
  RETURNING *
  `;
  const {
    rows: [round],
  } = await db.query(sql, [roundId]);
  return round;
}
