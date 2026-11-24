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
    <defs>
      <linearGradient id="g-area" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#cbcbcb" stop-opacity=".16"/><stop offset="1" stop-color="#cbcbcb" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="g-line" gradientUnits="userSpaceOnUse" x1="${pad.l}" x2="${W - pad.r}" y1="0" y2="0">
        <stop offset="0" stop-color="#979797"/><stop offset="1" stop-color="#f3f3f3"/>
      </linearGradient>
    </defs>
    ${grid.join('')}<line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" class="baseline"/>${xl}
    <path d="${area}" fill="url(#g-area)"/>
    <path d="${path}" class="line ${trend ? 'faint' : ''}"/>
    ${trendPath}${dots}
  </svg>`;
}

/**
 * Calorie ring. Under target: gray→white gradient arc. Over target the ring keeps going:
 * completed laps stay drawn, the extra calories run on in soft red (1.5× = one and a half
 * turns), and a soft shadow just past the tip shows where the current lap ends.
 */
export function ring(value, target, { size = 136, stroke = 12, center = '', sub = '' } = {}) {
  const cx = size / 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = target > 0 ? Math.max(0, value / target) : 0;
  const over = frac > 1;
  const RED = '#e4776f';
  // arc from `start` (fraction of a turn, 0 = top) of length `len`, clockwise
  const arc = (start, len, stroke2, extra = '') =>
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${stroke2}" stroke-width="${stroke}"
      stroke-dasharray="${(c * Math.min(len, 1)).toFixed(2)} ${(c + 1).toFixed(2)}"
      transform="rotate(${(-90 + start * 360).toFixed(2)} ${cx} ${cx})" ${extra}/>`;

  let body = `<circle cx="${cx}" cy="${cx}" r="${r}" class="ring-bg" stroke-width="${stroke}" fill="none"/>`;
  if (!over) {
    if (frac > 0) body += arc(0, frac, 'url(#g-ring)', 'stroke-linecap="round"');
  } else {
    const laps = Math.floor(frac);
    let rem = frac - laps;
    // the lap underneath: first lap is the normal gradient, later laps are red
    body += arc(0, 1, laps >= 2 ? '#a9564f' : 'url(#g-ring)');
    if (rem < 0.002) rem = 0.002; // exactly on a lap boundary: still show the tip
    // shade just after the tip, fading out, drawn on the lap underneath
    // overlapping translucent arcs that start at the tip and get shorter → smooth fade-out
    const steps = 18, span = 0.085;
    for (let i = 1; i <= steps; i++) {
      body += arc(rem, (span * i) / steps, 'rgba(0,0,0,0.075)');
    }
    body += arc(0, rem, RED, 'stroke-linecap="round"');
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring ${over ? 'over' : ''}" role="img"
      aria-label="${esc(Math.round(frac * 100) + '% of daily calories')}">
    <defs><linearGradient id="g-ring" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#979797"/><stop offset="1" stop-color="#f3f3f3"/>
    </linearGradient></defs>
    ${body}
    <text x="50%" y="48%" text-anchor="middle" class="ring-num">${esc(center)}</text>
    <text x="50%" y="62%" text-anchor="middle" class="ring-sub">${esc(sub)}</text>
  </svg>`;
}
