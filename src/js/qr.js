/* qr.js — showing and scanning QR codes, for the live-scoreboard handshake.
 *
 * Rendering uses the vendored qrcode-generator; scanning uses the platform
 * BarcodeDetector where it exists and falls back to the vendored jsQR.
 * Both are classic scripts that define a global, loaded on demand — the
 * service worker precaches them, so all of this works with no connection.
 */

const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => { loaded.delete(src); rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}

/** Draw `text` as a QR into (or as) a canvas. Returns the canvas. */
export async function renderQR(text, { size = 640, canvas } = {}) {
  await loadScript('./src/js/vendor/qrcode.js');
  const qr = window.qrcode(0, 'L');        // 0 = pick the smallest version that fits
  qr.addData(text, 'Byte');
  qr.make();

  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.max(1, Math.floor(size / (n + quiet * 2)));
  const px = cell * (n + quiet * 2);

  const c = canvas || document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col)) ctx.fillRect((col + quiet) * cell, (r + quiet) * cell, cell, cell);
    }
  }
  return c;
}

/* ---------- decoding one frame ---------- */

let detector;
async function decodeFrame(source, w, h) {
  if ('BarcodeDetector' in window) {
    try {
      detector = detector || new window.BarcodeDetector({ formats: ['qr_code'] });
      const found = await detector.detect(source);
      if (found.length) return found[0].rawValue;
      return null;
    } catch { /* fall through to jsQR */ }
  }
  await loadScript('./src/js/vendor/jsqr.js');
  const c = decodeFrame._c || (decodeFrame._c = document.createElement('canvas'));
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const hit = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
  return hit ? hit.data : null;
}

/** Decode a QR straight from a canvas (used by the tests). */
export async function decodeCanvas(canvas) {
  await loadScript('./src/js/vendor/jsqr.js');
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hit = window.jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
  return hit ? hit.data : null;
}

/**
 * Open the camera inside `videoEl` and resolve with the first QR that decodes.
 * Returns { stop } immediately via onReady; the promise settles on a hit or stop().
 */
export function scanCamera(videoEl, { onError } = {}) {
  let stopped = false;
  let stream = null;

  const stop = () => {
    stopped = true;
    if (stream) stream.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  };

  const result = (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false
      });
    } catch (err) {
      onError?.(err?.name === 'NotAllowedError'
        ? 'Camera permission was refused. Allow it in your browser settings, or paste the code instead.'
        : 'Could not open the camera. Paste the code instead.');
      return null;
    }
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', '');   // iOS: stay inline, not fullscreen
    await videoEl.play().catch(() => {});

    while (!stopped) {
      if (videoEl.readyState >= 2 && videoEl.videoWidth) {
        const hit = await decodeFrame(videoEl, videoEl.videoWidth, videoEl.videoHeight)
          .catch(() => null);
        if (hit) { stop(); return hit; }
      }
      await new Promise(r => setTimeout(r, 180));
    }
    return null;
  })();

  return { stop, result };
}

/* ------------------------------------------------------------------ *
 * The two handshake sheets, shared by the scorer and viewer flows
 * ------------------------------------------------------------------ */

import { sheet, closeSheet, promptDlg, copyText, toast, esc } from './util.js';

/** Show a connection code as a QR, with copy as the fallback transport. */
export async function showCodeSheet({ title, subtitle, code, nextLabel }) {
  const p = sheet(`
    <h3 class="text-lg font-bold text-white">${esc(title)}</h3>
    <p class="text-xs text-slate-500 mt-1 leading-snug">${esc(subtitle)}</p>
    <div class="mt-4 rounded-2xl bg-pure p-3 grid place-items-center">
      <canvas id="qrOut" class="w-full max-w-[300px] aspect-square [image-rendering:pixelated]"></canvas>
    </div>
    <button class="btn-ghost w-full mt-3 text-xs" data-close="copy">Copy the code instead</button>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" data-close="next">${esc(nextLabel)}</button>
    </div>`, { grab: false });

  renderQR(code, { canvas: document.querySelector('#qrOut') })
    .catch(() => toast('Could not draw the QR — use “Copy the code”', 'warn'));

  for (;;) {
    const v = await p;
    if (v === 'copy') {
      toast(await copyText(code) ? 'Code copied — send it any way you like' : 'Could not copy', 'ok');
      return showCodeSheet({ title, subtitle, code, nextLabel });   // reopen, still needed
    }
    return v === 'next';
  }
}

/** Scan a code with the camera; paste is always offered as the way out. */
export async function scanCodeSheet({ title, subtitle }) {
  const p = sheet(`
    <h3 class="text-lg font-bold text-white">${esc(title)}</h3>
    <p class="text-xs text-slate-500 mt-1 leading-snug">${esc(subtitle)}</p>
    <div class="mt-4 rounded-2xl overflow-hidden bg-black aspect-square grid place-items-center relative">
      <video id="scanVid" muted playsinline class="w-full h-full object-cover"></video>
      <p id="scanErr" class="absolute inset-x-4 bottom-3 text-center text-[11px] text-amber-300"></p>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-ghost" data-close="paste">Paste the code</button>
    </div>`, { grab: false });

  const video = document.querySelector('#scanVid');
  const cam = scanCamera(video, {
    onError: msg => { const el = document.querySelector('#scanErr'); if (el) el.textContent = msg; }
  });
  cam.result.then(text => { if (text) closeSheet('got:' + text); });

  const v = await p;
  cam.stop();
  if (typeof v === 'string' && v.startsWith('got:')) return v.slice(4);
  if (v === 'paste') {
    try {
      const t = (await navigator.clipboard.readText())?.trim();
      if (t?.startsWith('CSL1.')) return t;
    } catch { /* clipboard not readable — ask instead */ }
    const t = await promptDlg('Paste the code', { placeholder: 'CSL1.…' });
    return t?.trim() || null;
  }
  return null;
}
