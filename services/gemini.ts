// Brainstorm story details via the server-side proxy.
// The Gemini API key never leaves the server — this module makes a plain
// fetch to /api/brainstorm instead of calling Gemini directly.
export async function brainstormStoryDetails(prompt: string): Promise<string[]> {
  try {
    const res = await fetch('/api/brainstorm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
