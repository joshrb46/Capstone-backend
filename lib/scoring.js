/**
 * Pure helpers for guess-correctness and point calculation. Kept free of
 * DB access so they're easy to unit test and reuse from both the REST
 * route and the socket "chat:send" path.
 */

/** Lowercase + trim + collapse whitespace so "  Cat " matches "cat". */
function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact match (post-normalization) against the round's chosen word. */
export function isCorrectGuess(wordText, message) {
  if (!wordText) return false;
  return normalize(message) === normalize(wordText);
}

const BASE_POINTS = 100;
const MIN_POINTS = 10;
const DRAWER_BONUS_RATE = 0.2; // drawer earns 20% of each correct guesser's points
const MIN_DRAWER_BONUS = 5;

/**
 * Guesser's points scale down linearly with elapsed time, so guessing
 * immediately after the word is chosen is worth more than guessing with
 * one second left. Falls back to MIN_POINTS if timing data is missing.
 */
export function computeGuesserPoints(round, now = new Date()) {
  const duration = round.duration_seconds ?? 80;
  if (!round.drawing_started_at) return MIN_POINTS;

  const elapsedSeconds = (now - new Date(round.drawing_started_at)) / 1000;
  const remainingFraction = clamp(1 - elapsedSeconds / duration, 0, 1);

  return Math.max(MIN_POINTS, Math.round(BASE_POINTS * remainingFraction));
}

/** Drawer earns a smaller bonus each time someone guesses their word. */
export function computeDrawerBonus(guesserPoints) {
  return Math.max(
    MIN_DRAWER_BONUS,
    Math.round(guesserPoints * DRAWER_BONUS_RATE),
  );
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Hides the literal text of an already-correct guess from everyone except
 * the drawer and the guesser while the round is still live — otherwise
 * reading the chat log (or watching the live feed) would just hand
 * everyone else the answer. Once the round ends, full history is safe to
 * reveal to all viewers. Pass viewerId = null to always mask (used for
 * the room-wide socket broadcast, where the recipient isn't known).
 */
export function maskMessageForViewer(message, viewerId, round) {
  if (!message.is_correct_guess) return message;
  if (round.status !== "drawing") return message;
  if (
    viewerId != null &&
    (viewerId === round.drawer_id || viewerId === message.user_id)
  ) {
    return message;
  }
  return { ...message, message: `${message.username} guessed the word!` };
}
