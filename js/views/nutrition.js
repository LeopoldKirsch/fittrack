// Nutrition tab: daily calories in/out, macros, meals, food search (local + Open Food Facts),
// barcode scanning, custom foods and saved meals.

import { store } from '../store.js';
import { STARTER_FOODS } from '../data-foods.js';
import { MEALS, getProfile, targets, weightOn, entriesOn, entryMacros, sumMacros, dayOut } from '../calc.js';
import { searchOFF, lookupBarcode } from '../off.js';
import { scanBarcode } from '../scanner.js';
import { ring } from '../charts.js';
import {
  esc, icon, todayStr, addDays, fmtDate, relDay, num, round, fmtNum,
  openSheet, confirmSheet, promptSheet, toast, go, refresh,
} from '../ui.js';

let day = todayStr();
const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label || id;

// ---------------------------------------------------------------- main view
export function render(el) {
  const p = getProfile();
  const t = targets(p, weightOn(day));
  const entries = entriesOn(day);
  const tot = sumMacros(entries);
  const out = dayOut(day);
  const left = t.kcal - tot.kcal;
  const balance = tot.kcal - out.total;

  el.innerHTML = `
    <header class="page-head"><h1>Nutrition</h1><span class="sync-dot" data-sync></span></header>

    <div class="date-nav">
      <button class="icon-btn" data-act="prev" aria-label="Previous day">${icon('chevL')}</button>
      <label class="date-label">
        <b>${relDay(day)}</b><span class="muted small">${fmtDate(day, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <input type="date" class="date-overlay" value="${day}" data-act-change="date" aria-label="Choose date">
      </label>
      <button class="icon-btn" data-act="next" aria-label="Next day">${icon('chevR')}</button>
    </div>

    <section class="card summary">
      ${p._set ? '' : `<button class="notice" data-act="profile">Set up your profile to get personalised targets ${icon('chevR')}</button>`}
      <div class="sum-top">
        <div class="sum-side"><div class="big">${fmtNum(tot.kcal)}</div><div class="muted small">eaten</div></div>
        ${ring(tot.kcal, t.kcal, { center: fmtNum(Math.abs(left)), sub: left >= 0 ? 'kcal left' : 'kcal over' })}
        <div class="sum-side"><div class="big">${fmtNum(out.total)}</div><div class="muted small">burned</div></div>
      </div>
      <div class="macros">
        ${macroBar('Protein', tot.p, t.protein, 'p')}
        ${macroBar('Carbs', tot.c, t.carbs, 'c')}
        ${macroBar('Fat', tot.f, t.fat, 'f')}
      </div>
      <button class="energy-row" data-act="energy">
        <span>${icon('steps')} ${out.steps != null ? fmtNum(out.steps) + ' steps' : 'No steps yet'}</span>
        <span>${icon('dumbbell')} ${out.workoutsKcal ? fmtNum(out.workoutsKcal) + ' kcal' : 'No workout'}</span>
        <span class="${balance > 0 ? 'pos' : 'neg'}">${balance > 0 ? '+' : ''}${fmtNum(balance)} kcal</span>
        ${icon('chevR')}
      </button>
    </section>

    ${MEALS.map((m) => {
      const items = entries.filter((e) => e.meal === m.id);
      const sub = sumMacros(items);
      return `<section class="card meal">
        <div class="meal-head">
          <div class="grow">
            <h3>${m.label}</h3>
            <div class="muted small">${items.length ? `${fmtNum(sub.kcal)} kcal · P ${fmtNum(sub.p)} · C ${fmtNum(sub.c)} · F ${fmtNum(sub.f)}` : 'Nothing logged'}</div>
          </div>
          <button class="icon-btn" data-act="meal-menu" data-meal="${m.id}" aria-label="${m.label} options">${icon('dots')}</button>
        </div>
        ${items.map((e) => `
          <button class="food-row" data-act="edit-entry" data-id="${e.id}">
            <div class="grow"><div class="clamp">${esc(e.name)}</div><div class="muted small">${e.brand ? esc(e.brand) + ' · ' : ''}${fmtNum(e.grams)} g</div></div>
            <div class="kcal">${fmtNum(entryMacros(e).kcal)}<span class="muted small"> kcal</span></div>
          </button>`).join('')}
        <button class="add-food" data-act="add" data-meal="${m.id}">${icon('plus')} Add food</button>
      </section>`;
    }).join('')}
  `;

  el.onchange = (e) => {
    if (e.target.dataset.actChange === 'date' && e.target.value) {
      day = e.target.value;
      refresh();
    }
  };
  el.onclick = (e) => {
    const t2 = e.target.closest('[data-act]');
    if (!t2) return;
    const { act, meal, id } = t2.dataset;
    if (act === 'prev') { day = addDays(day, -1); return refresh(); }
    if (act === 'next') { day = addDays(day, 1); return refresh(); }
    if (act === 'profile') return go('#/settings');
    if (act === 'add') return addFoodSheet(meal);
    if (act === 'edit-entry') return editEntry(store.get(id));
    if (act === 'meal-menu') return mealMenu(meal);
    if (act === 'energy') return energySheet();
  };
}

function macroBar(label, val, target, cls) {
  const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0;
  return `<div class="macro">
    <div class="macro-top"><span>${label}</span><span class="muted small">${fmtNum(val)} / ${fmtNum(target)} g</span></div>
    <div class="bar"><div class="bar-fill ${cls} ${val > target * 1.05 ? 'over' : ''}" style="width:${pct}%"></div></div>
  </div>`;
}

// ---------------------------------------------------------------- food helpers
const foodKey = (f) => f.id || `${f.source}:${f.barcode || ''}:${f.name}:${f.brand || ''}`;
const per100 = (f) => `${fmtNum(f.kcal)} kcal · P ${fmtNum(f.p, 1)} · C ${fmtNum(f.c, 1)} · F ${fmtNum(f.f, 1)} /100 g`;
const myFoods = () => store.list('food').sort((a, b) => a.name.localeCompare(b.name));

function recentFoods() {
  const seen = new Set();
  const out = [];
  const all = store.list('entry').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  for (const e of all) {
    const k = (e.name + '|' + (e.brand || '')).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: e.name, brand: e.brand || '', kcal: e.kcal, p: e.p, c: e.c, f: e.f, serving: e.serving || null, servingLabel: e.servingLabel || '', barcode: e.barcode || '', id: e.foodRef || null, lastGrams: e.grams, source: 'recent' });
    if (out.length >= 15) break;
  }
  return out;
}

function matchFoods(q) {
  const terms = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  const hay = (f) => (f.name + ' ' + (f.brand || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const mine = myFoods().filter((f) => terms.every((t) => hay(f).includes(t)));
  const starter = STARTER_FOODS.filter((f) => terms.every((t) => hay(f).includes(t)));
  // names starting with the first term first
  const rank = (f) => (hay(f).startsWith(terms[0]) ? 0 : 1);
  starter.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length);
  return [...mine, ...starter].slice(0, 40);
}

function foodRow(f, cache) {
  const k = foodKey(f);
  cache.set(k, f);
  return `<button class="food-row" data-food="${esc(k)}">
    <div class="grow">
      <div class="clamp">${esc(f.name)}${f.source === 'off' || f.barcode ? ' <span class="tag">product</span>' : ''}</div>
      <div class="muted small clamp">${f.brand ? esc(f.brand) + ' · ' : ''}${per100(f)}</div>
    </div>
    <span class="add-dot">${icon('plus')}</span>
  </button>`;
}

function saveOffFood(f) {
  if (!(f.source === 'off' && f.barcode)) return f.id || null;
  const existing = myFoods().find((m) => m.barcode === f.barcode);
  if (existing) return existing.id;
  const { lastGrams, id, ...clean } = f;
  return store.put('food', { ...clean, source: 'off' });
}

// ---------------------------------------------------------------- add food flow
function addFoodSheet(meal) {
  let query = '';
  let off = { q: '', state: 'idle', results: [] };
  const cache = new Map();
  const s = openSheet({ title: `Add to ${mealLabel(meal)}`, tall: true });

  const searchPage = () => {
    s.setTitle(`Add to ${mealLabel(meal)}`);
    s.setBody(
      `<div class="search-row">
        <div class="search-box grow">${icon('search')}<input id="fq" type="search" placeholder="Search foods (e.g. oats, skyr)" value="${esc(query)}" autocomplete="off" enterkeyhint="search"></div>
        <button class="btn square" data-a="scan" aria-label="Scan barcode">${icon('barcode')}</button>
      </div>
      <div class="seg">
        <button class="on">Foods</button>
        <button data-a="saved">Saved meals</button>
        <button data-a="create">Create food</button>
      </div>
      <div id="fres"></div>`,
      (el) => {
        const res = el.querySelector('#fres');
        const draw = () => {
          cache.clear();
          const q = query.trim();
          if (!q) {
            const rec = recentFoods();
            const mine = myFoods();
            res.innerHTML =
              (rec.length ? `<div class="group-label">Recent</div>${rec.map((f) => foodRow(f, cache)).join('')}` : '') +
              (mine.length ? `<div class="group-label">My foods</div>${mine.map((f) => foodRow(f, cache)).join('')}` : '') +
              (!rec.length && !mine.length ? `<p class="empty">Type to search ~200 common foods, or scan a product's barcode.</p>` : '');
            return;
          }
          const local = matchFoods(q);
          let offHtml = '';
          if (off.q === q && off.state === 'loading') offHtml = `<p class="muted center"><span class="spinner"></span> Searching Open Food Facts…</p>`;
          else if (off.q === q && off.state === 'done')
            offHtml = off.results.length ? off.results.map((f) => foodRow(f, cache)).join('') : `<p class="empty">No products found.</p>`;
          else if (off.q === q && off.state === 'error')
            offHtml = `<p class="empty">Open Food Facts is busy or unreachable. <button class="link" data-a="off">Try again</button></p>`;
          else offHtml = `<button class="btn block" data-a="off">${icon('search')} Search Open Food Facts for “${esc(q)}”</button>`;
          res.innerHTML =
            (local.length ? `<div class="group-label">Foods</div>${local.map((f) => foodRow(f, cache)).join('')}` : `<p class="empty">No match in your foods.</p>`) +
            `<div class="group-label">Products (Open Food Facts)</div>${offHtml}`;
        };
        const runOff = async () => {
          const q = query.trim();
          if (!q) return;
          off = { q, state: 'loading', results: [] };
          draw();
          try {
            const results = await searchOFF(q);
            if (off.q !== q) return;
            off = { q, state: 'done', results };
          } catch {
            if (off.q !== q) return;
            off = { q, state: 'error', results: [] };
          }
          if (document.body.contains(res)) draw();
        };
        draw();
        const inp = el.querySelector('#fq');
        el.oninput = (e) => {
          if (e.target === inp) {
            query = inp.value;
            draw();
          }
        };
        el.onkeydown = (e) => {
          if (e.target === inp && e.key === 'Enter') {
            e.preventDefault();
            inp.blur();
            runOff();
          }
        };
        el.onclick = async (e) => {
          const fb = e.target.closest('[data-food]');
          if (fb) return qtyPage(cache.get(fb.dataset.food));
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (a === 'off') return runOff();
          if (a === 'saved') return savedPage();
          if (a === 'create') return createPage({ name: query });
          if (a === 'scan') return scan();
        };
      }
    );
  };

  const scan = async () => {
    const code = await scanBarcode();
    if (!code) return;
    const mine = myFoods().find((f) => f.barcode === code);
    if (mine) return qtyPage(mine);
    toast('Looking up product…');
    try {
      const f = await lookupBarcode(code);
      if (f) return qtyPage(f);
      toast('Product not found: enter it from the label');
    } catch {
      toast('Lookup failed (offline?): enter it manually');
    }
    createPage({ barcode: code });
  };

  const qtyPage = (food) => {
    if (!food) return;
    s.setTitle(food.name);
    s.setBody(qtyForm(food, { meal, grams: food.lastGrams || food.serving || 100, okLabel: 'Add' }), (el) =>
      wireQty(el, food, {
        onBack: searchPage,
        onOk: (grams, m) => {
          const foodRef = saveOffFood(food);
          store.put('entry', {
            date: day, meal: m, name: food.name, brand: food.brand || '', grams,
            kcal: food.kcal, p: food.p, c: food.c, f: food.f,
            serving: food.serving || null, servingLabel: food.servingLabel || '',
            barcode: food.barcode || '', foodRef, createdAt: Date.now(),
          });
          toast(`Added to ${mealLabel(m)}`);
          refresh();
          query = '';
          searchPage();
        },
      })
    );
  };

  const createPage = (pre = {}) => {
    s.setTitle('Create food');
    s.setBody(
      `<p class="muted small">Enter the values per 100 g, as printed on the nutrition label.</p>
      <label class="field"><span>Name</span><input id="cf-name" value="${esc(pre.name || '')}" placeholder="e.g. Homemade granola"></label>
      <label class="field"><span>Brand (optional)</span><input id="cf-brand" value="${esc(pre.brand || '')}"></label>
      <div class="grid2">
        <label class="field"><span>Calories (kcal)</span><input id="cf-kcal" inputmode="decimal"></label>
        <label class="field"><span>Protein (g)</span><input id="cf-p" inputmode="decimal"></label>
        <label class="field"><span>Carbs (g)</span><input id="cf-c" inputmode="decimal"></label>
        <label class="field"><span>Fat (g)</span><input id="cf-f" inputmode="decimal"></label>
      </div>
      <label class="field"><span>Serving size in g (optional)</span><input id="cf-serving" inputmode="decimal" placeholder="e.g. 40"></label>
      ${pre.barcode ? `<p class="muted small">Barcode ${esc(pre.barcode)}</p>` : ''}
      <div class="row gap mt"><button class="btn ghost grow" data-a="back">Back</button><button class="btn primary grow" data-a="save">Save food</button></div>`,
      (el) => {
        el.onclick = (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (a === 'back') return searchPage();
          if (a !== 'save') return;
          const v = (id) => el.querySelector(id).value;
          const name = v('#cf-name').trim();
          if (!name) return toast('Name is required');
          if (!v('#cf-kcal')) return toast('Calories are required');
          const sv = num(v('#cf-serving'));
          const food = {
            name, brand: v('#cf-brand').trim(), kcal: num(v('#cf-kcal')), p: num(v('#cf-p')), c: num(v('#cf-c')), f: num(v('#cf-f')),
            serving: sv || null, servingLabel: sv ? '1 serving' : '', barcode: pre.barcode || '', source: 'custom',
          };
          const id = store.put('food', food);
          toast('Saved to My foods');
          qtyPage({ ...food, id });
        };
      }
    );
  };

  const savedPage = () => {
    const meals = store.list('savedmeal').sort((a, b) => a.name.localeCompare(b.name));
    s.setTitle('Saved meals');
    s.setBody(
      `<div class="seg"><button data-a="foods">Foods</button><button class="on">Saved meals</button><button data-a="create">Create food</button></div>
      ${meals.length
        ? meals.map((sm) => {
            const tot = sumMacros(sm.items || []);
            return `<div class="food-row">
              <button class="grow left" data-add="${sm.id}">
                <div>${esc(sm.name)}</div>
                <div class="muted small clamp">${fmtNum(tot.kcal)} kcal · ${esc((sm.items || []).map((i) => i.name).join(', '))}</div>
              </button>
              <button class="icon-btn" data-del="${sm.id}" aria-label="Delete saved meal">${icon('trash')}</button>
            </div>`;
          }).join('')
        : `<p class="empty">No saved meals yet. Log a meal, then use its ⋯ menu → “Save as meal”.</p>`}`,
      (el) => {
        el.onclick = async (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (a === 'foods') return searchPage();
          if (a === 'create') return createPage();
          const add = e.target.closest('[data-add]')?.dataset.add;
          if (add) {
            const sm = store.get(add);
            const now = Date.now();
            (sm.items || []).forEach((it, i) => store.put('entry', { ...it, date: day, meal, createdAt: now + i }));
            toast(`${sm.name} added to ${mealLabel(meal)}`);
            refresh();
            return s.close();
          }
          const del = e.target.closest('[data-del]')?.dataset.del;
          if (del && (await confirmSheet('Delete this saved meal?', { ok: 'Delete', danger: true }))) {
            store.remove(del);
            savedPage();
          }
        };
      }
    );
  };

  searchPage();
}

// Quantity form shared by "add" and "edit".
function qtyForm(food, { meal, grams, okLabel, edit = false }) {
  const chips = [];
  if (food.serving) chips.push([food.serving, `${food.servingLabel || '1 serving'} (${food.serving} g)`]);
  for (const g of [50, 100, 150, 200, 250]) if (g !== food.serving) chips.push([g, `${g} g`]);
  return `
    <p class="muted small">${food.brand ? esc(food.brand) + ' · ' : ''}${per100(food)}</p>
    <label class="field"><span>Quantity (grams)</span><input id="qg" inputmode="decimal" value="${round(grams, 1)}"></label>
    <div class="chips">${chips.map(([g, l]) => `<button class="chip btnchip" data-g="${g}">${esc(l)}</button>`).join('')}</div>
    <label class="field"><span>Meal</span><select id="qmeal">${MEALS.map((m) => `<option value="${m.id}" ${m.id === meal ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
    <div class="preview" id="qprev"></div>
    <div class="row gap mt">
      ${edit ? `<button class="btn danger ghost grow" data-a="delete">${icon('trash')} Delete</button>` : `<button class="btn ghost grow" data-a="back">Back</button>`}
      <button class="btn primary grow" data-a="ok">${okLabel}</button>
    </div>`;
}

function wireQty(el, food, { onBack, onOk, onDelete }) {
  const inp = el.querySelector('#qg');
  const prev = el.querySelector('#qprev');
  const upd = () => {
    const m = entryMacros({ ...food, grams: num(inp.value) });
    prev.innerHTML = `<div><b>${fmtNum(m.kcal)}</b><span>kcal</span></div><div><b>${fmtNum(m.p, 1)}</b><span>protein</span></div>
      <div><b>${fmtNum(m.c, 1)}</b><span>carbs</span></div><div><b>${fmtNum(m.f, 1)}</b><span>fat</span></div>`;
  };
  upd();
  setTimeout(() => inp.select(), 300);
  el.oninput = (e) => e.target === inp && upd();
  el.onkeydown = (e) => e.target === inp && e.key === 'Enter' && submit();
  const submit = () => {
    const g = num(inp.value);
    if (g <= 0) return toast('Enter a quantity');
    onOk(g, el.querySelector('#qmeal').value);
  };
  el.onclick = (e) => {
    const g = e.target.closest('[data-g]')?.dataset.g;
    if (g) {
      inp.value = g;
      return upd();
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') onBack?.();
    if (a === 'delete') onDelete?.();
    if (a === 'ok') submit();
  };
}

function editEntry(entry) {
  if (!entry) return;
  const s = openSheet({
    title: entry.name,
    body: qtyForm(entry, { meal: entry.meal, grams: entry.grams, okLabel: 'Save', edit: true }),
    mount: (el) =>
      wireQty(el, entry, {
        onOk: (grams, meal) => {
          store.put('entry', { ...entry, grams, meal }, entry.id);
          s.close();
          refresh();
        },
        onDelete: () => {
          store.remove(entry.id);
          s.close();
          toast('Removed');
          refresh();
        },
      }),
  });
}

// ---------------------------------------------------------------- meal menu
function mealMenu(meal) {
  const items = entriesOn(day).filter((e) => e.meal === meal);
  const s = openSheet({
    title: mealLabel(meal),
    body: `<div class="menu">
      ${items.length ? `<button data-a="save">${icon('bookmark')} Save as meal</button>` : ''}
      <button data-a="yesterday">${icon('copy')} Copy ${mealLabel(meal).toLowerCase()} from the previous day</button>
      ${items.length ? `<button data-a="clear" class="danger">${icon('trash')} Clear ${mealLabel(meal).toLowerCase()}</button>` : ''}
    </div>`,
    mount(el) {
      el.onclick = async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        if (a === 'save') {
          s.close();
          const name = await promptSheet('Save as meal', { label: 'Meal name', placeholder: 'e.g. My usual breakfast' });
          if (!name) return;
          store.put('savedmeal', {
            name,
            items: items.map(({ id, date, meal: _m, createdAt, ...it }) => it),
          });
          toast('Meal saved: find it under “Saved meals”');
        } else if (a === 'yesterday') {
          const prevItems = entriesOn(addDays(day, -1)).filter((e2) => e2.meal === meal);
          s.close();
          if (!prevItems.length) return toast('Nothing logged for that meal the previous day');
          const now = Date.now();
          prevItems.forEach(({ id, ...it }, i) => store.put('entry', { ...it, date: day, createdAt: now + i }));
          toast(`Copied ${prevItems.length} item${prevItems.length > 1 ? 's' : ''}`);
          refresh();
        } else if (a === 'clear') {
          s.close();
          if (await confirmSheet(`Remove all ${items.length} items from ${mealLabel(meal).toLowerCase()}?`, { ok: 'Clear', danger: true })) {
            items.forEach((it) => store.remove(it.id));
            refresh();
          }
        }
      };
    },
  });
}

// ---------------------------------------------------------------- energy sheet
function energySheet() {
  const o = dayOut(day);
  const tot = sumMacros(entriesOn(day));
  const s = openSheet({
    title: `Calories: ${relDay(day)}`,
    tall: true,
    body: `
      <div class="kv"><span>Eaten</span><b>${fmtNum(tot.kcal)} kcal</b></div>
      <div class="kv"><span>Resting metabolism (BMR)</span><b>${fmtNum(o.bmr)} kcal</b></div>
      <div class="kv"><span>Baseline ${o.steps != null ? '(BMR + digestion)' : '(BMR × 1.2, no step data)'}</span><b>${fmtNum(o.base)} kcal</b></div>
      <div class="kv"><span>Steps ${o.steps != null ? `(${fmtNum(o.steps)}${o.stepsSource === 'health' ? ', from Apple Health' : ', entered manually'})` : ''}</span><b>${o.steps != null ? '+' + fmtNum(o.stepsKcal) + ' kcal' : '–'}</b></div>
      <div class="kv"><span>Workouts (${o.workouts})</span><b>+${fmtNum(o.workoutsKcal)} kcal</b></div>
      <div class="kv total"><span>Estimated burned</span><b>${fmtNum(o.estimated)} kcal</b></div>
      ${o.override != null ? `<div class="kv total accent"><span>Your override</span><b>${fmtNum(o.override)} kcal</b></div>` : ''}
      <div class="kv total"><span>Balance (eaten − burned)</span><b class="${tot.kcal - o.total > 0 ? 'pos' : 'neg'}">${tot.kcal - o.total > 0 ? '+' : ''}${fmtNum(tot.kcal - o.total)} kcal</b></div>

      <h3 class="mt-lg">Steps</h3>
      <p class="muted small">Synced automatically from Apple Health once the Shortcut is set up (Profile tab → Apple Health steps). You can also enter them here.</p>
      <div class="row gap"><input id="steps-in" inputmode="numeric" class="grow" placeholder="Steps" value="${o.steps ?? ''}"><button class="btn" data-a="steps">Save</button></div>

      <h3 class="mt-lg">Override total</h3>
      <p class="muted small">Have a number from your watch? Enter the total burned for the day and it replaces the estimate.</p>
      <div class="row gap"><input id="ov-in" inputmode="numeric" class="grow" placeholder="Total kcal burned" value="${o.override ?? ''}">
        <button class="btn" data-a="ov">Save</button>${o.override != null ? `<button class="btn ghost" data-a="ov-clear">Clear</button>` : ''}</div>`,
    mount(el) {
      el.onclick = (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'steps') {
          const v = el.querySelector('#steps-in').value.trim();
          if (v === '') store.remove('steps-' + day);
          else store.put('steps', { date: day, steps: Math.round(num(v)), source: 'manual' }, 'steps-' + day);
        } else if (a === 'ov') {
          const v = num(el.querySelector('#ov-in').value);
          if (v <= 0) return toast('Enter a number');
          store.put('dayout', { date: day, kcal: Math.round(v) }, 'out-' + day);
        } else if (a === 'ov-clear') store.remove('out-' + day);
        else return;
        s.close();
        refresh();
        toast('Saved');
      };
    },
  });
}
