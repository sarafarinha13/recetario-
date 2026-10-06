import * as db from './db.js';
import { detectTags, DEFAULT_MODEL } from './ai.js';
import { exportRecipePdf } from './pdf.js';
import { fileToDataUrl } from './img.js';

/* ---------- Datos iniciales (los del prototipo) ---------- */
const TAG_LIBRARY = {
  pescado: '🐟', pollo: '🍗', pasta: '🍝', marisco: '🦐', arroz: '🍚',
  cerdo: '🥓', 'champiñón': '🍄', harina: '🌾', 'panadería': '🥖', salsas: '🥣',
};
const EMOJI_OPTIONS = ['🍽️', '🥬', '🧀', '🥚', '🍋', '🌶️', '🫘', '🍯'];
const LEVELS = ['Fácil', 'Medio', 'Difícil'];

const r = (title, tags, time, level, rating, ingredients, steps) =>
  ({ title, tags, time, level, rating, favorite: false, image: null, ingredients, steps });
const SEED = [
  r('Arroz con solomillo y champiñones', ['arroz', 'cerdo', 'champiñón'], '35 min', 'Medio', 5,
    ['300 g de arroz', '250 g de solomillo de cerdo en tiras', '200 g de champiñones laminados', '1 cebolla', 'Caldo de carne', 'Aceite de oliva y sal'],
    ['Dorar el solomillo en aceite caliente y reservar.', 'Pochar la cebolla, añadir los champiñones y sofreír 5 min.', 'Incorporar el arroz, nacarar y cubrir con caldo caliente.', 'Cocinar 16-18 min, añadir el solomillo los últimos 3 min y dejar reposar.']),
  r('Poke', ['arroz', 'pescado'], '20 min', 'Fácil', 4,
    ['200 g de arroz para sushi', '200 g de atún fresco en dados', '1 aguacate', 'Edamame', 'Salsa de soja y sésamo'],
    ['Cocer el arroz y dejar enfriar ligeramente.', 'Marinar el atún con soja y sésamo 10 min.', 'Montar el bol con arroz, atún, aguacate y edamame.', 'Terminar con más sésamo y un chorrito de soja.']),
  r('Udon', ['pasta', 'pollo'], '25 min', 'Fácil', 4,
    ['250 g de fideos udon', '200 g de pechuga de pollo', 'Caldo dashi', 'Puerro', 'Salsa de soja'],
    ['Cocer los fideos udon según el envase y reservar.', 'Saltear el pollo en tiras hasta dorar.', 'Calentar el caldo dashi con soja y puerro.', 'Servir el udon en el caldo caliente con el pollo encima.']),
  r('Focaccia', ['harina', 'panadería'], '12 h + 25 min', 'Medio', 5,
    ['500 g harina panificable', '5,5 g levadura', '2 cucharas de aceite', '2 cucharadas de azúcar moreno', 'Sal', 'Tomillo y sal gruesa'],
    ['Mezclar todo y reposar una noche en la nevera.', 'Extender en la bandeja con abundante aceite 20/30 min y al horno 230º 20/25 min.', 'Echar tomillo y sal gruesa.']),
  r('Tzatziki', ['salsas'], '10 min', 'Fácil', 4,
    ['1 pepino', '400 g de yogur griego', '2 dientes de ajo', 'Eneldo fresco', 'Aceite de oliva y sal'],
    ['Rallar el pepino y escurrir bien el agua.', 'Mezclar con el yogur, el ajo picado y el eneldo.', 'Añadir aceite y sal al gusto y enfriar antes de servir.']),
  r('Guacamole', ['salsas'], '10 min', 'Fácil', 5,
    ['2 aguacates maduros', '1/2 cebolla morada', '1 tomate', 'Lima', 'Cilantro y sal'],
    ['Machacar el aguacate con un tenedor dejando textura.', 'Picar fino la cebolla, el tomate y el cilantro.', 'Mezclar todo con el zumo de lima y sal.']),
  r('Albóndigas', ['cerdo', 'salsas'], '40 min', 'Medio', 4,
    ['500 g de carne picada de cerdo', '1 huevo', 'Pan rallado y leche', '1 cebolla', 'Tomate frito'],
    ['Mezclar la carne con huevo, pan remojado en leche y sal.', 'Formar las albóndigas y dorarlas en aceite.', 'Preparar una salsa de cebolla y tomate frito.', 'Cocer las albóndigas en la salsa 15 min a fuego lento.']),
  r('Arroz 3 delicias', ['arroz', 'pollo', 'marisco'], '25 min', 'Fácil', 4,
    ['300 g de arroz', '150 g de pechuga de pollo', '150 g de gambas peladas', 'Guisantes y zanahoria', '2 huevos'],
    ['Cocer el arroz y dejar enfriar, idealmente de un día para otro.', 'Saltear el pollo y las gambas por separado.', 'Hacer un revuelto fino con los huevos y reservar.', 'Saltear el arroz con las verduras y mezclar todo al final.']),
  r('Boquerones', ['pescado'], '15 min', 'Fácil', 3,
    ['500 g de boquerones limpios', 'Vinagre y agua', 'Ajo y perejil', 'Aceite de oliva', 'Sal'],
    ['Marinar los boquerones en vinagre y agua 1-2 h en la nevera.', 'Escurrir bien y colocar en una fuente.', 'Aliñar con ajo picado, perejil y aceite de oliva.']),
  r('Salsa teriyaki', ['salsas'], '10 min', 'Fácil', 4,
    ['100 ml de salsa de soja', '2 cucharadas de azúcar moreno', '1 cucharada de miel', 'Jengibre y ajo', 'Maicena para espesar'],
    ['Calentar la soja, el azúcar y la miel a fuego medio.', 'Añadir ajo y jengibre rallados.', 'Espesar con un poco de maicena disuelta en agua.']),
];

/* ---------- Estado ---------- */
const S = {
  recipes: [], tags: Object.keys(TAG_LIBRARY), emoji: {},
  active: [], search: '', idea: null,
  sheet: null,            // null | {type:'detail',id} | {type:'form'} | {type:'tag',emoji} | {type:'settings'}
  form: null,
  settings: loadSettings(),
  installEvt: null,
};
let storageOk = true;

function loadSettings() {
  try { return { key: '', model: '', ...JSON.parse(localStorage.getItem('recetario.settings') || '{}') }; }
  catch { return { key: '', model: '' }; }
}
function saveSettings() {
  try { localStorage.setItem('recetario.settings', JSON.stringify(S.settings)); } catch { /* sin storage */ }
}

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const emojiFor = (t) => S.emoji[t] || TAG_LIBRARY[t] || '🍽️';
const byId = (id) => S.recipes.find((x) => x.id === id);

const stripeCls = (rec) => (rec.image ? '' : `stripe-${rec.id % 3}`);
function thumbHTML(rec, size) {
  const bg = rec.image ? `background-image:url(${rec.image});` : '';
  return `<div class="thumb ${stripeCls(rec)}" style="width:${size}px;height:${size}px;${bg}"></div>`;
}

let toastTimer;
function toast(msg, ms = 2800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const reportErr = (e) => { console.error(e); toast(e?.message || 'Algo salió mal'); };

/* ---------- Carga / persistencia ---------- */
async function init() {
  try {
    await db.persist();
    let recipes = await db.getRecipes();
    if (!(await db.kvGet('seeded')) && recipes.length === 0) {
      for (const s of SEED) await db.putRecipe({ ...s, createdAt: Date.now() });
      recipes = await db.getRecipes();
    }
    await db.kvSet('seeded', true);
    S.recipes = recipes;
    S.tags = (await db.kvGet('tags')) || S.tags;
    S.emoji = (await db.kvGet('emoji')) || {};
  } catch (e) {
    storageOk = false;
    S.recipes = SEED.map((s, i) => ({ ...s, id: i + 1 }));
    toast('No se pudo usar el almacenamiento local: los cambios no se guardarán');
  }
  renderAll();
}

async function persistTags() {
  if (!storageOk) return;
  await db.kvSet('tags', S.tags);
  await db.kvSet('emoji', S.emoji);
}
async function saveRecipe(rec) {
  if (!storageOk) {
    if (!rec.id) rec.id = Math.max(0, ...S.recipes.map((x) => x.id)) + 1;
  } else {
    rec.id = await db.putRecipe(rec);
  }
  const i = S.recipes.findIndex((x) => x.id === rec.id);
  if (i >= 0) S.recipes[i] = rec; else S.recipes.push(rec);
  return rec;
}

/* ---------- Render: página ---------- */
function filtered() {
  const q = S.search.trim().toLowerCase();
  return S.recipes.filter((x) =>
    (S.active.length === 0 || x.tags.some((t) => S.active.includes(t))) &&
    (q === '' || x.title.toLowerCase().includes(q)));
}

function renderChips() {
  $('#chips').innerHTML =
    S.tags.map((t) => `
      <button class="chip" data-action="toggle-tag" data-tag="${esc(t)}" aria-pressed="${S.active.includes(t)}">
        <span class="e">${esc(emojiFor(t))}</span><span class="l">${esc(cap(t))}</span>
      </button>`).join('') +
    `<button class="chip add" data-action="open-tag" aria-label="Añadir tag de alimento">+</button>`;
}

function renderIdea() {
  const rec = S.idea && byId(S.idea);
  $('#idea').innerHTML = rec ? `
    <button class="idea-card" data-action="open-detail" data-id="${rec.id}">
      ${thumbHTML(rec, 60)}
      <div style="min-width:0">
        <div class="t">${esc(rec.title)}</div>
        <div class="m">${esc(rec.tags.map(emojiFor).join(' '))} · ${esc(rec.time)}</div>
      </div>
      <div class="go">Ver →</div>
    </button>` : '';
}

function renderList() {
  const list = [...filtered()].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  if (!list.length) {
    $('#list').innerHTML = `<div class="empty">${S.recipes.length ? 'No hay recetas con estos filtros todavía.' : 'Aún no tienes recetas. ¡Añade la primera!'}</div>`;
    return;
  }
  const groups = new Map();
  for (const rec of list) {
    const first = rec.title.trim().charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(rec);
  }
  $('#list').innerHTML = [...groups.keys()].sort().map((letter) => `
    <div class="group">
      <div class="letter"><b>${letter}</b><i></i></div>
      <div class="items">
        ${groups.get(letter).map((rec) => `
          <button class="row" data-action="open-detail" data-id="${rec.id}">
            ${thumbHTML(rec, 56)}
            <div class="info">
              <div class="t">${esc(rec.title)}</div>
              <div class="sub"><span class="pill">${esc(rec.time)}</span><span class="tg">${esc(rec.tags.map(emojiFor).join(' '))}</span></div>
            </div>
            ${rec.favorite ? '<div class="heart" aria-label="Favorita">♥</div>' : ''}
          </button>`).join('')}
      </div>
    </div>`).join('');
}

function renderAll() { renderChips(); renderIdea(); renderList(); renderSheet(); }

/* ---------- Render: sheets ---------- */
function openSheet(sheet) {
  if (!S.sheet) history.pushState({ sheet: 1 }, '');
  S.sheet = sheet;
  renderSheet();
}
function closeSheet() {
  const had = S.sheet;
  S.sheet = null; S.form = null;
  renderSheet();
  if (had && history.state?.sheet) history.back();
}
window.addEventListener('popstate', () => {
  if (S.sheet) { S.sheet = null; S.form = null; renderSheet(); }
});

function renderSheet() {
  const root = $('#sheet-root');
  const prev = $('.sheet', root);
  const scroll = prev ? prev.scrollTop : 0;
  const sh = S.sheet;
  if (!sh) { root.innerHTML = ''; return; }
  let inner = '';
  if (sh.type === 'detail') inner = detailHTML(byId(sh.id));
  else if (sh.type === 'form') inner = formHTML();
  else if (sh.type === 'tag') inner = tagHTML(sh);
  else if (sh.type === 'settings') inner = settingsHTML();
  if (!inner) { root.innerHTML = ''; S.sheet = null; return; }
  const still = prev ? ' style="animation:none"' : '';
  root.innerHTML = `<div class="overlay" data-action="overlay"${still}><div class="sheet" role="dialog" aria-modal="true"${still}><div class="grab"></div>${inner}</div></div>`;
  $('.sheet', root).scrollTop = scroll;
}

function detailHTML(rec) {
  if (!rec) return '';
  const heroStyle = rec.image ? `style="background-image:url(${rec.image})"` : '';
  return `
    <div class="hero ${stripeCls(rec)}" ${heroStyle}></div>
    <div class="d-head">
      <h2>${esc(rec.title)}</h2>
      <button class="fav ${rec.favorite ? 'on' : ''}" data-action="fav" aria-label="Marcar como favorita" aria-pressed="${rec.favorite}">♥</button>
    </div>
    <div class="stars">
      ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= rec.rating ? 'on' : ''}" data-action="rate" data-n="${n}" aria-label="Valorar con ${n} ${n === 1 ? 'estrella' : 'estrellas'}">★</button>`).join('')}
      <span class="meta">${esc(rec.time)} · ${esc(rec.level)}</span>
    </div>
    ${rec.tags.length ? `<div class="tagrow">${rec.tags.map((t) => `<span class="tagpill">${esc(emojiFor(t))} ${esc(cap(t))}</span>`).join('')}</div>` : ''}
    <h3>Ingredientes</h3>
    <ul>${rec.ingredients.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <h3>Pasos</h3>
    <ol>${rec.steps.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>
    <div class="btn-stack">
      <button class="btn" data-action="pdf">Exportar PDF</button>
      <div class="btn-pair">
        <button class="btn dark" data-action="edit">Editar</button>
        <button class="btn danger" data-action="delete">Eliminar</button>
      </div>
    </div>`;
}

function newForm(rec) {
  return {
    id: rec?.id ?? null,
    title: rec?.title ?? '', image: rec?.image ?? null,
    time: rec && rec.time !== '—' ? rec.time : '', level: rec?.level ?? 'Fácil',
    ingredients: rec?.ingredients.length ? [...rec.ingredients] : [''],
    steps: rec?.steps.length ? [...rec.steps] : [''],
    tags: rec ? [...rec.tags] : [], detecting: false,
  };
}

function formHTML() {
  const f = S.form;
  return `
    <h2>${f.id ? 'Editar receta' : 'Nueva receta'}</h2>
    <label class="lbl" for="f-title">Título</label>
    <input class="field" id="f-title" data-field="title" value="${esc(f.title)}" placeholder="p.ej. Ensalada de garbanzos" autocomplete="off">

    <button class="photo ${f.image ? 'has' : ''}" data-action="pick-image" ${f.image ? `style="background-image:url(${f.image})"` : ''} aria-label="${f.image ? 'Cambiar foto' : 'Subir foto de la receta'}">
      ${f.image ? '' : '<div class="ic">📷</div><div class="tx">toca para subir o hacer una foto</div>'}
    </button>
    <input type="file" id="f-file" accept="image/*" hidden>
    ${f.image ? '<button class="link plain" data-action="remove-image">Quitar foto</button>' : '<div style="height:10px"></div>'}

    <div class="two">
      <div><label class="lbl" for="f-time">Tiempo</label><input class="field" id="f-time" data-field="time" value="${esc(f.time)}" placeholder="p.ej. 25 min"></div>
      <div><label class="lbl" for="f-level">Nivel</label><select class="field" id="f-level" data-field="level">${LEVELS.map((l) => `<option ${l === f.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>

    <div class="fgroup">Ingredientes</div>
    ${f.ingredients.map((v, i) => `
      <div class="frow">
        <input class="field" data-ing="${i}" value="${esc(v)}" placeholder="p.ej. 200 g de arroz" aria-label="Ingrediente ${i + 1}">
        <button class="rm" data-action="rm-ing" data-i="${i}" aria-label="Quitar ingrediente">−</button>
      </div>`).join('')}
    <button class="link" data-action="add-ing">+ Añadir ingrediente</button>

    <div class="fgroup">Pasos</div>
    ${f.steps.map((v, i) => `
      <div class="frow">
        <span class="n">${i + 1}.</span>
        <input class="field" data-step="${i}" value="${esc(v)}" placeholder="Describe el paso" aria-label="Paso ${i + 1}">
        <button class="rm" data-action="rm-step" data-i="${i}" aria-label="Quitar paso">−</button>
      </div>`).join('')}
    <button class="link" data-action="add-step">+ Añadir paso</button>

    <div class="fgroup">Tags de alimentos</div>
    <div class="ftags">
      ${S.tags.map((t) => `<button class="ftag" data-action="toggle-ftag" data-tag="${esc(t)}" aria-pressed="${f.tags.includes(t)}">${esc(emojiFor(t))} ${esc(cap(t))}</button>`).join('')}
    </div>
    <button class="btn dark" data-action="detect" ${f.detecting ? 'disabled' : ''} style="margin-bottom:18px">${f.detecting ? 'Detectando…' : '✨ Detectar tags con IA'}</button>
    <button class="btn solid" data-action="save">Guardar receta</button>`;
}

function tagHTML(sh) {
  return `
    <h2>Nuevo tag de alimento</h2>
    <label class="lbl" for="t-name">Nombre</label>
    <input class="field" id="t-name" placeholder="p.ej. legumbres" autocomplete="off" style="margin-bottom:14px">
    <label class="lbl">Icono</label>
    <div class="emojis">${EMOJI_OPTIONS.map((e) => `<button class="emo ${e === sh.emoji ? 'on' : ''}" data-action="pick-emoji" data-e="${e}" aria-label="Icono ${e}">${e}</button>`).join('')}</div>
    <button class="btn solid" data-action="add-tag">Añadir tag</button>`;
}

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function settingsHTML() {
  const install = isStandalone ? '' : S.installEvt
    ? `<div class="section-gap"><div class="fgroup">Instalar</div><button class="btn dark" data-action="install">📲 Instalar app</button></div>`
    : isIOS ? `<div class="section-gap"><div class="fgroup">Instalar</div><p class="note" style="margin:0">En Safari: pulsa Compartir y después «Añadir a pantalla de inicio».</p></div>` : '';
  return `
    <h2>Ajustes</h2>
    <div class="fgroup">IA para detectar alimentos (Groq)</div>
    <p class="note">Si la web está desplegada con la variable <b>GROQ_API_KEY</b>, no necesitas rellenar nada. Si prefieres usar tu propia clave gratuita de <b>console.groq.com</b>, pégala aquí: se guarda solo en este dispositivo.</p>
    <label class="lbl" for="s-key">Clave de Groq</label>
    <input class="field" id="s-key" type="password" value="${esc(S.settings.key)}" placeholder="gsk_..." autocomplete="off" autocapitalize="off" spellcheck="false">
    <label class="lbl" for="s-model">Modelo (opcional)</label>
    <input class="field" id="s-model" value="${esc(S.settings.model)}" placeholder="${esc(DEFAULT_MODEL)}" autocapitalize="off" spellcheck="false">
    <button class="btn solid" data-action="save-settings">Guardar ajustes</button>
    <div class="section-gap">
      <div class="fgroup">Copia de seguridad</div>
      <div class="btn-pair">
        <button class="btn dark" data-action="backup">Exportar</button>
        <button class="btn dark" data-action="restore">Importar</button>
      </div>
      <input type="file" id="s-file" accept="application/json,.json" hidden>
    </div>
    ${install}`;
}

/* ---------- Acciones ---------- */
function readForm() {
  const f = S.form;
  // Los inputs ya actualizan f en 'input'; esto es solo por seguridad.
  return f;
}

function pickIdea() {
  const pool = S.active.length ? S.recipes.filter((x) => x.tags.some((t) => S.active.includes(t))) : S.recipes;
  if (!pool.length) { toast('No hay recetas con esos filtros'); return; }
  const options = pool.length > 1 ? pool.filter((x) => x.id !== S.idea) : pool;
  S.idea = options[Math.floor(Math.random() * options.length)].id;
  const old = $('#idea'); old.innerHTML = '';
  renderIdea();
}

async function addDetectedTags(tags) {
  for (const t of tags) {
    if (!S.tags.includes(t.name)) {
      S.tags.push(t.name);
      if (t.emoji) S.emoji[t.name] = t.emoji;
    }
  }
  await persistTags();
}

const actions = {
  'toggle-search'() {
    const w = $('#search-wrap'); w.hidden = !w.hidden;
    if (w.hidden) { S.search = ''; $('#search').value = ''; renderList(); } else $('#search').focus();
  },
  'open-settings'() { openSheet({ type: 'settings' }); },
  'pick-idea': pickIdea,
  'toggle-tag'(el) {
    const t = el.dataset.tag;
    S.active = S.active.includes(t) ? S.active.filter((x) => x !== t) : [...S.active, t];
    renderChips(); renderList();
  },
  'open-tag'() { openSheet({ type: 'tag', emoji: EMOJI_OPTIONS[0] }); },
  'pick-emoji'(el) { const v = $('#t-name')?.value; S.sheet.emoji = el.dataset.e; renderSheet(); if (v) $('#t-name').value = v; },
  async 'add-tag'() {
    const name = $('#t-name').value.trim().toLowerCase();
    if (!name) { $('#t-name').focus(); return; }
    if (!S.tags.includes(name)) S.tags.push(name);
    S.emoji[name] = S.sheet.emoji;
    await persistTags().catch(reportErr);
    closeSheet(); renderChips();
  },
  'open-add'() { S.form = newForm(null); openSheet({ type: 'form' }); },
  'open-detail'(el) { openSheet({ type: 'detail', id: Number(el.dataset.id) }); },
  async fav() {
    const rec = byId(S.sheet.id); rec.favorite = !rec.favorite;
    await saveRecipe(rec).catch(reportErr); renderSheet(); renderList();
  },
  async rate(el) {
    const rec = byId(S.sheet.id); const n = Number(el.dataset.n);
    rec.rating = rec.rating === n ? 0 : n;
    await saveRecipe(rec).catch(reportErr); renderSheet();
  },
  async pdf(el) {
    const rec = byId(S.sheet.id);
    el.disabled = true; el.textContent = 'Generando PDF…';
    try { await exportRecipePdf(rec); } catch (e) { reportErr(e); }
    el.disabled = false; el.textContent = 'Exportar PDF';
  },
  edit() { S.form = newForm(byId(S.sheet.id)); S.sheet = { type: 'form' }; renderSheet(); },
  async delete() {
    const rec = byId(S.sheet.id);
    if (!confirm(`¿Eliminar «${rec.title}»? Esta acción no se puede deshacer.`)) return;
    try { if (storageOk) await db.deleteRecipe(rec.id); } catch (e) { return reportErr(e); }
    S.recipes = S.recipes.filter((x) => x.id !== rec.id);
    if (S.idea === rec.id) S.idea = null;
    closeSheet(); renderIdea(); renderList(); toast('Receta eliminada');
  },

  /* formulario */
  'pick-image'() { $('#f-file').click(); },
  'remove-image'() { S.form.image = null; renderSheet(); },
  'add-ing'() { S.form.ingredients.push(''); renderSheet(); $$last('[data-ing]'); },
  'add-step'() { S.form.steps.push(''); renderSheet(); $$last('[data-step]'); },
  'rm-ing'(el) { S.form.ingredients.splice(+el.dataset.i, 1); if (!S.form.ingredients.length) S.form.ingredients.push(''); renderSheet(); },
  'rm-step'(el) { S.form.steps.splice(+el.dataset.i, 1); if (!S.form.steps.length) S.form.steps.push(''); renderSheet(); },
  'toggle-ftag'(el) {
    const t = el.dataset.tag, f = S.form;
    f.tags = f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t];
    renderSheet();
  },
  async detect() {
    const f = readForm();
    const ingredients = f.ingredients.map((v) => v.trim()).filter(Boolean);
    if (!f.image && !ingredients.length && !f.title.trim()) { toast('Añade una foto, un título o ingredientes para detectar los tags'); return; }
    f.detecting = true; renderSheet();
    try {
      const { tags: found, note } = await detectTags({ image: f.image, title: f.title.trim(), ingredients, knownTags: S.tags, settings: S.settings });
      if (!found.length) toast(note || 'No se detectó ningún alimento');
      else {
        await addDetectedTags(found);
        f.tags = [...new Set([...f.tags, ...found.map((t) => t.name)])];
        toast(`Detectados: ${found.map((t) => t.name).join(', ')}${note ? ` · ${note}` : ''}`, note ? 5000 : 2800);
        renderChips();
      }
    } catch (e) { reportErr(e); }
    f.detecting = false;
    if (S.form === f) renderSheet();
  },
  async save() {
    const f = readForm();
    const title = f.title.trim();
    if (!title) { $('#f-title').focus(); toast('Ponle un título a la receta'); return; }
    const ingredients = f.ingredients.map((v) => v.trim()).filter(Boolean);
    const steps = f.steps.map((v) => v.trim()).filter(Boolean);
    const old = f.id ? byId(f.id) : null;
    const rec = {
      ...(old || { favorite: false, rating: 0, createdAt: Date.now() }),
      title, image: f.image, tags: f.tags, time: f.time.trim() || '—', level: f.level,
      ingredients: ingredients.length ? ingredients : ['Añade los ingredientes'],
      steps: steps.length ? steps : ['Añade los pasos'],
    };
    if (f.id) rec.id = f.id; else delete rec.id;
    try { await saveRecipe(rec); } catch (e) { return reportErr(e); }
    closeSheet(); renderList(); renderIdea(); toast(old ? 'Receta actualizada' : 'Receta guardada');
  },

  /* ajustes */
  'save-settings'() {
    S.settings.key = $('#s-key').value.trim();
    S.settings.model = $('#s-model').value.trim();
    saveSettings(); closeSheet(); toast('Ajustes guardados');
  },
  async install() {
    const e = S.installEvt; if (!e) return;
    e.prompt(); await e.userChoice; S.installEvt = null; renderSheet();
  },
  async backup() {
    const data = { app: 'recetario', version: 1, exportedAt: new Date().toISOString(), tags: S.tags, emoji: S.emoji, recipes: S.recipes };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `recetario-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  restore() { $('#s-file').click(); },
};

function $$last(sel) { const els = document.querySelectorAll(`#sheet-root ${sel}`); els[els.length - 1]?.focus(); }

/* ---------- Eventos ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  if (name === 'overlay') { if (e.target === el) closeSheet(); return; }
  Promise.resolve(actions[name]?.(el, e)).catch(reportErr);
});

document.addEventListener('input', (e) => {
  const t = e.target, f = S.form;
  if (t.id === 'search') { S.search = t.value; renderList(); return; }
  if (!f) return;
  if (t.dataset.field) f[t.dataset.field] = t.value;
  else if (t.dataset.ing !== undefined) f.ingredients[+t.dataset.ing] = t.value;
  else if (t.dataset.step !== undefined) f.steps[+t.dataset.step] = t.value;
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'f-file' && t.files[0]) {
    try { S.form.image = await fileToDataUrl(t.files[0]); renderSheet(); }
    catch (err) { reportErr(err); }
  } else if (t.id === 's-file' && t.files[0]) {
    try { await importBackup(t.files[0]); } catch (err) { reportErr(err); }
    t.value = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.sheet) closeSheet();
  if (e.key === 'Enter' && e.target.id === 't-name') actions['add-tag']();
});

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('El archivo no es un JSON válido'); }
  if (data?.app !== 'recetario' || !Array.isArray(data.recipes)) throw new Error('No parece una copia de Recetario');
  if (!confirm(`Se importarán ${data.recipes.length} recetas y se añadirán a las que ya tienes. ¿Continuar?`)) return;
  for (const rec of data.recipes) {
    const { id, ...rest } = rec;
    await saveRecipe({ favorite: false, rating: 0, image: null, tags: [], ingredients: [], steps: [], time: '—', level: 'Fácil', ...rest, title: String(rest.title || 'Sin título') });
  }
  for (const t of data.tags || []) if (!S.tags.includes(t)) S.tags.push(t);
  Object.assign(S.emoji, data.emoji || {});
  await persistTags();
  closeSheet(); renderAll(); toast(`Importadas ${data.recipes.length} recetas`);
}

/* ---------- PWA ---------- */
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
window.addEventListener('appinstalled', () => { S.installEvt = null; toast('¡Recetario instalado!'); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
}

init();
