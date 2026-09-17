/* util.js — tiny DOM + formatting helpers. No dependencies. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape text before it goes into innerHTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- cricket formatting ---------- */

/** 27 legal balls -> "4.3" */
export function oversOf(balls) { return `${Math.floor(balls / 6)}.${balls % 6}`; }

/** 27 legal balls -> 4.5 (decimal overs, for run-rate / NRR maths) */
export function oversDec(balls) { return balls / 6; }

export function rate(runs, balls) { return balls > 0 ? (runs * 6) / balls : 0; }

export function fixed(n, d = 2) {
  if (!isFinite(n)) return '-';
  return n.toFixed(d);
}

export function strikeRate(runs, balls) { return balls ? (runs / balls) * 100 : 0; }

export function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

/** "Virat Kohli" -> "V Kohli" (scorecard style) */
export function shortName(name) {
  const p = String(name || '').trim().split(/\s+/);
  if (p.length < 2) return p[0] || '';
  return `${p[0][0]} ${p.slice(1).join(' ')}`;
}

export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(ts);
}

/* ---------- team colours ----------------------------------------------
   Eight club colours instead of twelve Tailwind defaults. Each is one CSS
   class carrying a `--tm` variable with a value per theme, so a team mark
   needs no safelist and no generated light-mode remap. */

export const ACCENTS = [
  { key: 'navy',    label: 'Navy',    cls: 'tm-navy' },
  { key: 'maroon',  label: 'Maroon',  cls: 'tm-maroon' },
  { key: 'bottle',  label: 'Bottle',  cls: 'tm-bottle' },
  { key: 'gold',    label: 'Gold',    cls: 'tm-gold' },
  { key: 'sky',     label: 'Sky',     cls: 'tm-sky' },
  { key: 'claret',  label: 'Claret',  cls: 'tm-claret' },
  { key: 'saffron', label: 'Saffron', cls: 'tm-saffron' },
  { key: 'steel',   label: 'Steel',   cls: 'tm-steel' }
];

/* Teams saved under the old Tailwind hue names keep working. */
const LEGACY = {
  emerald: 'bottle', rose: 'claret', violet: 'navy', amber: 'gold',
  teal: 'bottle', orange: 'saffron', fuchsia: 'maroon', lime: 'bottle',
  cyan: 'sky', indigo: 'navy', pink: 'claret'
};

export function accent(key) {
  const k = LEGACY[key] || key;
  return ACCENTS.find(a => a.key === k) || ACCENTS[0];
}

/* ---------- toast ---------- */

let toastHost;
/** How long a message stays up. Warnings and errors need reading, not glimpsing. */
const TOAST_MS = { info: 3200, ok: 3000, warn: 5500, error: 6500 };

export function toast(msg, kind = 'info', ms) {
  const life = ms ?? TOAST_MS[kind] ?? 3200;
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 z-[90] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md';
    document.body.appendChild(toastHost);
  }
  const tone = {
    info:  'bg-fill border-rule text-fg',
    ok:    'bg-action border-action text-onaction',
    warn:  'bg-boundary border-boundary text-onaction',
    error: 'bg-wicket border-wicket text-onaction'
  }[kind] || 'bg-fill border-rule text-fg';
  const n = document.createElement('div');
  n.className = `pointer-events-auto cursor-pointer animate-pop rounded-lg border ${tone} px-4 py-2.5 text-sm font-semibold shadow-lift text-center`;
  n.textContent = msg;
  toastHost.appendChild(n);

  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    n.style.transition = 'opacity .25s, transform .25s';
    n.style.opacity = '0';
    n.style.transform = 'translateY(8px)';
    setTimeout(() => n.remove(), 260);
  };
  n.addEventListener('click', dismiss);          // tap it away if you have read it
  setTimeout(dismiss, life);
  return dismiss;
}

/* ---------- modal / bottom sheet ---------- */

let sheetResolve = null;

/**
 * Open a bottom sheet. `html` is the inner content.
 * Buttons with [data-close] resolve the promise with their data-close value.
 */
export function sheet(html, opts = {}) {
  const host = $('#sheet');
  host.innerHTML = `
    <div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div class="absolute inset-0 scrim animate-fade-in" data-close="__dismiss"></div>
      <div class="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto no-scrollbar
                  rounded-t-xl sm:rounded-xl bg-plate border-t sm:border border-rule
                  shadow-lift animate-sheet-up sm:animate-pop safe-b">
        ${opts.grab === false ? '' : '<div class="sticky top-0 pt-3 pb-1 flex justify-center bg-plate z-10"><div class="h-1 w-10 rounded-full bg-rule"></div></div>'}
        <div class="p-5 pt-2">${html}</div>
      </div>
    </div>`;
  host.classList.remove('hidden');
  return new Promise(res => { sheetResolve = res; });
}

export function closeSheet(value) {
  const host = $('#sheet');
  if (host.classList.contains('hidden')) return;
  host.classList.add('hidden');
  host.innerHTML = '';
  const r = sheetResolve; sheetResolve = null;
  if (r) r(value);
}

export function sheetOpen() { return !$('#sheet').classList.contains('hidden'); }

/** Simple yes/no. Resolves true/false. */
export async function confirmDlg(title, message, okLabel = 'Confirm', danger = true) {
  const v = await sheet(`
    <h3 class="text-lg font-bold text-fg">${esc(title)}</h3>
    <p class="mt-2 text-sm text-muted leading-relaxed">${esc(message)}</p>
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="no">Cancel</button>
      <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-close="yes">${esc(okLabel)}</button>
    </div>`, { grab: false });
  return v === 'yes';
}

/** Single-line prompt. Resolves string or null. */
export async function promptDlg(title, { value = '', placeholder = '', okLabel = 'Save', type = 'text' } = {}) {
  const v = await sheet(`
    <h3 class="text-lg font-bold text-fg mb-3">${esc(title)}</h3>
    <input id="pmt" type="${type}" class="field" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
    <div class="mt-5 grid grid-cols-2 gap-3">
      <button class="btn-ghost" data-close="__dismiss">Cancel</button>
      <button class="btn-primary" data-close="ok">${esc(okLabel)}</button>
    </div>`, { grab: false });
  if (v !== 'ok') return null;
  return (window.__pmtVal || '').trim() || null;
}

/* Keep the prompt value alive past the DOM teardown. */
if (typeof document !== 'undefined') {
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'pmt') window.__pmtVal = e.target.value;
  });
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-close]');
    if (!b) return;
    if (b.id === 'pmt') return;
    const inp = $('#pmt');
    if (inp) window.__pmtVal = inp.value;
    closeSheet(b.dataset.close);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheetOpen()) closeSheet('__dismiss');
  });
}

/* ---------- misc ---------- */

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function haptic(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* ignore */ } }

export function byId(list, id) { return list.find(x => x.id === id); }

export function sortBy(arr, ...keys) {
  return [...arr].sort((a, b) => {
    for (const k of keys) {
      const dir = k[0] === '-' ? -1 : 1;
      const key = k[0] === '-' ? k.slice(1) : k;
      const av = a[key], bv = b[key];
      if (av === bv) continue;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av > bv ? 1 : -1) * dir;
    }
    return 0;
  });
}
