// ──────────────────────────────────────────────
// Server Entry Point
// ──────────────────────────────────────────────
import "dotenv/config";
import { readFileSync } from "fs";
import { buildApp } from "./app.js";

const PORT = parseInt(process.env.PORT ?? "7860", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

function loadTlsOptions() {
  const cert = process.env.SSL_CERT;
  const key = process.env.SSL_KEY;
  if (!cert || !key) return null;
  return {
    cert: readFileSync(cert),
    key: readFileSync(key),
  };
}

async function main() {
  const tls = loadTlsOptions();
  const app = await buildApp(tls ?? undefined);
  const protocol = tls ? "https" : "http";

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Marinara Engine server listening on ${protocol}://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
