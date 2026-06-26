import express from "express";
const app = express();
export default app;

import usersRouter from "#api/users";
import lobbyRouter from "#api/lobby";
import matchesRouter from "#api/matches";
import roundsRouter from "#api/rounds";
import wordsRouter from "#api/words";
import getUserFromHeader from "#middleware/getUserFromHeader";
import handlePostgresErrors from "#middleware/handlePostgresErrors";
import cors from "cors";
import morgan from "morgan";

app.use(cors({ origin: process.env.CORS_ORIGIN ?? /localhost/ }));

app.use(morgan("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(getUserFromHeader);

app.get("/", (req, res) => res.send("Hello, World!"));

app.use("/users", usersRouter);
app.use("/lobby", lobbyRouter);
app.use("/matches", matchesRouter);
app.use("/rounds", roundsRouter);
app.use("/words", wordsRouter);

app.use(handlePostgresErrors);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Sorry! Something went wrong.");
});
