export async function askGemini(prompt: string): Promise<string> {
  try {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data.error);
      return `Error: ${data.error || "Unknown error from Gemini API"}`;
    }

    return data.text || "I'm not sure how to answer that.";
  } catch (error) {
    console.error("Gemini fetch failed:", error);
    return "I'm sorry, I'm having trouble connecting to my brain right now.";
  }
}
