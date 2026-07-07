import { getRoundById } from "#db/queries/rounds";

/**
 * Loads the round referenced by req.params.id onto req.round, 404ing if it
 * doesn't exist. Run before requireMatchPlayer/requireDrawer on routes
 * keyed by round id so those middlewares can read req.round.match_id /
 * req.round.drawer_id instead of re-querying.
 */
export default async function requireRound(req, res, next) {
  try {
    const round = await getRoundById(req.params.id);
    if (!round) return res.status(404).send("Round not found.");
    req.round = round;
    next();
  } catch (e) {
    next(e);
  }
}
