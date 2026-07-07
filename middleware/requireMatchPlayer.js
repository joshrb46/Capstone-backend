import { isPlayerInMatch } from "#db/queries/matches";

/**
 * Confirms req.user is a player in the relevant match before allowing
 * round/match actions — without this, any logged-in user could act on a
 * match they were never part of.
 *
 * getMatchId(req) extracts the match id for the request: either directly
 * from req.params.matchId, or (for routes keyed by round id) from
 * req.round.match_id once requireRound has already run.
 */
export default function requireMatchPlayer(getMatchId) {
  return async (req, res, next) => {
    try {
      const matchId = getMatchId(req);
      if (!matchId) return res.status(404).send("Match not found.");

      const isMember = await isPlayerInMatch(matchId, req.user.id);
      if (!isMember) {
        return res.status(403).send("You are not a player in this match.");
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
