// Redimensiona/comprime imágenes en el cliente (JPEG) para guardarlas ligeras.
function drawToJpeg(im, max, quality) {
  const scale = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.naturalWidth * scale));
  c.height = Math.max(1, Math.round(im.naturalHeight * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function load(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('No se pudo leer la imagen'));
    im.src = src;
  });
}

export async function fileToDataUrl(file, max = 1000, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try { return drawToJpeg(await load(url), max, quality); }
  finally { URL.revokeObjectURL(url); }
}

export async function resizeDataUrl(dataUrl, max = 640, quality = 0.7) {
  return drawToJpeg(await load(dataUrl), max, quality);
}

export async function imageSize(dataUrl) {
  const im = await load(dataUrl);
  return { w: im.naturalWidth, h: im.naturalHeight };
}
