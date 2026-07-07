# Pictionary Backend

Express + PostgreSQL + Socket.IO backend for a multiplayer Pictionary-style
drawing/guessing game.

## Auth model

There's no password. A "user" is created by picking a username + avatar
(`POST /users`). The response includes a `session_token` (random UUID),
which the client stores and sends back as an `x-session-token` header on
every subsequent request. The numeric `id` is fine to use for routing
(`GET /users/:id`, etc.) but is never accepted as a credential, since
sequential ids are guessable — only the session token authenticates a
request. There is no JWT in this version — see the comments in
`middleware/getUserFromHeader.js` if you want to swap in a signed token
later.

## Setup

```bash
npm install
cp example.env .env   # then fill in DATABASE_URL etc.
npm run db:reset       # drops/recreates schema and seeds sample data
npm run dev
```

The seed script prints a sample lobby join code on success.

## REST API

| Method | Path                      | Notes                                                               |
| ------ | ------------------------- | ------------------------------------------------------------------- |
| POST   | `/users`                  | body: `{ username, avatarType, avatarValue }`                       |
| GET    | `/users/:id`              |                                                                     |
| POST   | `/lobby`                  | requires `x-user-id`. body: `{ maxRounds?, winScore?, isPrivate? }` |
| GET    | `/lobby/:code`            | lobby + current players                                             |
| POST   | `/lobby/:code/players`    | join a lobby                                                        |
| DELETE | `/lobby/:code/players/me` | leave a lobby                                                       |
| POST   | `/lobby/:code/start`      | host-only, creates a `matches` row                                  |
| GET    | `/matches/:id`            | match + player scores                                               |
| POST   | `/matches/:id/end`        | host-only, ranks players, sets winner                               |
| GET    | `/rounds/match/:matchId`  | list rounds for a match                                             |
| POST   | `/rounds/match/:matchId`  | body: `{ roundNumber, drawerId, durationSeconds? }`                 |
| GET    | `/rounds/:id`             | round + its 3 word options                                          |
| POST   | `/rounds/:id/choose-word` | drawer picks a word, moves round to `drawing`                       |
| POST   | `/rounds/:id/end`         |                                                                     |
| GET    | `/rounds/:id/messages`    | chat/guess history for a round                                      |
| POST   | `/rounds/:id/messages`    | post a chat message / guess                                         |
| GET    | `/words`                  | list word bank                                                      |
| POST   | `/words`                  | body: `{ text, category?, difficulty? }`                            |

## Scoring

Scoring is wired up: a chat message counts as a guess attempt only while
its round is `drawing` and the sender isn't the drawer. A correct guess
(exact match against the round's chosen word, case/whitespace-insensitive)
scores once per user per round — re-sending the word again afterward is
just stored as an ordinary message.

Points are time-based: guessing right after the word is chosen is worth up
to 100, decaying linearly to a floor of 10 as the round's timer runs out.
The drawer also earns a smaller bonus (20% of the guesser's points, floor
5) each time someone guesses correctly. Both updates happen in the same
DB transaction as the chat-message insert, so a message is never stored
without its score being applied (or vice versa).

To avoid the chat log being a built-in cheat sheet, the literal text of a
correct guess is hidden from everyone except the drawer and the guesser
while the round is still in progress — both in the live `chat:message`
broadcast and in `GET /rounds/:id/messages` history. Other players instead
see `"<username> guessed the word!"`. Once the round ends, full history is
visible to everyone in that match. A `round:correct_guess` event also
fires (over Socket.IO) with the points awarded, useful for toast
notifications without needing to parse chat text.

**Still out of scope:** rounds don't auto-advance to `round_end` when
someone guesses correctly — that's still a manual `POST /rounds/:id/end`
call. Turn order across rounds also isn't enforced; `drawerId` is supplied
by the caller.

## Socket.IO

Connect, then:

- `identify` `{ sessionToken }` — required before anything else
- `lobby:join` `{ code }` — joins the lobby's realtime room, broadcasts `lobby:players`
- `lobby:match_started` *(server → client)* — broadcast to the lobby room when the host starts the match, carries `{ matchId }` so joined clients know when/where to navigate
- `match:join` / `match:leave` `{ matchId }` — joins the match room so the client
  receives `round:created`, `round:word_chosen`, `round:ended`, `chat:message`,
  `round:correct_guess`, and `match:ended` events, which the REST routes above also emit
- `chat:send` `{ roundId, message }` — socket-native alternative to the REST
  chat endpoint; also scores the guess if it's correct

On disconnect, the player is marked disconnected in their lobby and an
updated `lobby:players` list is broadcast.
