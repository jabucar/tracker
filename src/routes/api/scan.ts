import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
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

        // 1. Google Gemini (100% Free tier u Google AI Studio)
        if (geminiKey) {
          try {
            const parts: Array<Record<string, unknown>> = [{ text: prompt }];

            if (image) {
              const match = image.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: match[1],
                    data: match[2],
                  },
                });
              }
            }

            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts }],
                  generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json",
                  },
                }),
              }
            );

            if (!res.ok) {
              const errTxt = await res.text().catch(() => "");
              console.error("Gemini API error:", res.status, errTxt.slice(0, 300));
              return Response.json(
                { error: res.status === 429 ? "Previše zahtjeva prema Gemini API. Pričekaj trenutak." : `Gemini error: ${res.status}` },
                { status: res.status === 429 ? 429 : 502 }
              );
            }

            const data = (await res.json()) as any;
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const jsonMatch = rawText.match(/\\{[\\s\\S]*\\}/);
            if (!jsonMatch) {
              return Response.json({ error: "Model nije vratio valjan JSON" }, { status: 502 });
            }

            const parsed = JSON.parse(jsonMatch[0]);
            return Response.json(parsed);
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
            const jsonMatch = rawText.match(/\\{[\\s\\S]*\\}/);
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
