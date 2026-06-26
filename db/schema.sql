DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS round_word_options;
DROP TABLE IF EXISTS rounds;
DROP TABLE IF EXISTS match_players;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS lobby_players;
DROP TABLE IF EXISTS lobby;
DROP TABLE IF EXISTS words;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS kick_player;

-- USERS

-- A "user" is created the moment someone picks a username +
-- avatar. No login required; ties to a browser session token.
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    session_token UUID NOT NULL DEFAULT gen_random_uuid(), -- stored in client cookie/localStorage
    username      TEXT NOT NULL,
    avatar_type   TEXT NOT NULL DEFAULT 'preset'
                  CHECK (avatar_type IN ('preset', 'custom')),
    -- preset  -> a key like 'fox', 'robot', 'cat' (mapped to an icon in the frontend)
    -- custom  -> a data URL / S3 path / base64 PNG of the user's own drawing
    avatar_value  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_session_token ON users(session_token);

-- Lobby
CREATE TABLE lobby (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,        -- shareable join code, e.g. "K3F9QZ"
    host_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'lobby'
                CHECK (status IN ('lobby', 'in_progress', 'finished')),
    max_rounds  INTEGER NOT NULL DEFAULT 6,
    win_score   INTEGER NOT NULL DEFAULT 4,
    is_private  BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks who is currently sitting in a lobby (independent of
-- any specific match), used to render the lobby/player list.
CREATE TABLE lobby_players (
    id          SERIAL PRIMARY KEY,
    lobby_id    INTEGER NOT NULL REFERENCES lobby(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_host     BOOLEAN NOT NULL DEFAULT false,
    connected   BOOLEAN NOT NULL DEFAULT true,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lobby_id, user_id)
);

CREATE INDEX idx_lobby_players_lobby ON lobby_players(lobby_id);

-- WORD BANK
CREATE TABLE words (
    id         SERIAL PRIMARY KEY,
    text       TEXT NOT NULL UNIQUE,
    category   TEXT DEFAULT 'general',
    difficulty SMALLINT DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3)
);

-- MATCHES
-- One full game played inside a lobby. Host clicking "new game"
-- after a podium creates a brand-new row here, host is able to create new game and stay in same lobby.
CREATE TABLE matches (
    id          SERIAL PRIMARY KEY,
    lobby_id    INTEGER NOT NULL REFERENCES lobby(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress', 'finished')),
    winner_id   INTEGER REFERENCES users(id),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ
);

CREATE INDEX idx_matches_lobby ON matches(lobby_id);

-- Score belongs to a match (not the lobby) so history/podiums
-- for past games are preserved when a new match starts.
CREATE TABLE match_players (
    id         SERIAL PRIMARY KEY,
    match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score      INTEGER NOT NULL DEFAULT 0,
    final_rank SMALLINT, -- 1st, 2nd, 3rd... filled in when match ends, powers the podium
    UNIQUE (match_id, user_id)
);

-- ROUNDS
CREATE TABLE rounds (
    id                 SERIAL PRIMARY KEY,
    match_id           INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    round_number       SMALLINT NOT NULL,           -- 1, 2, 3
    drawer_id          INTEGER NOT NULL REFERENCES users(id),
    word_id            INTEGER REFERENCES words(id), -- null until drawer picks
    status             TEXT NOT NULL DEFAULT 'choosing_word'
                       CHECK (status IN ('choosing_word', 'drawing', 'round_end')),
    started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    drawing_started_at TIMESTAMPTZ,
    ended_at           TIMESTAMPTZ,
    duration_seconds   INTEGER DEFAULT 80
);

CREATE INDEX idx_rounds_match ON rounds(match_id);

-- The 3 word choices offered to the drawer for a given round.
CREATE TABLE round_word_options (
    id       SERIAL PRIMARY KEY,
    round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    word_id  INTEGER NOT NULL REFERENCES words(id),
    UNIQUE (round_id, word_id)
);

-- CHAT / GUESSES
-- Every chat message AND every guess attempt lands here.
-- is_correct_guess + points_awarded let the frontend render
-- "Alex guessed the word!" vs a normal chat bubble.
CREATE TABLE chat_messages (
    id               BIGSERIAL PRIMARY KEY,
    round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    message          TEXT NOT NULL,
    is_correct_guess BOOLEAN NOT NULL DEFAULT false,
    points_awarded   INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_round_created ON chat_messages(round_id, created_at);

CREATE FUNCTION kick_player(
    p_lobby_id   INTEGER,
    p_host_id    INTEGER,
    p_target_id  INTEGER
) 