export const onRequestPost = async (context: any) => {
  const apiKey = context.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set in Cloudflare environment variables" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let prompt: string;
  try {
    const body = await context.request.json();
    prompt = body.prompt;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!prompt) {
    return new Response(JSON.stringify({ error: "No prompt provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: "You are Orbit AI, a helpful and concise assistant integrated into the user's browser homepage. Keep responses short, helpful, and friendly." }],
          },
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data: any = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "Gemini API error" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm not sure how to answer that.";
    return new Response(JSON.stringify({ text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Failed to contact Gemini API" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
