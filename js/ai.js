// Reconocimiento de alimentos -> tags, con un modelo gratuito de Groq.
// Si el usuario guardó su propia clave se llama a Groq directamente;
// si no, se usa el proxy /api/tags (la clave vive en Vercel).
import { resizeDataUrl } from './img.js';

export const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
// Si el modelo no existe, se busca uno disponible en la cuenta (preferencia por estos).
const VISION_HINT = /llama-4|vision|scout|maverick|[-/]vl\b|qwen.*vl/i;
const TEXT_PREF = [/llama-3\.3-70b/i, /llama-3\.1-8b/i, /gpt-oss-20b/i, /gpt-oss-120b/i, /qwen/i, /llama/i];
const NOT_CHAT = /whisper|tts|guard|embed|orpheus|playai|distil-whisper/i;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM = `Eres un asistente de cocina. Te paso una receta (foto y/o título e ingredientes) y una lista cerrada de etiquetas de alimentos.
Reglas:
- Responde SOLO con JSON: {"tags":["..."]}
- Elige únicamente etiquetas de la lista, copiadas tal cual. NO inventes etiquetas nuevas.
- Incluye una etiqueta solo si ese alimento es un ingrediente principal de la receta (no por llevar una pizca).
- Si ninguna encaja, devuelve {"tags":[]}.`;

let cachedModels = null;

async function groqFetch(settings, path, init = {}) {
  const direct = Boolean(settings.key);
  const url = direct ? `https://api.groq.com/openai/v1${path}` : '/api/tags';
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(direct ? { Authorization: `Bearer ${settings.key}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!direct && (res.status === 404 || res.status === 501)) throw new Error('Falta la clave de Groq: añádela en Ajustes (⚙) o configura GROQ_API_KEY en Vercel.');
    const err = new Error(data?.error?.message || `Error ${res.status} al contactar con la IA`);
    err.status = res.status; err.code = data?.error?.code;
    throw err;
  }
  return data;
}

const isModelError = (e) => e.code === 'model_not_found' || /does not exist|decommission|not found|no longer supported|access to it/i.test(e.message || '');

async function discoverModels(settings) {
  if (!cachedModels) {
    const data = await groqFetch(settings, '/models');
    const ids = (data.data || []).filter((m) => m.active !== false).map((m) => m.id).filter((id) => !NOT_CHAT.test(id));
    const vision = ids.find((id) => VISION_HINT.test(id)) || null;
    const text = TEXT_PREF.map((re) => ids.find((id) => re.test(id))).find(Boolean) || ids[0] || null;
    cachedModels = { vision, text };
  }
  return cachedModels;
}

async function chat(settings, model, messages) {
  const direct = Boolean(settings.key);
  const body = direct
    ? { model, messages, temperature: 0.2, max_tokens: 300, response_format: { type: 'json_object' } }
    : { model, messages };
  const data = await groqFetch(settings, '/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  try { return JSON.parse(data.choices[0].message.content); }
  catch { throw new Error('La IA devolvió una respuesta no válida'); }
}

// Devuelve { tags, note }. `note` avisa si hubo que prescindir de la foto.
export async function detectTags({ image, title, ingredients, knownTags, settings }) {
  const baseText = [
    `Lista de etiquetas permitidas: ${knownTags.join(', ') || '(ninguna)'}`,
    title ? `Título: ${title}` : '',
    ingredients?.length ? `Ingredientes: ${ingredients.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  const visionMessages = async () => [{ role: 'system', content: SYSTEM }, {
    role: 'user',
    content: [{ type: 'text', text: `${baseText}\nSe adjunta una foto de la receta/plato.` }, { type: 'image_url', image_url: { url: await resizeDataUrl(image, 640, 0.7) } }],
  }];
  const textMessages = () => [{ role: 'system', content: SYSTEM }, { role: 'user', content: baseText }];

  const preferred = settings.model || DEFAULT_MODEL;
  let parsed, note = '';
  try {
    parsed = await chat(settings, preferred, image ? await visionMessages() : textMessages());
  } catch (e) {
    if (!isModelError(e)) throw e;
    // El modelo ya no existe o la cuenta no tiene acceso: buscamos otro disponible.
    const { vision, text } = await discoverModels(settings);
    if (image && vision) parsed = await chat(settings, vision, await visionMessages());
    else if (text && (title || ingredients?.length)) {
      parsed = await chat(settings, text, textMessages());
      if (image) note = 'Tu cuenta no tiene un modelo con visión: se usaron el título y los ingredientes, no la foto.';
    } else throw new Error('No hay ningún modelo de Groq disponible para analizar la receta (añade título o ingredientes).');
  }

  const allowed = new Map(knownTags.map((t) => [t.toLowerCase(), t]));
  const seen = new Set();
  const tags = (parsed.tags || [])
    .map((t) => String(typeof t === 'string' ? t : t?.name || '').trim().toLowerCase())
    .filter((t) => allowed.has(t) && !seen.has(t) && seen.add(t))
    .map((t) => ({ name: allowed.get(t) }));
  return { tags, note };
}
