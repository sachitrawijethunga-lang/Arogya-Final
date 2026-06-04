import { openDb } from "./db.js";
import { createApp } from "./app.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 4000;

const db = openDb();
const app = createApp(db);

const server = app.listen(PORT, HOST, () => {
  console.log(`Arogya backend listening on http://${HOST}:${PORT}`);
});

// On deploy/reboot pm2 sends SIGTERM: stop accepting, finish in-flight,
// then close the DB so WAL is checkpointed cleanly.
function shutdown(signal) {
  console.log(`[arogya] ${signal} received, shutting down`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
