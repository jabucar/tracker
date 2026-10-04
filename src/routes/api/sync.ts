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

function extractNumber(val: unknown): number {
  if (typeof val === "number") return Math.round(val);
  if (typeof val === "string") {
    const clean = val.replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed);
  }
  if (Array.isArray(val)) {
    return val.reduce((acc: number, item: unknown) => acc + extractNumber(item), 0);
  }
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if ("value" in obj) return extractNumber(obj.value);
    if ("qty" in obj) return extractNumber(obj.qty);
    if ("calories" in obj) return extractNumber(obj.calories);
    if ("cal" in obj) return extractNumber(obj.cal);
  }
  return 0;
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

      // POST /api/sync?key=steps  body: the data object to store
      POST: async ({ request }) => {
        if (!GH_TOKEN) return Response.json({ error: "Not configured" }, { status: 500 });
        const url = new URL(request.url);
        const key = url.searchParams.get("key");
        if (!key) return Response.json({ error: "Missing key" }, { status: 400 });

        const body = (await request.json().catch(() => null)) as any;
        if (body === null) return Response.json({ error: "Invalid body" }, { status: 400 });

        const filename = `${key}.json`;
        let payloadToSave: any = body;

        // Activity sync (Shortcuts calories / steps)
        const isActivitySync =
          key === "steps" ||
          key === "calories" ||
          key === "activity" ||
          (body && (body.cal !== undefined || body.active_calories !== undefined || body.steps !== undefined));

        if (isActivitySync && body && typeof body === "object" && !Array.isArray(body)) {
          let existingData: {
            days?: Record<string, { cal?: number; steps?: number; updatedAt?: string }>;
            latest?: number;
            latestDate?: string;
          } = { days: {} };

          try {
            const getRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
              headers: await gistHeaders(),
            });
            if (getRes.ok) {
              const gist = (await getRes.json()) as {
                files: Record<string, { content: string } | null>;
              };
              const existingFile = gist.files[filename];
              if (existingFile && existingFile.content) {
                const parsed = JSON.parse(existingFile.content);
                if (parsed && typeof parsed === "object") {
                  existingData = parsed.days ? parsed : { days: parsed };
                }
              }
            }
          } catch (e) {
            console.error("Gist read error during activity merge:", e);
          }

          if (!existingData.days) existingData.days = {};

          // Auto-detect date if not provided (default to current date in Zagreb/Central Europe)
          let dateStr = body.date;
          if (!dateStr || typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            dateStr = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Europe/Zagreb",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date());
          }

          const rawVal = body.cal ?? body.active_calories ?? body.calories ?? body.steps;
          const parsedVal = extractNumber(rawVal);

          const dayRecord = existingData.days[dateStr] || {};
          if (body.steps !== undefined && body.cal === undefined && body.active_calories === undefined) {
            dayRecord.steps = parsedVal;
          } else {
            dayRecord.cal = parsedVal;
          }
          dayRecord.updatedAt = new Date().toISOString();

          existingData.days[dateStr] = dayRecord;
          existingData.latest = parsedVal;
          existingData.latestDate = dateStr;

          payloadToSave = existingData;
        }

        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
          method: "PATCH",
          headers: await gistHeaders(),
          body: JSON.stringify({
            files: { [filename]: { content: JSON.stringify(payloadToSave) } },
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("gist patch failed", res.status, t.slice(0, 300));
          return Response.json({ error: "Gist write failed" }, { status: 502 });
        }
        return Response.json({ ok: true, saved: payloadToSave });
      },
    },
  },
});
