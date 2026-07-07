/** Requires req.user to be the drawer of req.round. Run after requireRound. */
export default function requireDrawer(req, res, next) {
  if (req.round.drawer_id !== req.user.id) {
    return res.status(403).send("Only the drawer can do that.");
  }
  next();
}
