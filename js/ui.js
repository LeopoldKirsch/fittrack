// Small DOM / formatting helpers shared by every view.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const z = (n) => String(n).padStart(2, '0');
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
export const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parseDate(s).toLocaleDateString('en-GB', opts);
export function relDay(s) {
  const t = todayStr();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  if (s === addDays(t, 1)) return 'Tomorrow';
  return fmtDate(s);
}

export const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round((+n || 0) * f) / f;
};
// Accepts "72,5" as well as "72.5" (European keyboards).
export function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
export const fmtNum = (n, d = 0) => round(n, d).toLocaleString('en-GB', { maximumFractionDigits: d });

// ---------- refresh hook (avoids circular imports with app.js) ----------
let refreshFn = () => {};
export const setRefresh = (fn) => (refreshFn = fn);
export const refresh = () => refreshFn();
export const go = (hash) => {
  if (location.hash === hash) refresh();
  else location.hash = hash;
};

// ---------- toast ----------
let toastTimer;
export function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- bottom sheet ----------
const sheets = [];
let onAllClosed = () => {};
export const setOnSheetsClosed = (fn) => (onAllClosed = fn);
export const isSheetOpen = () => sheets.length > 0;

/**
 * Opens a bottom sheet. `body` is an HTML string; `mount(el, api)` wires events.
 * api.setBody(html, mount) swaps content, api.close() closes.
 */
export function openSheet({ title = '', body = '', mount, onClose, tall = false } = {}) {
  const root = $('#sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <section class="sheet ${tall ? 'tall' : ''}" role="dialog" aria-modal="true">
      <header class="sheet-head">
        <h2 class="sheet-title">${esc(title)}</h2>
        <button class="icon-btn" data-sheet-close aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-body"></div>
    </section>`;
  root.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const bodyEl = wrap.querySelector('.sheet-body');
  const api = {
    el: bodyEl,
    setTitle(t) {
      wrap.querySelector('.sheet-title').textContent = t;
    },
    setBody(html, m) {
      bodyEl.innerHTML = html;
      bodyEl.onclick = bodyEl.oninput = bodyEl.onchange = bodyEl.onkeydown = null;
      bodyEl.scrollTop = 0;
      if (m) m(bodyEl, api);
    },
    close() {
      const i = sheets.indexOf(api);
      if (i < 0) return;
      sheets.splice(i, 1);
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 220);
      if (!sheets.length) document.body.classList.remove('no-scroll');
      onClose && onClose();
      if (!sheets.length) onAllClosed();
    },
  };
  sheets.push(api);
  wrap.querySelector('.sheet-backdrop').onclick = api.close;
  wrap.querySelector('[data-sheet-close]').onclick = api.close;
  api.setBody(body, mount);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return api;
}

export function confirmSheet(message, { ok = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title: 'Are you sure?',
      body: `<p class="muted">${esc(message)}</p>
        <div class="row gap mt">
          <button class="btn ghost grow" data-a="no">Cancel</button>
          <button class="btn ${danger ? 'danger' : 'primary'} grow" data-a="yes">${esc(ok)}</button>
        </div>`,
      mount(el) {
        el.onclick = (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (!a) return;
          answered = true;
          s.close();
          resolve(a === 'yes');
        };
      },
      onClose: () => !answered && resolve(false),
    });
  });
}

export function promptSheet(title, { label = '', value = '', placeholder = '', ok = 'Save' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet({
      title,
      body: `<label class="field"><span>${esc(label)}</span>
          <input id="prompt-in" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>
        <button class="btn primary block mt" data-ok>${esc(ok)}</button>`,
      mount(el) {
        const inp = el.querySelector('#prompt-in');
        setTimeout(() => inp.focus(), 250);
        const submit = () => {
          done = true;
          s.close();
          resolve(inp.value.trim() || null);
        };
        el.onclick = (e) => e.target.closest('[data-ok]') && submit();
        el.onkeydown = (e) => e.key === 'Enter' && submit();
      },
      onClose: () => !done && resolve(null),
    });
  });
}

export async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    toast('Copied');
  } catch {
    toast('Copy failed: select the text manually');
  }
}

export function download(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

// ---------- icons (inline SVG, stroke-based) ----------
const P = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  apple: '<path d="M12 7c-1.5-2-5-2-6.5.5S5 15 7.5 18c1.2 1.4 2.5 2 4.5 1 2 1 3.3.4 4.5-1 2.5-3 3.5-7.5 2-10.5S13.5 5 12 7Z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9a5 5 0 0 1 8 0l-3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  barcode: '<path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-9-1 2-2 3-3.5 3.5C11 6 10 4 10 2 7 5 5 9 5 15c0 4.3 3 7 7 7Z"/>',
  steps: '<path d="M8 20a2 2 0 0 1-2-2c0-2 2-3 2-6s-1-4-1-6a2 2 0 1 1 4 0c0 2-1 3-1 6s1 4 1 6a3 3 0 0 1-3 2ZM16 14a2 2 0 0 1-2-2c0-1.5 1-2 1-4s-.5-3-.5-4a1.5 1.5 0 1 1 3 0c0 1-.5 2-.5 4s1 2.5 1 4a2 2 0 0 1-2 2Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/>',
  bookmark: '<path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4 12a4 4 0 0 0 1 7.9Z"/>',
  play: '<path d="m7 4 13 8-13 8Z"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
