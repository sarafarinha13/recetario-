// Persistencia local con IndexedDB: recetas + ajustes (tags, emojis).
const DB_NAME = 'recetario';
let dbp;

function open() {
  return (dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('recipes', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const rq = fn(t.objectStore(store));
    t.oncomplete = () => resolve(rq && rq.result);
    t.onerror = t.onabort = () => reject(t.error);
  }));
}

export const getRecipes = () => run('recipes', 'readonly', (s) => s.getAll());
export const putRecipe = (r) => run('recipes', 'readwrite', (s) => s.put(r));
export const deleteRecipe = (id) => run('recipes', 'readwrite', (s) => s.delete(id));
export const kvGet = (k) => run('kv', 'readonly', (s) => s.get(k));
export const kvSet = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k));

export async function persist() {
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
}
