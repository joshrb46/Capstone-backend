import http from "node:http";
import app from "#app";
import db from "#db/client";
import { initSocket } from "#socket";

const PORT = process.env.PORT ?? 3000;

// Sanity-check the connection string at startup rather than waiting for
// the first request to fail. Pool itself connects lazily per-query.
await db.query("SELECT 1");

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Listening on port ${PORT}...`);
});
