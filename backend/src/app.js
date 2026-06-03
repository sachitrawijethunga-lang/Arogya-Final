import express from "express";
import { clinicsRouter } from "./routes/clinics.js";
import { registrationRouter } from "./routes/registration.js";

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/clinics", clinicsRouter(db));
  app.use("/registration", registrationRouter(db));

  // Error handler (must be last, 4 args).
  app.use((err, _req, res, _next) => {
    if (err && err.type === "entity.parse.failed") {
      res.status(400).type("text/plain").send("Invalid JSON body.");
      return;
    }
    console.error(err);
    res.status(500).type("text/plain").send("Internal server error.");
  });

  return app;
}
