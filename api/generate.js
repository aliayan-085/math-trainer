// api/generate.js — runs on Vercel (server side). The API key never reaches the browser.
// The browser sends: level (1-3), kind of request, and the task facts computed by the page's code.
// Math (numbers + correct answers) is computed by code in index.html. The AI only writes text.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash'; // if you get a model error, set GEMINI_MODEL=gemini-2.5-flash in Vercel

// ===================== YOUR PROMPTS (rewrite in your own words!) =====================
// The assignment requires that prompt design is your own work. These are STARTERS only.
// Rewrite each one, then describe them in your 1-page report.
const PROMPTS = {
  1: `You are a patient math tutor helping a student who finds this topic difficult.
Use very simple words and short sentences.
Break the hint into 2-3 small numbered steps, but do not solve it for the student.
Do not give the final answer. Write plain text only, no markdown, no ^ symbol.
Maximum 120 words.`,

  2: `You are a math teacher for a student who knows the basics but may still slip.
Give a more direct hint than for a beginner: name the method (common factor, formula, Vieta).
Do not state the roots. Write "3x²", not "3x^2". No markdown.
Maximum 120 words.`,

  3: `You are a coach for a strong student. This is a word problem, so the student must build the equation.
Do not give ready-made steps. Ask one guiding question that helps them read the condition.
Remind them to check the answer against the real situation. No markdown, no ^.
Maximum 120 words.`,
};

// What the AI must do for each kind of request (also yours to edit)
const KINDS = {
  problem: 'Write the problem text for the student. Use ONLY the numbers from facts. Do NOT reveal the answers.',
  hint: 'Write the hint. The hint number is in facts (1 = gentle, 3 = most direct). Do NOT state the final answers.',
  feedback: 'The student gave a wrong answer (verified by code). Say what mistake is likely and how to check it. Do NOT state the final answers.',
  explain: 'Write a complete worked solution that ends with the final answers from facts.',
};
// =====================================================================================

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });

  const b = req.body || {};
  const level = Number(b.level), kind = String(b.kind);
  if (!PROMPTS[level] || !KINDS[kind]) return res.status(400).json({ error: 'Bad request' });

  // Only accept simple, bounded values from the browser
  const t = b.task || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const facts = [
    `Task type: ${t.type === 'word' ? 'word problem' : 'equation'}`,
    `Equation: ${String(t.equation || '').slice(0, 80)}`,
    `Correct answers (computed by code, trust them): ${(Array.isArray(t.answers) ? t.answers : []).slice(0, 2).map(num).join(', ')}`,
    t.extra ? `Extra numbers: ${JSON.stringify({ w: num(t.extra.w), d: num(t.extra.d), A: num(t.extra.A) })}` : '',
    kind === 'hint' ? `Hint number: ${Math.min(3, Math.max(1, num(b.hintNo)))}` : '',
    kind === 'feedback' ? `Student answer: ${String(b.student || '').slice(0, 40)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPTS[level] }] },
        contents: [{ role: 'user', parts: [{ text: `${KINDS[kind]}\n\nFacts:\n${facts}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'Gemini error' });
    const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
      .map((p) => p.text || '').join('').trim();
    return res.status(200).json({ text: text || '(empty answer, try again)' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
};
