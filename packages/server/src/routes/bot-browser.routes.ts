// ──────────────────────────────────────────────
// Routes: Browser (proxy to character sources)
// ──────────────────────────────────────────────
import type { FastifyInstance } from "fastify";

const CHUB_API_BASE = "https://api.chub.ai";
const CHUB_AVATARS = "https://avatars.charhub.io";

/** Safely proxy-fetch an external URL, returning sanitised JSON. */
async function proxyFetch(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upstream ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function botBrowserRoutes(app: FastifyInstance) {
  // ── Search characters on Chub ──
  app.get<{
    Querystring: {
      q?: string;
      page?: string;
      sort?: string;
      nsfw?: string;
      tags?: string;
      excludeTags?: string;
      asc?: string;
      min_tokens?: string;
      max_tokens?: string;
      require_images?: string;
      require_lore?: string;
      require_expressions?: string;
      require_alternate_greetings?: string;
      max_days_ago?: string;
      special_mode?: string;
      username?: string;
    };
  }>("/chub/search", async (req) => {
    const {
      q = "",
      page = "1",
      sort = "download_count",
      nsfw = "true",
      tags,
      excludeTags,
      asc,
      min_tokens = "50",
      max_tokens,
      require_images,
      require_lore,
      require_expressions,
      require_alternate_greetings,
      max_days_ago,
      special_mode,
      username,
    } = req.query;

    // Build params exactly as Chub API expects them
    const params = new URLSearchParams({
      search: q,
      first: "48",
      page,
      nsfw,
      nsfl: nsfw,
      include_forks: "true",
      venus: "false",
      min_tokens,
    });

    // Sort: only set if not "default" (default = let Chub decide relevance)
    if (sort && sort !== "default") {
      params.set("sort", sort);
    }

    // Ascending sort direction
    if (asc === "true") {
      params.set("asc", "true");
    }

    // Time period filter
    if (max_days_ago && max_days_ago !== "0") {
      params.set("max_days_ago", max_days_ago);
    }

    // Special mode (e.g. "newcomer" for Recent Hits)
    if (special_mode) {
      params.set("special_mode", special_mode);
    }

    // Author/username filter
    if (username) {
      params.set("username", username);
    }

    // Token limits
    if (max_tokens) params.set("max_tokens", max_tokens);

    // Tag filters
    if (tags) params.set("topics", tags);
    if (excludeTags) params.set("excludetopics", excludeTags);

    // Feature filters
    if (require_images === "true") params.set("require_images", "true");
    if (require_lore === "true") params.set("require_lore", "true");
    if (require_expressions === "true") params.set("require_expressions", "true");
    if (require_alternate_greetings === "true") params.set("require_alternate_greetings", "true");

    const data = await proxyFetch(`${CHUB_API_BASE}/search?${params}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return data;
  });

  // ── Get full character data from Chub ──
  app.get<{ Params: { "*": string } }>("/chub/character/*", async (req) => {
    const fullPath = (req.params as Record<string, string>)["*"];
    if (!fullPath) throw new Error("Missing character path");
    const nocache = Date.now();
    const data = await proxyFetch(
      `${CHUB_API_BASE}/api/characters/${encodeURI(fullPath)}?full=true&nocache=${nocache}`,
      { headers: { Accept: "application/json", "Cache-Control": "no-cache" } },
    );
    return data;
  });

  // ── Download character card PNG from Chub (for import) ──
  app.get<{ Params: { "*": string } }>("/chub/download/*", async (req, reply) => {
    const fullPath = (req.params as Record<string, string>)["*"];
    if (!fullPath) throw new Error("Missing character path");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(`${CHUB_AVATARS}/avatars/${encodeURI(fullPath)}/chara_card_v2.png`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      return reply
        .header("Content-Type", "image/png")
        .header("Content-Disposition", `attachment; filename="character.png"`)
        .send(buf);
    } finally {
      clearTimeout(timeout);
    }
  });

  // ── Proxy character avatar images (avoids CORS for thumbnails) ──
  app.get<{ Params: { "*": string } }>("/chub/avatar/*", async (req, reply) => {
    const fullPath = (req.params as Record<string, string>)["*"];
    if (!fullPath) throw new Error("Missing avatar path");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${CHUB_AVATARS}/avatars/${encodeURI(fullPath)}/avatar.webp`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        // Fallback to chara_card_v2.png thumbnail
        const res2 = await fetch(`${CHUB_AVATARS}/avatars/${encodeURI(fullPath)}/chara_card_v2.png`, {
          signal: controller.signal,
        });
        if (!res2.ok) return reply.status(404).send({ error: "Avatar not found" });
        const buf = Buffer.from(await res2.arrayBuffer());
        return reply.header("Content-Type", "image/png").header("Cache-Control", "public, max-age=86400").send(buf);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return reply.header("Content-Type", "image/webp").header("Cache-Control", "public, max-age=86400").send(buf);
    } finally {
      clearTimeout(timeout);
    }
  });
  
  // ════════════════════════════════════════════════
  // JanitorAI Routes
  // ════════════════════════════════════════════════

  const JANITOR_API = "https://janitorai.com/hampter";
  const JANITOR_AUTH = "https://auth.janitorai.com/auth/v1";
  const JANITOR_AVATARS = "https://ella.janitorai.com/bot-avatars";
  const JANITOR_APP_VERSION = "8.3.4";
  const JANITOR_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jbXp4dHpvbW1wbnhreW5kZGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgzNzA3NDAsImV4cCI6MjA0Mzk0Njc0MH0.UfRPni4ga9Lmin8j0JjV5ouuK9bXp8tsqPJ8pMTDDAI";

  // In-memory token storage for JanitorAI session
  let janitorSession: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email: string;
  } | null = null;

  // Helper: get valid access token, auto-refresh if expired
  async function getJanitorToken(): Promise<string | null> {
    if (!janitorSession) return null;
    // Refresh if token expires in less than 60 seconds
    if (Date.now() > (janitorSession.expiresAt - 60_000)) {
      try {
        const res = await fetch(`${JANITOR_AUTH}/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": JANITOR_ANON_KEY,
            "Authorization": `Bearer ${JANITOR_ANON_KEY}`,
          },
          body: JSON.stringify({ refresh_token: janitorSession.refreshToken }),
        });
        if (res.ok) {
          const data = await res.json() as any;
          janitorSession.accessToken = data.access_token;
          janitorSession.refreshToken = data.refresh_token;
          janitorSession.expiresAt = Date.now() + (data.expires_in * 1000);
        } else {
          // Refresh failed, clear session
          janitorSession = null;
          return null;
        }
      } catch {
        janitorSession = null;
        return null;
      }
    }
    return janitorSession.accessToken;
  }

  // ── JanitorAI Login (token paste from cookie) ──
  app.post("/janitor/login", async (req, reply) => {
    const { token } = req.body as { token: string };
    if (!token) return reply.status(400).send({ error: "Auth token required" });

    try {
      // Token from cookie is base64-encoded JSON: base64-eyJ...
      let jsonStr: string;
      if (token.startsWith("base64-")) {
        jsonStr = Buffer.from(token.slice(7), "base64").toString("utf-8");
      } else {
        // Try raw base64 or raw JSON
        try {
          jsonStr = Buffer.from(token, "base64").toString("utf-8");
          JSON.parse(jsonStr); // test if valid
        } catch {
          jsonStr = token; // assume raw JSON
        }
      }

      const session = JSON.parse(jsonStr) as any;
      const accessToken = session.access_token;
      const refreshToken = session.refresh_token;
      const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + ((session.expires_in || 1800) * 1000);

      if (!accessToken) {
        return reply.status(400).send({ error: "No access_token found in session data" });
      }

      // Extract email from the user object in the session data
      const email = session.user?.email || session.user?.user_metadata?.email || "unknown";

      janitorSession = {
        accessToken,
        refreshToken: refreshToken || "",
        expiresAt,
        email,
      };

      return { ok: true, email };
    } catch (err) {
      return reply.status(400).send({ error: "Invalid token format: " + (err as Error).message });
    }
  });

  // ── JanitorAI Logout ──
  app.post("/janitor/logout", async (_req, reply) => {
    if (janitorSession) {
      // Try to notify JanitorAI of logout (best effort)
      try {
        await fetch(`${JANITOR_AUTH}/logout?scope=local`, {
          method: "POST",
          headers: {
            "apikey": JANITOR_ANON_KEY,
            "Authorization": `Bearer ${janitorSession.accessToken}`,
          },
        });
      } catch { /* ignore */ }
    }
    janitorSession = null;
    return { ok: true };
  });

  // ── JanitorAI Session check ──
  app.get("/janitor/session", async () => {
    if (!janitorSession) return { active: false };
    const token = await getJanitorToken();
    if (!token) return { active: false };
    return {
      active: true,
      email: janitorSession.email,
    };
  });

  // ── Search characters on JanitorAI ──
  app.get("/janitor/search", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const page = query.page || "1";
    const sort = query.sort || "popular";
    const search = query.search || "";
    const mode = query.mode || "all";
    const tagId = query.tag_id || "";
    const customTags = query.custom_tags || "";

    const params = new URLSearchParams();
    params.set("page", page);
    params.set("mode", mode);
    params.set("sort", sort);
    params.set("search", search);
    if (tagId) {
      for (const id of tagId.split(",")) {
        params.append("tag_id[]", id.trim());
      }
    }
    if (customTags) {
      for (const tag of customTags.split(",")) {
        params.append("custom_tags[]", tag.trim());
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-app-version": JANITOR_APP_VERSION,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    // Add auth token if logged in
    const token = await getJanitorToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = `${JANITOR_API}/characters?${params.toString()}`;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok) {
          // Retry on 5xx or 429, fail immediately on 4xx
          if (attempt < maxRetries && (res.status >= 500 || res.status === 429)) {
            clearTimeout(timeout);
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          return reply.status(res.status).send({ error: `JanitorAI API error: ${res.status}` });
        }
        return await res.json();
      } catch (err) {
        clearTimeout(timeout);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        if ((err as Error).name === "AbortError") {
          return reply.status(504).send({ error: "Request timed out" });
        }
        return reply.status(500).send({ error: (err as Error).message });
      } finally {
        clearTimeout(timeout);
      }
    }
  });

  // ── Fetch character detail from JanitorAI ──
  app.get<{ Params: { id: string } }>("/janitor/character/:id", async (req, reply) => {
    const charId = req.params.id;
    if (!charId) return reply.status(400).send({ error: "Missing character ID" });

    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-app-version": JANITOR_APP_VERSION,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    // Add auth token if logged in — this is what unlocks character definitions
    const token = await getJanitorToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = `${JANITOR_API}/characters/${charId}`;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok) {
          if (attempt < maxRetries && (res.status >= 500 || res.status === 429)) {
            clearTimeout(timeout);
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          return reply.status(res.status).send({ error: `JanitorAI API error: ${res.status}` });
        }
        return await res.json();
      } catch (err) {
        clearTimeout(timeout);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        if ((err as Error).name === "AbortError") {
          return reply.status(504).send({ error: "Request timed out" });
        }
        return reply.status(500).send({ error: (err as Error).message });
      } finally {
        clearTimeout(timeout);
      }
    }
  });

  // ── Proxy JanitorAI avatar images ──
  app.get<{ Params: { "*": string } }>("/janitor/avatar/*", async (req, reply) => {
    const path = (req.params as Record<string, string>)["*"];
    if (!path) return reply.status(400).send({ error: "Missing avatar path" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${JANITOR_AVATARS}/${path}`, {
        headers: {
          Accept: "image/webp,image/avif,image/apng,image/*,*/*;q=0.8",
          Referer: "https://janitorai.com/",
        },
        signal: controller.signal,
      });
      if (!res.ok) return reply.status(res.status).send({ error: "Avatar not found" });

      const contentType = res.headers.get("content-type") || "image/webp";
      const buffer = Buffer.from(await res.arrayBuffer());

      reply.header("Content-Type", contentType);
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(buffer);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return reply.status(504).send({ error: "Request timed out" });
      }
      return reply.status(500).send({ error: (err as Error).message });
    } finally {
      clearTimeout(timeout);
    }
  });

}
