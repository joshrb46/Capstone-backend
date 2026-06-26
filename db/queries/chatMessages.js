import db from "#db/client";

/**
 * Stores a chat message / guess attempt for a round.
 * Scoring/correctness logic is intentionally NOT implemented here yet
 * (out of scope for this pass) — is_correct_guess and points_awarded
 * default to false/0 and can be set by future game logic.
 */
export async function createChatMessage(roundId, userId, message) {
  const sql = `
  INSERT INTO chat_messages
    (round_id, user_id, message)
  VALUES
    ($1, $2, $3)
  RETURNING *
  `;
  const {
    rows: [chatMessage],
  } = await db.query(sql, [roundId, userId, message]);
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
