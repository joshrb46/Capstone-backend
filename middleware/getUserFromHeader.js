import { getUserBySessionToken } from "#db/queries/users";

/**
 * Attaches the user to the request if a valid x-session-token header is
 * provided. The token is the UUID issued in POST /users' response — the
 * client stores it and resends it on every subsequent request. Using the
 * random session_token (rather than the sequential numeric id) means a
 * request can't be forged just by guessing/incrementing another user's id.
 */
export default async function getUserFromHeader(req, res, next) {
  const sessionToken = req.get("x-session-token");
  if (!sessionToken) return next();

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(sessionToken)) {
    return res.status(400).send("x-session-token header must be a UUID.");
  }

  try {
    const user = await getUserBySessionToken(sessionToken);
    if (user) req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}
