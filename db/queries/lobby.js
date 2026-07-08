import db from "#db/client";

function generateCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Creates a lobby hosted by the given user and seats them as a player. */
export async function createLobby(hostId, options = {}) {
  const { maxRounds = 6, winScore = 500, isPrivate = true } = options;

  // Retry on the rare unique-code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const sql = `
      INSERT INTO lobby
        (code, host_id, max_rounds, win_score, is_private)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING *
      `;
      const {
        rows: [lobby],
      } = await db.query(sql, [code, hostId, maxRounds, winScore, isPrivate]);

      await addPlayerToLobby(lobby.id, hostId, true);
      return lobby;
    } catch (e) {
      if (e.code === "23505") continue; // unique_violation on code, retry
      throw e;
    }
  }
  throw new Error("Could not generate a unique lobby code, please retry.");
}

export async function getLobbyById(id) {
  const sql = `SELECT * FROM lobby WHERE id = $1`;
  const {
    rows: [lobby],
  } = await db.query(sql, [id]);
  return lobby;
}

export async function getLobbyByCode(code) {
  const sql = `SELECT * FROM lobby WHERE code = $1`;
  const {
    rows: [lobby],
  } = await db.query(sql, [code.toUpperCase()]);
  return lobby;
}

export async function updateLobbyStatus(id, status) {
  const sql = `
  UPDATE lobby
  SET status = $2
  WHERE id = $1
  RETURNING *
  `;
  const {
    rows: [lobby],
  } = await db.query(sql, [id, status]);
  return lobby;
}

export async function addPlayerToLobby(lobbyId, userId, isHost = false) {
  const sql = `
  INSERT INTO lobby_players
    (lobby_id, user_id, is_host)
  VALUES
    ($1, $2, $3)
  ON CONFLICT (lobby_id, user_id)
    DO UPDATE SET connected = true
  RETURNING *
  `;
  const {
    rows: [player],
  } = await db.query(sql, [lobbyId, userId, isHost]);
  return player;
}

export async function setPlayerConnected(lobbyId, userId, connected) {
  const sql = `
  UPDATE lobby_players
  SET connected = $3
  WHERE lobby_id = $1 AND user_id = $2
  RETURNING *
  `;
  const {
    rows: [player],
  } = await db.query(sql, [lobbyId, userId, connected]);
  return player;
}

export async function removePlayerFromLobby(lobbyId, userId) {
  const sql = `
  DELETE FROM lobby_players
  WHERE lobby_id = $1 AND user_id = $2
  RETURNING *
  `;
  const {
    rows: [player],
  } = await db.query(sql, [lobbyId, userId]);
  return player;
}

export async function getLobbyPlayers(lobbyId) {
  const sql = `
  SELECT lobby_players.*, users.username, users.avatar_type, users.avatar_value
  FROM lobby_players
  JOIN users ON users.id = lobby_players.user_id
  WHERE lobby_players.lobby_id = $1
  ORDER BY lobby_players.joined_at ASC
  `;
  const { rows } = await db.query(sql, [lobbyId]);
  return rows;
}

export async function isPlayerInLobby(lobbyId, userId) {
  const sql = `
  SELECT 1
  FROM lobby_players
  WHERE lobby_id = $1 AND user_id = $2
  `;
  const { rows } = await db.query(sql, [lobbyId, userId]);
  return rows.length > 0;
}
