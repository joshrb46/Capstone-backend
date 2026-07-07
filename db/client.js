import pg from "pg";

const options = { connectionString: process.env.DATABASE_URL };

// Need SSL for external database connection
if (process.env.NODE_ENV === "production") {
  options.ssl = { rejectUnauthorized: false };
}

// A Pool (rather than a single Client) hands out connections from a small
// pool so concurrent requests don't serialize behind one socket. Pool has
// the same .query() API as Client, and manages connecting per-query itself
// — no explicit .connect() call needed at startup.
const db = new pg.Pool(options);
export default db;
