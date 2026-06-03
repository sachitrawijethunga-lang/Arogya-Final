import { openDb } from "./db.js";
import { createApp } from "./app.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 4000;

const db = openDb();
const app = createApp(db);

app.listen(PORT, HOST, () => {
  console.log(`Arogya backend listening on http://${HOST}:${PORT}`);
});
