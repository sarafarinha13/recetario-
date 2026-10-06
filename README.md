# Recetario (PWA)

Recetario personal: recetas con **ingredientes y pasos**, filtros por **tags de alimentos**, botón **¡Dame ideas!**, recetario A–Z, **fotos**, **exportar a PDF** y **detección de alimentos con IA (Groq)**. Funciona **offline** e instalable en el móvil.

## Stack
HTML + CSS + JS (módulos ES) sin build. Datos en IndexedDB del dispositivo. PDF con jsPDF (incluido en `vendor/`). Fuentes Lora y Figtree incluidas en `fonts/`.

## Desplegar en Vercel
1. En [vercel.com/new](https://vercel.com/new) importa el repo `sarafarinha13/recetario-`.
2. Framework Preset: **Other**. Build Command y Output Directory: vacíos (es un sitio estático; Vercel sirve la raíz y detecta `api/`).
3. En **Settings → Environment Variables** añade:
   - `GROQ_API_KEY` → tu clave gratuita de [console.groq.com](https://console.groq.com/keys)
   - `GROQ_MODEL` (opcional) → por defecto `meta-llama/llama-4-scout-17b-16e-instruct` (modelo con visión)
4. Deploy. Abre la URL en el móvil y usa *Instalar app* / *Añadir a pantalla de inicio*.

> La clave se queda en el servidor (`api/tags.js`). Alternativa sin servidor: pegar tu clave en **Ajustes ⚙** y la app llamará a Groq directamente (la clave se guarda solo en ese dispositivo).

Al actualizar la app, sube la constante `VERSION` de `sw.js` para que los dispositivos renueven la caché.

## Desarrollo local
```
npx serve .        # o cualquier servidor estático; el service worker requiere localhost/https
```
(`/api/tags` solo existe en Vercel; en local usa la clave en Ajustes. Con `vercel dev` también funciona el proxy.)

## Estructura
```
index.html  styles.css  sw.js  manifest.webmanifest  vercel.json
js/   app.js (UI/estado) · db.js (IndexedDB) · ai.js (Groq) · pdf.js · img.js
api/tags.js   proxy serverless a Groq
```
