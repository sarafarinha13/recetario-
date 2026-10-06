// Proxy a Groq para que la clave viva en el servidor (variable de entorno GROQ_API_KEY).
//   GET  /api/tags  -> lista de modelos disponibles
//   POST /api/tags  -> chat completion (JSON)
const BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const fail = (res, code, message) => res.status(code).send(JSON.stringify({ error: { message } }));

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const key = process.env.GROQ_API_KEY;
  if (!key) return fail(res, 501, 'El servidor no tiene GROQ_API_KEY configurada');

  // Solo peticiones desde la propia web
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return fail(res, 403, 'Origen no permitido'); }
    catch { return fail(res, 403, 'Origen no permitido'); }
  }

  const auth = { Authorization: `Bearer ${key}` };
  try {
    if (req.method === 'GET') {
      const r = await fetch(`${BASE}/models`, { headers: auth });
      return res.status(r.status).send(await r.text());
    }
    if (req.method !== 'POST') return fail(res, 405, 'Método no permitido');

    const { messages, model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 3) return fail(res, 400, 'Petición inválida');
    const chosen = typeof model === 'string' && /^[\w.\-/]{1,100}$/.test(model) ? model : (process.env.GROQ_MODEL || DEFAULT_MODEL);

    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ model: chosen, messages, temperature: 0.2, max_tokens: 300, response_format: { type: 'json_object' } }),
    });
    res.status(r.status).send(await r.text());
  } catch (e) {
    fail(res, 502, 'No se pudo contactar con Groq');
  }
};
