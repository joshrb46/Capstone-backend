import express from "express";
const router = express.Router();
export default router;

import { createUser, getUserById } from "#db/queries/users";
import requireBody from "#middleware/requireBody";

router
  .route("/")
  .post(
    requireBody(["username", "avatarType", "avatarValue"]),
    async (req, res) => {
      const { username, avatarType, avatarValue } = req.body;

      if (!["preset", "custom"].includes(avatarType)) {
        return res.status(400).send("avatarType must be 'preset' or 'custom'.");
      }

      const user = await createUser(username, avatarType, avatarValue);
      // Client stores user.session_token and sends it back as the
      // x-session-token header on subsequent requests. No password / JWT
      // in this app. This is the only response that includes the token.
      res.status(201).send(user);
    },
  );

router.route("/:id").get(async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) return res.status(404).send("User not found.");
  // Never expose another user's session_token via the public lookup route.
  const { session_token, ...publicUser } = user;
  res.send(publicUser);
});
