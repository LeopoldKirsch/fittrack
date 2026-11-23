// Body tab: weight & measurements over time.

import { store } from '../store.js';
import { lineChart } from '../charts.js';
import { esc, icon, todayStr, addDays, fmtDate, relDay, num, round, fmtNum, openSheet, confirmSheet, toast, refresh } from '../ui.js';

const METRICS = [
  { k: 'weight', label: 'Weight', unit: 'kg' },
  { k: 'bodyFat', label: 'Body fat', unit: '%' },
  { k: 'waist', label: 'Waist', unit: 'cm' },
  { k: 'chest', label: 'Chest', unit: 'cm' },
  { k: 'arms', label: 'Arms', unit: 'cm' },
  { k: 'thighs', label: 'Thighs', unit: 'cm' },
  { k: 'hips', label: 'Hips', unit: 'cm' },
];
const RANGES = [
  { d: 30, label: '1M' },
  { d: 90, label: '3M' },
  { d: 365, label: '1Y' },
  { d: 0, label: 'All' },
];
let metric = 'weight';
let range = 90;

const sorted = () => store.list('body').sort((a, b) => (a.date < b.date ? -1 : 1));

export function render(el) {
  const all = sorted();
  const withW = all.filter((b) => num(b.weight) > 0);
  const latest = withW[withW.length - 1];
  const ref = latest && [...withW].reverse().find((b) => b.date <= addDays(latest.date, -28));
  const delta = latest && ref ? num(latest.weight) - num(ref.weight) : null;
  const bf = [...all].reverse().find((b) => num(b.bodyFat) > 0);
  const m = METRICS.find((x) => x.k === metric);
  const from = range ? addDays(todayStr(), -range) : '0000';
  const points = all.filter((b) => num(b[metric]) > 0 && b.date >= from).map((b) => ({ date: b.date, y: num(b[metric]) }));

  el.innerHTML = `
    <header class="page-head"><h1>Body</h1><span class="sync-dot" data-sync></span></header>
    <div class="stats3">
      <div class="stat"><div class="stat-num">${latest ? fmtNum(latest.weight, 1) : '–'}</div><div class="stat-label">kg now</div></div>
      <div class="stat"><div class="stat-num ${delta == null ? '' : delta <= 0 ? 'neg' : 'pos'}">${delta == null ? '–' : (delta > 0 ? '+' : '') + fmtNum(delta, 1)}</div><div class="stat-label">kg vs 4 wks ago</div></div>
      <div class="stat"><div class="stat-num">${bf ? fmtNum(bf.bodyFat, 1) + '%' : '–'}</div><div class="stat-label">body fat</div></div>
    </div>
    <button class="btn primary block" data-act="log">${icon('plus')} Log weight & measurements</button>
    <section class="card">
      <div class="chip-scroll">${METRICS.map((x) => `<button class="chip btnchip ${x.k === metric ? 'on' : ''}" data-metric="${x.k}">${x.label}</button>`).join('')}</div>
      <div id="chart" class="chart-box"></div>
      <div class="row between">
        <div class="seg small">${RANGES.map((r) => `<button class="${r.d === range ? 'on' : ''}" data-range="${r.d}">${r.label}</button>`).join('')}</div>
        ${metric === 'weight' && points.length >= 5 ? `<span class="muted small legend"><i class="lg-line"></i>7-day average</span>` : ''}
      </div>
    </section>
    <div class="section-head"><h2>History</h2></div>
    ${all.length
      ? [...all].reverse().map((b) => `
        <button class="card hrow" data-act="edit" data-date="${b.date}">
          <div class="grow"><div class="title">${relDay(b.date)}</div>
            <div class="muted small">${METRICS.filter((x) => num(b[x.k]) > 0).map((x) => `${x.label} ${fmtNum(b[x.k], 1)} ${x.unit}`).join(' · ')}</div></div>
          ${icon('chevR')}
        </button>`).join('')
      : `<p class="empty">Log your weight regularly (ideally in the morning) to see your trend. Your latest weight is also used for calorie targets.</p>`}
  `;

  requestAnimationFrame(() => lineChart(el.querySelector('#chart'), points, { unit: m.unit, trend: metric === 'weight' }));

  el.onclick = (e) => {
    const mt = e.target.closest('[data-metric]');
    if (mt) { metric = mt.dataset.metric; return refresh(); }
    const rg = e.target.closest('[data-range]');
    if (rg) { range = +rg.dataset.range; return refresh(); }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'log') logSheet(todayStr());
    if (a.dataset.act === 'edit') logSheet(a.dataset.date);
  };
}

function logSheet(date) {
  const existing = store.get('body-' + date);
  const v = existing || {};
  const s = openSheet({
    title: existing ? 'Edit entry' : 'Log measurements',
    tall: true,
    body: `
      <label class="field"><span>Date</span><input type="date" id="b-date" value="${date}"></label>
      <div class="grid2">
        ${METRICS.map((x) => `<label class="field"><span>${x.label} (${x.unit})</span>
          <input inputmode="decimal" data-k="${x.k}" value="${v[x.k] ? esc(v[x.k]) : ''}" placeholder="${x.k === 'weight' ? 'e.g. 74.5' : 'optional'}"></label>`).join('')}
      </div>
      <p class="muted small">Measure waist at the navel, arms and thighs at their widest point, always on the same side.</p>
      <div class="row gap mt">
        ${existing ? `<button class="btn danger ghost grow" data-a="delete">${icon('trash')} Delete</button>` : ''}
        <button class="btn primary grow" data-a="save">${icon('check')} Save</button>
      </div>`,
    mount(el) {
      el.onchange = (e) => {
        if (e.target.id === 'b-date' && e.target.value && e.target.value !== date) {
          s.close();
          logSheet(e.target.value);
        }
      };
      el.onclick = async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'save') {
          const d = el.querySelector('#b-date').value || date;
          const rec = { date: d };
          let any = false;
          el.querySelectorAll('[data-k]').forEach((inp) => {
            const n = num(inp.value);
            if (n > 0) {
              rec[inp.dataset.k] = round(n, 2);
              any = true;
            }
          });
          if (!any) return toast('Enter at least one value');
          store.put('body', rec, 'body-' + d);
          s.close();
          toast('Saved');
          refresh();
        } else if (a === 'delete') {
          if (await confirmSheet(`Delete the entry of ${fmtDate(date)}?`, { ok: 'Delete', danger: true })) {
            store.remove('body-' + date);
            s.close();
            refresh();
          }
        }
      };
    },
  });
}
