// Proxy a Groq para que la clave viva en el servidor (variable de entorno GROQ_API_KEY).
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).send(JSON.stringify({ error: { message: 'Método no permitido' } }));

  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(501).send(JSON.stringify({ error: { message: 'El servidor no tiene GROQ_API_KEY configurada' } }));

  // Solo peticiones desde la propia web
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).send(JSON.stringify({ error: { message: 'Origen no permitido' } })); }
    catch { return res.status(403).send(JSON.stringify({ error: { message: 'Origen no permitido' } })); }
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 3) {
    return res.status(400).send(JSON.stringify({ error: { message: 'Petición inválida' } }));
  }

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    });
    res.status(r.status).send(await r.text());
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: { message: 'No se pudo contactar con Groq' } }));
  }
};
