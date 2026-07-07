import db from "#db/client";

/**
 * Stores a chat message / guess attempt for a round. Pass isCorrectGuess /
 * pointsAwarded once scoring logic (lib/scoring.js, wired up in
 * api/rounds.js) has determined them — both default to false/0 for plain
 * chat messages or incorrect guesses.
 */
export async function createChatMessage(
  roundId,
  userId,
  message,
  { isCorrectGuess = false, pointsAwarded = 0 } = {},
) {
  const sql = `
  INSERT INTO chat_messages
    (round_id, user_id, message, is_correct_guess, points_awarded)
  VALUES
    ($1, $2, $3, $4, $5)
  RETURNING *
  `;
  const {
    rows: [chatMessage],
  } = await db.query(sql, [
    roundId,
    userId,
    message,
    isCorrectGuess,
    pointsAwarded,
  ]);
  return chatMessage;
}

export async function getChatMessagesByRound(roundId) {
  const sql = `
  SELECT chat_messages.*, users.username
  FROM chat_messages
  JOIN users ON users.id = chat_messages.user_id
  WHERE chat_messages.round_id = $1
  ORDER BY chat_messages.created_at ASC
  `;
  const { rows } = await db.query(sql, [roundId]);
  return rows;
}

/** True if this user already has a scored correct guess for this round (prevents double-dipping). */
export async function hasGuessedCorrectly(roundId, userId) {
  const sql = `
  SELECT 1 FROM chat_messages
  WHERE round_id = $1 AND user_id = $2 AND is_correct_guess = true
  `;
  const { rows } = await db.query(sql, [roundId, userId]);
  return rows.length > 0;
}
