import db from "#db/client";

/** Creates a match for a lobby and seeds match_players from current lobby players. */
export async function createMatch(lobbyId) {
  const sql = `
  INSERT INTO matches
    (lobby_id)
  VALUES
    ($1)
  RETURNING *
  `;
  const {
    rows: [match],
  } = await db.query(sql, [lobbyId]);

  const seedSql = `
  INSERT INTO match_players
    (match_id, user_id)
  SELECT $1, user_id
  FROM lobby_players
  WHERE lobby_id = $2 AND connected = true
  `;
  await db.query(seedSql, [match.id, lobbyId]);

  return match;
}

export async function getMatchById(id) {
  const sql = `SELECT * FROM matches WHERE id = $1`;
  const {
    rows: [match],
  } = await db.query(sql, [id]);
  return match;
}

export async function getMatchesByLobby(lobbyId) {
  const sql = `
  SELECT * FROM matches
  WHERE lobby_id = $1
  ORDER BY started_at DESC
  `;
  const { rows } = await db.query(sql, [lobbyId]);
  return rows;
}

export async function getMatchPlayers(matchId) {
  const sql = `
  SELECT match_players.*, users.username, users.avatar_type, users.avatar_value
  FROM match_players
  JOIN users ON users.id = match_players.user_id
  WHERE match_players.match_id = $1
  ORDER BY match_players.score DESC
  `;
  const { rows } = await db.query(sql, [matchId]);
  return rows;
}

export async function incrementScore(matchId, userId, points) {
  const sql = `
  UPDATE match_players
  SET score = score + $3
  WHERE match_id = $1 AND user_id = $2
  RETURNING *
  `;
  const {
    rows: [player],
  } = await db.query(sql, [matchId, userId, points]);
  return player;
}

/** Ends a match and assigns final_rank based on score (1 = highest). */
export async function endMatch(matchId) {
  const rankSql = `
  WITH ranked AS (
    SELECT user_id, RANK() OVER (ORDER BY score DESC) AS rnk
    FROM match_players
    WHERE match_id = $1
  )
  UPDATE match_players
  SET final_rank = ranked.rnk
  FROM ranked
  WHERE match_players.match_id = $1
    AND match_players.user_id = ranked.user_id
  `;
  await db.query(rankSql, [matchId]);

  const winnerSql = `
  SELECT user_id FROM match_players
  WHERE match_id = $1 AND final_rank = 1
  LIMIT 1
  `;
  const {
    rows: [winner],
  } = await db.query(winnerSql, [matchId]);

  const sql = `
  UPDATE matches
  SET status = 'finished', ended_at = now(), winner_id = $2
  WHERE id = $1
  RETURNING *
  `;
  const {
    rows: [match],
  } = await db.query(sql, [matchId, winner?.user_id ?? null]);
  return match;
}
