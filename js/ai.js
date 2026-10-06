// Reconocimiento de alimentos -> tags, con un modelo gratuito de Groq.
// Si el usuario guardó su propia clave se llama a Groq directamente;
// si no, se usa el proxy /api/tags (la clave vive en Vercel).
import { resizeDataUrl } from './img.js';

export const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM = `Eres un asistente de cocina. Te paso una receta (foto y/o título e ingredientes) y debes devolver los alimentos principales como etiquetas de filtro.
Reglas:
- Responde SOLO con JSON: {"tags":[{"name":"...","emoji":"..."}]}
- Entre 1 y 6 etiquetas, en español, minúsculas, en singular y genéricas (p.ej. "pollo", "arroz", "pescado", "pasta", "marisco", "verdura", "queso", "huevo").
- Prioriza las etiquetas de la lista "existentes" cuando encajen; solo inventa una nueva si ningún existente sirve.
- "emoji" es un único emoji representativo del alimento.
- No incluyas condimentos básicos (sal, aceite, pimienta) ni utensilios.`;

export async function detectTags({ image, title, ingredients, knownTags, settings }) {
  const text = [
    `Etiquetas existentes: ${knownTags.join(', ') || '(ninguna)'}`,
    title ? `Título: ${title}` : '',
    ingredients?.length ? `Ingredientes: ${ingredients.join('; ')}` : '',
    image ? 'Se adjunta una foto de la receta/plato.' : '',
  ].filter(Boolean).join('\n');

  const content = image
    ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: await resizeDataUrl(image, 640, 0.7) } }]
    : text;

  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content }];
  const direct = Boolean(settings.key);
  const res = await fetch(direct ? GROQ_URL : '/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(direct ? { Authorization: `Bearer ${settings.key}` } : {}) },
    body: JSON.stringify(direct
      ? { model: settings.model || DEFAULT_MODEL, messages, temperature: 0.2, max_tokens: 300, response_format: { type: 'json_object' } }
      : { messages }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!direct && (res.status === 404 || res.status === 501)) {
      throw new Error('Falta la clave de Groq: añádela en Ajustes (⚙).');
    }
    throw new Error(data?.error?.message || `Error ${res.status} al contactar con la IA`);
  }

  let parsed;
  try { parsed = JSON.parse(data.choices[0].message.content); }
  catch { throw new Error('La IA devolvió una respuesta no válida'); }

  const seen = new Set();
  return (parsed.tags || [])
    .map((t) => (typeof t === 'string' ? { name: t } : t))
    .map((t) => ({ name: String(t.name || '').trim().toLowerCase(), emoji: String(t.emoji || '').trim() }))
    .filter((t) => t.name.length >= 2 && t.name.length <= 24 && !seen.has(t.name) && seen.add(t.name))
    .slice(0, 6);
}
