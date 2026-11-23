// Tiny SVG chart helpers (no dependencies, theme-aware through CSS classes).

import { esc, parseDate, round } from './ui.js';

/** Renders a time-series line chart into `el`. points: [{date:'YYYY-MM-DD', y:number}] */
export function lineChart(el, points, { unit = '', decimals = 1, trend = false } = {}) {
  if (points.length < 2) {
    el.innerHTML = `<div class="chart-empty">${points.length ? 'Log one more entry to see a chart' : 'No data yet'}</div>`;
    return;
  }
  const W = Math.max(280, el.clientWidth || 340);
  const H = 190;
  const pad = { l: 40, r: 12, t: 14, b: 26 };
  const xs = points.map((p) => parseDate(p.date).getTime());
  const ys = points.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) x1 = x0 + 86400000;
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = y1 - y0 || Math.max(1, Math.abs(y1) * 0.05);
  y0 -= span * 0.15;
  y1 += span * 0.15;
  const X = (t) => pad.l + ((t - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);

  const grid = [];
  for (let i = 0; i <= 3; i++) {
    const v = y0 + ((y1 - y0) * i) / 3;
    const y = Y(v);
    grid.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" class="grid"/>
      <text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" class="axis">${round(v, v > 100 ? 0 : decimals)}</text>`);
  }
  const fmt = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const xl = `<text x="${pad.l}" y="${H - 6}" class="axis">${fmt(x0)}</text>
    <text x="${W - pad.r}" y="${H - 6}" text-anchor="end" class="axis">${fmt(x1)}</text>`;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${path}L${X(xs[xs.length - 1]).toFixed(1)},${H - pad.b}L${X(xs[0]).toFixed(1)},${H - pad.b}Z`;
  const dots = points.length <= 40 ? points.map((p, i) => `<circle cx="${X(xs[i])}" cy="${Y(p.y)}" r="3" class="dot"/>`).join('') : '';

  let trendPath = '';
  if (trend && points.length >= 5) {
    // 7-day rolling mean (by date window)
    const tp = points.map((p, i) => {
      const from = xs[i] - 6 * 86400000;
      const win = points.filter((_, j) => xs[j] >= from && xs[j] <= xs[i]);
      return [X(xs[i]), Y(win.reduce((a, q) => a + q.y, 0) / win.length)];
    });
    trendPath = `<path d="${tp.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('')}" class="trend"/>`;
  }

  const last = points[points.length - 1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="chart" role="img"
      aria-label="Chart, latest ${esc(round(last.y, decimals) + ' ' + unit)}">
    <defs><linearGradient id="g-area" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid.join('')}${xl}
    <path d="${area}" fill="url(#g-area)"/>
    <path d="${path}" class="line ${trend ? 'faint' : ''}"/>
    ${trendPath}${dots}
  </svg>`;
}

/** Progress ring. value/target, label in the middle. */
export function ring(value, target, { size = 132, stroke = 11, center = '', sub = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = target > 0 ? value / target : 0;
  const over = frac > 1;
  const shown = Math.min(1, frac);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring ${over ? 'over' : ''}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${(c * shown).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="47%" text-anchor="middle" class="ring-num">${esc(center)}</text>
    <text x="50%" y="63%" text-anchor="middle" class="ring-sub">${esc(sub)}</text>
  </svg>`;
}
