import { createFileRoute } from "@tanstack/react-router";

const GIST_ID = "d44df50f96d68a91d797e79e2443cc91";
const GH_TOKEN = process.env["GH_SYNC_TOKEN"] ?? "";

async function gistHeaders() {
  return {
    Authorization: `Bearer ${GH_TOKEN}`,
    "User-Agent": "MacroTracker",
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
  };
}

export const Route = createFileRoute("/api/sync")({
  server: {
    handlers: {
      // GET /api/sync?key=meals  → returns the stored JSON for that key
      GET: async ({ request }) => {
        if (!GH_TOKEN) return Response.json({ error: "Not configured" }, { status: 500 });
        const url = new URL(request.url);
        const key = url.searchParams.get("key");
        if (!key) return Response.json({ error: "Missing key" }, { status: 400 });

        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          headers: await gistHeaders(),
        });
        if (!res.ok) return Response.json({ error: "Gist read failed" }, { status: 502 });

        const gist = (await res.json()) as {
          files: Record<string, { content: string } | null>;
        };
        const filename = `${key}.json`;
        const file = gist.files[filename];
        if (!file) return Response.json(null);
        try {
          return Response.json(JSON.parse(file.content));
        } catch {
          return Response.json(null);
        }
      },

      // POST /api/sync?key=meals  body: the data object to store
      POST: async ({ request }) => {
        if (!GH_TOKEN) return Response.json({ error: "Not configured" }, { status: 500 });
        const url = new URL(request.url);
        const key = url.searchParams.get("key");
        if (!key) return Response.json({ error: "Missing key" }, { status: 400 });

        const body = await request.json().catch(() => null);
        if (body === null) return Response.json({ error: "Invalid body" }, { status: 400 });

        const filename = `${key}.json`;
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          method: "PATCH",
          headers: await gistHeaders(),
          body: JSON.stringify({
            files: { [filename]: { content: JSON.stringify(body) } },
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("gist patch failed", res.status, t.slice(0, 300));
          return Response.json({ error: "Gist write failed" }, { status: 502 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
