import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return Response.json({ error: "Not configured" }, { status: 500 });
        const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; image?: unknown };
        const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 4000) : "";
        const image =
          typeof body.image === "string" && body.image.startsWith("data:image/") && body.image.length < 8_000_000
            ? body.image
            : null;
        if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

        const content: Array<Record<string, string>> = [{ type: "input_text", text: prompt }];
        if (image) content.push({ type: "input_image", image_url: image });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            input: [{ role: "user", content }],
            reasoning: { effort: "low" },
            store: false,
            stream: true,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const t = await upstream.text().catch(() => "");
          console.error("scan upstream", upstream.status, t.slice(0, 500));
          return Response.json({ error: "AI request failed" }, { status: upstream.status === 429 ? 429 : 502 });
        }

        const reader = upstream.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const ev = JSON.parse(payload);
              if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
            } catch {
              /* ignore partial */
            }
          }
        }

        const m = text.match(/\{[\s\S]*\}/);
        if (!m) return Response.json({ error: "No result" }, { status: 502 });
        try {
          return Response.json(JSON.parse(m[0]));
        } catch {
          return Response.json({ error: "Bad result" }, { status: 502 });
        }
      },
    },
  },
});
