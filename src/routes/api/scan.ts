import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
      GET: async () => {
        const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
        if (!geminiKey) return Response.json({ error: "GEMINI_API_KEY is not set in environment" }, { status: 500 });

        try {
          const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
            headers: { "x-goog-api-key": geminiKey },
          });
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            const models = (data.models || []).map((m: any) => m.name);
            return Response.json({ count: models.length, models: models.slice(0, 30) });
          } catch {
            return Response.json({ raw: text }, { status: res.status });
          }
        } catch (e: any) {
          return Response.json({ error: e?.message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
        const openRouterKey = process.env["OPENROUTER_API_KEY"];
        const openAiKey = process.env["OPENAI_API_KEY"];
        const lovableKey = process.env["LOVABLE_API_KEY"];

        if (!geminiKey && !openRouterKey && !openAiKey && !lovableKey) {
          return Response.json(
            { error: "Nije postavljen API ključ. Dodaj GEMINI_API_KEY u Vercel Environment Variables." },
            { status: 500 }
          );
        }

        const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; image?: unknown };
        const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 4000) : "";
        const image =
          typeof body.image === "string" && body.image.startsWith("data:image/") && body.image.length < 8_000_000
            ? body.image
            : null;

        if (!prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });

        // 1. Google Gemini (pokusaj s modelima redom)
        if (geminiKey) {
          try {
            const parts: Array<Record<string, unknown>> = [{ text: prompt }];
            if (image) {
              const match = image.match(/^data:([^;]+);base64,(.+)$/);
              if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }

            const candidateModels = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3-flash-preview"];

            let lastErr = "";
            let lastStatus = 502;

            for (const model of candidateModels) {
              const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
                  body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
                  }),
                }
              );

              if (res.ok) {
                const data = (await res.json()) as any;
                const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                try {
                  return Response.json(JSON.parse(rawText));
                } catch {
                  const m = rawText.match(/\{[\s\S]*\}/);
                  if (m) return Response.json(JSON.parse(m[0]));
                  return Response.json({ error: "Gemini nije vratio JSON", raw: rawText.slice(0, 200) }, { status: 502 });
                }
              }

              lastStatus = res.status;
              const errTxt = await res.text().catch(() => "");
              lastErr = `${model} (${res.status}): ${errTxt.slice(0, 200)}`;

              if (res.status === 429) {
                return Response.json({ error: "Previše zahtjeva prema Gemini API (429). Pričekaj trenutak." }, { status: 429 });
              }
              if (res.status !== 404) break;
            }

            return Response.json({ error: "Gemini error: " + lastErr }, { status: lastStatus });
          } catch (e: any) {
            console.error("Gemini exception:", e);
            return Response.json({ error: e?.message || "Greška pri pozivu Gemini modela" }, { status: 500 });
          }
        }

        // 2. OpenRouter fallback
        if (openRouterKey) {
          try {
            const content: any[] = [{ type: "text", text: prompt }];
            if (image) content.push({ type: "image_url", image_url: { url: image } });

            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openRouterKey}`,
              },
              body: JSON.stringify({
                model: "google/gemini-flash-1.5-exp:free",
                messages: [{ role: "user", content }],
                temperature: 0.2,
              }),
            });

            if (!res.ok) return Response.json({ error: "OpenRouter greška" }, { status: 502 });
            const data = (await res.json()) as any;
            const rawText = data?.choices?.[0]?.message?.content || "";
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return Response.json({ error: "Nema JSON formata u odgovoru" }, { status: 502 });
            return Response.json(JSON.parse(jsonMatch[0]));
          } catch (e: any) {
            return Response.json({ error: e?.message || "Greška kod OpenRoutera" }, { status: 500 });
          }
        }

        // 3. OpenAI fallback
        if (openAiKey) {
          try {
            const content: any[] = [{ type: "text", text: prompt }];
            if (image) content.push({ type: "image_url", image_url: { url: image } });

            const res = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openAiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content }],
                temperature: 0.2,
                response_format: { type: "json_object" },
              }),
            });

            if (!res.ok) return Response.json({ error: "OpenAI greška" }, { status: 502 });
            const data = (await res.json()) as any;
            const rawText = data?.choices?.[0]?.message?.content || "";
            return Response.json(JSON.parse(rawText));
          } catch (e: any) {
            return Response.json({ error: e?.message || "Greška kod OpenAI" }, { status: 500 });
          }
        }

        return Response.json({ error: "Nema konfiguriranog pružatelja usluge" }, { status: 500 });
      },
    },
  },
});
