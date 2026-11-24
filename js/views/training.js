// Training tab: overview (streak, calendar, routines, history), live workout logger,
// routine editor and exercise picker.

import { store } from '../store.js';
import { EXERCISES, GROUPS } from '../data-exercises.js';
import { workoutVolume, workoutSetCount, workoutKcal, weightOn } from '../calc.js';
import {
  esc, icon, todayStr, parseDate, addDays, fmtDate, relDay, num, fmtNum,
  openSheet, confirmSheet, promptSheet, toast, go, refresh,
} from '../ui.js';

// ---------------------------------------------------------------- helpers
const ACTIVE_KEY = 'ft.active';
export function getActive() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
  } catch {
    return null;
  }
}
const saveActive = (a) => (a ? localStorage.setItem(ACTIVE_KEY, JSON.stringify(a)) : localStorage.removeItem(ACTIVE_KEY));

const sortedWorkouts = () =>
  store.list('workout').sort((a, b) => (a.date === b.date ? (b.startedAt || 0) - (a.startedAt || 0) : a.date < b.date ? 1 : -1));

const allExercises = () => [...EXERCISES, ...store.list('exercise')];

function lastPerformance(exId, excludeId) {
  for (const w of sortedWorkouts()) {
    if (w.id === excludeId) continue;
    const ex = (w.exercises || []).find((e) => e.exId === exId);
    if (ex?.sets?.length) return ex.sets;
  }
  return null;
}

const setLabel = (type, s) =>
  type === 'cardio'
    ? [num(s.km) ? `${s.km} km` : '', num(s.min) ? `${s.min} min` : ''].filter(Boolean).join(' · ') || '–'
    : `${num(s.kg)} kg × ${num(s.reps)}`;

function weekKey(dateStr) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return todayStr(d);
}
function weekStreak(ws) {
  const weeks = new Set(ws.map((w) => weekKey(w.date)));
  let k = weekKey(todayStr());
  if (!weeks.has(k)) k = addDays(k, -7); // the current week isn't over yet
  let n = 0;
  while (weeks.has(k)) {
    n++;
    k = addDays(k, -7);
  }
  return n;
}
const fmtDur = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};

// ---------------------------------------------------------------- overview
let cal = (() => {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
})();
let histLimit = 15;

export function render(el) {
  const ws = sortedWorkouts();
  const active = getActive();
  const thisWeek = ws.filter((w) => weekKey(w.date) === weekKey(todayStr())).length;
  const routines = store.list('routine').sort((a, b) => a.name.localeCompare(b.name));

  el.innerHTML = `
    <header class="page-head"><h1>Training</h1><span class="sync-dot" data-sync></span></header>
    ${active ? `<button class="banner" data-act="resume">${icon('clock')}<span class="grow">Workout in progress: <b>${esc(active.name)}</b></span><span class="banner-cta">Resume ${icon('chevR')}</span></button>` : ''}
    <div class="stats3">
      <div class="stat"><div class="stat-num">${weekStreak(ws)}</div><div class="stat-label">week streak</div></div>
      <div class="stat"><div class="stat-num">${thisWeek}</div><div class="stat-label">this week</div></div>
      <div class="stat"><div class="stat-num">${ws.length}</div><div class="stat-label">total workouts</div></div>
    </div>
    <section class="card">${calendarHtml(ws)}</section>
    <button class="btn primary block" data-act="start-empty">${icon('play')} Start empty workout</button>

    <div class="section-head"><h2>Routines</h2><button class="btn small ghost" data-act="new-routine">${icon('plus')} New routine</button></div>
    ${routines.length
      ? routines.map((r) => `
        <div class="card routine">
          <button class="routine-main" data-act="edit-routine" data-id="${r.id}">
            <div class="title">${esc(r.name)}</div>
            <div class="muted small clamp">${esc((r.exercises || []).map((e) => e.name).join(' · ') || 'No exercises yet')}</div>
          </button>
          <button class="btn small accent" data-act="start-routine" data-id="${r.id}">${icon('play')} Start</button>
        </div>`).join('')
      : `<p class="empty">No routines yet. Create one, e.g. “Push day”, and start it in one tap with last session's weights pre-filled.</p>`}

    <div class="section-head"><h2>History</h2></div>
    ${ws.length
      ? ws.slice(0, histLimit).map(workoutRow).join('') +
        (ws.length > histLimit ? `<button class="btn ghost block" data-act="more">Show more</button>` : '')
      : `<p class="empty">Finished workouts will appear here.</p>`}
  `;

  el.onclick = async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case 'resume': return go('#/workout');
      case 'start-empty': return startWorkout({ name: defaultName() });
      case 'start-routine': return startFromRoutine(store.get(id));
      case 'new-routine': return go('#/routine/new');
      case 'edit-routine': return go('#/routine/' + id);
      case 'open-workout': return showWorkout(id);
      case 'more': histLimit += 20; return refresh();
      case 'cal-prev': cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } return refresh();
      case 'cal-next': cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } return refresh();
      case 'cal-day': return showDay(t.dataset.date);
    }
  };
}

function defaultName() {
  const h = new Date().getHours();
  return h < 11 ? 'Morning workout' : h < 17 ? 'Afternoon workout' : 'Evening workout';
}

function workoutRow(w) {
  const sets = workoutSetCount(w);
  const vol = workoutVolume(w);
  return `<button class="card wrow" data-act="open-workout" data-id="${w.id}">
    <div class="wrow-date"><b>${parseDate(w.date).getDate()}</b><span>${parseDate(w.date).toLocaleDateString('en-GB', { month: 'short' })}</span></div>
    <div class="grow">
      <div class="title">${esc(w.name)}</div>
      <div class="muted small">${relDay(w.date)}${w.duration ? ` · ${w.duration} min` : ''} · ${sets} sets${vol ? ` · ${fmtNum(vol)} kg` : ''}</div>
      <div class="muted small clamp">${esc((w.exercises || []).map((e) => e.name).join(' · '))}</div>
    </div>
  </button>`;
}

function calendarHtml(ws) {
  const days = new Set(ws.map((w) => w.date));
  const first = new Date(cal.y, cal.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const n = new Date(cal.y, cal.m + 1, 0).getDate();
  const today = todayStr();
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= n; d++) {
    const ds = todayStr(new Date(cal.y, cal.m, d));
    const has = days.has(ds);
    cells += `<button class="cal-d ${has ? 'has' : ''} ${ds === today ? 'today' : ''}" ${has ? `data-act="cal-day" data-date="${ds}"` : 'tabindex="-1"'}>${d}</button>`;
  }
  const count = ws.filter((w) => w.date.startsWith(`${cal.y}-${String(cal.m + 1).padStart(2, '0')}`)).length;
  return `<div class="cal-head">
      <button class="icon-btn" data-act="cal-prev" aria-label="Previous month">${icon('chevL')}</button>
      <div class="center"><b>${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
        <div class="muted small">${count} workout${count === 1 ? '' : 's'}</div></div>
      <button class="icon-btn" data-act="cal-next" aria-label="Next month">${icon('chevR')}</button>
    </div>
    <div class="cal-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="cal-wd">${d}</span>`).join('')}${cells}</div>`;
}

function showDay(date) {
  const ws = sortedWorkouts().filter((w) => w.date === date);
  if (ws.length === 1) return showWorkout(ws[0].id);
  const s = openSheet({
    title: fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }),
    body: ws.map(workoutRow).join(''),
    mount(el) {
      el.onclick = (e) => {
        const t = e.target.closest('[data-id]');
        if (t) {
          s.close();
          showWorkout(t.dataset.id);
        }
      };
    },
  });
}

function showWorkout(id) {
  const w = store.get(id);
  if (!w) return;
  const kcal = workoutKcal(w, weightOn(w.date), store.get('steps-' + w.date) != null);
  const s = openSheet({
    title: w.name,
    tall: true,
    body: `
      <p class="muted">${fmtDate(w.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <div class="chips">
        ${w.duration ? `<span class="chip">${icon('clock')} ${w.duration} min</span>` : ''}
        <span class="chip">${workoutSetCount(w)} sets</span>
        ${workoutVolume(w) ? `<span class="chip">${fmtNum(workoutVolume(w))} kg volume</span>` : ''}
        <span class="chip">${icon('flame')} ≈${kcal} kcal</span>
      </div>
      ${(w.exercises || []).map((ex) => `
        <div class="detail-ex">
          <div class="title">${esc(ex.name)}</div>
          ${(ex.sets || []).map((st, i) => `<div class="detail-set"><span class="muted">${i + 1}</span><span>${setLabel(ex.type, st)}</span></div>`).join('')}
        </div>`).join('')}
      ${w.notes ? `<p class="muted">${esc(w.notes)}</p>` : ''}
      <div class="row gap mt-lg wrap">
        <button class="btn grow" data-a="edit">${icon('edit')} Edit</button>
        <button class="btn grow" data-a="routine">${icon('bookmark')} Save as routine</button>
        <button class="btn grow" data-a="repeat">${icon('play')} Repeat</button>
        <button class="btn danger ghost grow" data-a="delete">${icon('trash')} Delete</button>
      </div>`,
    mount(el) {
      el.onclick = async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        if (a === 'edit') {
          if (getActive()) return toast('Finish or discard the workout in progress first');
          s.close();
          saveActive({ ...structuredClone(w), editId: w.id, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((st) => ({ ...st, done: true })) })) });
          go('#/workout');
        } else if (a === 'routine') {
          const name = await promptSheet('Save as routine', { label: 'Routine name', value: w.name });
          if (!name) return;
          store.put('routine', {
            name,
            exercises: w.exercises.map((ex) => ({ exId: ex.exId, name: ex.name, type: ex.type, sets: ex.sets.length, reps: ex.type === 'cardio' ? '' : ex.sets[0]?.reps || '' })),
          });
          toast('Routine saved');
          s.close();
          refresh();
        } else if (a === 'repeat') {
          s.close();
          startFromRoutine({ name: w.name, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.length })) });
        } else if (a === 'delete') {
          if (await confirmSheet('Delete this workout permanently?', { ok: 'Delete', danger: true })) {
            store.remove(id);
            s.close();
            toast('Workout deleted');
            refresh();
          }
        }
      };
    },
  });
}

// ---------------------------------------------------------------- start workouts
function startWorkout({ name, exercises = [] }) {
  if (getActive()) {
    toast('A workout is already in progress');
    return go('#/workout');
  }
  saveActive({ name, date: todayStr(), startedAt: Date.now(), exercises });
  go('#/workout');
}

function startFromRoutine(r) {
  if (!r) return;
  const exercises = (r.exercises || []).map((re) => {
    const prev = lastPerformance(re.exId);
    const n = Math.max(1, num(re.sets) || 3);
    const sets = [];
    for (let i = 0; i < n; i++) {
      const p = prev?.[Math.min(i, prev.length - 1)];
      sets.push(re.type === 'cardio'
        ? { km: p?.km ?? '', min: p?.min ?? '', done: false }
        : { kg: p?.kg ?? '', reps: p?.reps ?? (re.reps || ''), done: false });
    }
    return { exId: re.exId, name: re.name, type: re.type, sets };
  });
  startWorkout({ name: r.name, exercises });
}

const emptySet = (type, prev) => (type === 'cardio' ? { km: prev?.km ?? '', min: prev?.min ?? '', done: false } : { kg: prev?.kg ?? '', reps: prev?.reps ?? '', done: false });

// ---------------------------------------------------------------- live workout
let timerId = null;

export function renderWorkout(el) {
  clearInterval(timerId);
  const a = getActive();
  if (!a) return go('#/training');

  el.innerHTML = `
    <header class="page-head sticky">
      <button class="icon-btn" data-act="minimize" aria-label="Back">${icon('chevL')}</button>
      <input class="title-input grow" data-f="name" value="${esc(a.name)}" aria-label="Workout name">
      ${a.editId ? '' : `<span class="timer">${icon('clock')}<span id="timer">0:00</span></span>`}
    </header>
    ${a.editId ? `<label class="field"><span>Date</span><input type="date" data-f="date" value="${a.date}"></label>` : ''}
    ${a.exercises.map((ex, i) => exerciseCard(ex, i, a)).join('') || `<p class="empty">Add your first exercise to get started.</p>`}
    <button class="btn block" data-act="add-ex">${icon('plus')} Add exercise</button>
    <label class="field mt"><span>Notes</span><textarea data-f="notes" rows="2" placeholder="How did it feel?">${esc(a.notes || '')}</textarea></label>
    <div class="row gap mt-lg">
      <button class="btn danger ghost grow" data-act="discard">${a.editId ? 'Cancel' : 'Discard'}</button>
      <button class="btn primary grow" data-act="finish">${icon('check')} ${a.editId ? 'Save changes' : 'Finish workout'}</button>
    </div>`;

  if (!a.editId) {
    const tick = () => {
      const t = document.getElementById('timer');
      if (!t) return clearInterval(timerId);
      t.textContent = fmtDur(Math.floor((Date.now() - a.startedAt) / 1000));
    };
    tick();
    timerId = setInterval(tick, 1000);
  }

  el.oninput = (e) => {
    const t = e.target;
    const cur = getActive();
    if (!cur) return;
    if (t.dataset.f) cur[t.dataset.f] = t.value;
    else if (t.dataset.k) cur.exercises[+t.dataset.i].sets[+t.dataset.j][t.dataset.k] = t.value;
    else return;
    saveActive(cur);
  };

  el.onclick = async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const cur = getActive();
    const i = +t.dataset.i, j = +t.dataset.j;
    switch (t.dataset.act) {
      case 'minimize':
        return go('#/training');
      case 'toggle': {
        const ex = cur.exercises[i];
        const st = ex.sets[j];
        st.done = !st.done;
        if (st.done) {
          // ticking an empty set copies the placeholder (previous) values
          const row = t.closest('.sg-row');
          row.querySelectorAll('input').forEach((inp) => {
            if (!inp.value && inp.placeholder && inp.placeholder !== '–') {
              inp.value = inp.placeholder;
              st[inp.dataset.k] = inp.placeholder;
            }
          });
        }
        saveActive(cur);
        t.classList.toggle('on', st.done);
        t.closest('.sg-row').classList.toggle('done', st.done);
        if (st.done) navigator.vibrate?.(20);
        return;
      }
      case 'add-set': {
        const ex = cur.exercises[i];
        const last = ex.sets[ex.sets.length - 1];
        ex.sets.push(emptySet(ex.type, last));
        saveActive(cur);
        return refresh();
      }
      case 'del-set': {
        const ex = cur.exercises[i];
        if (ex.sets.length > 1) ex.sets.pop();
        saveActive(cur);
        return refresh();
      }
      case 'ex-menu':
        return exerciseMenu(i);
      case 'add-ex': {
        const picked = await pickExercise();
        if (!picked) return;
        const c2 = getActive();
        const prev = lastPerformance(picked.id, c2.editId);
        const n = prev ? prev.length : picked.type === 'cardio' ? 1 : 3;
        const sets = [];
        for (let k = 0; k < n; k++) sets.push(emptySet(picked.type, prev?.[k]));
        c2.exercises.push({ exId: picked.id, name: picked.name, type: picked.type, sets });
        saveActive(c2);
        refresh();
        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
        return;
      }
      case 'discard': {
        const msg = cur.editId ? 'Discard your changes to this workout?' : 'Discard this workout? Nothing will be saved.';
        if (await confirmSheet(msg, { ok: 'Discard', danger: true })) {
          saveActive(null);
          go('#/training');
        }
        return;
      }
      case 'finish':
        return finishWorkout();
    }
  };
}

function exerciseCard(ex, i, a) {
  const prev = lastPerformance(ex.exId, a.editId);
  const cardio = ex.type === 'cardio';
  const k1 = cardio ? 'km' : 'kg', k2 = cardio ? 'min' : 'reps';
  return `<div class="card ex-card">
    <div class="ex-head">
      <div class="title">${esc(ex.name)}</div>
      <button class="icon-btn" data-act="ex-menu" data-i="${i}" aria-label="Exercise options">${icon('dots')}</button>
    </div>
    <div class="sg-row sg-h"><span>Set</span><span>Previous</span><span>${cardio ? 'km' : 'kg'}</span><span>${cardio ? 'min' : 'Reps'}</span><span></span></div>
    ${ex.sets.map((s, j) => {
      const p = prev?.[j];
      return `<div class="sg-row ${s.done ? 'done' : ''}">
        <span class="sg-n">${j + 1}</span>
        <span class="sg-prev">${p ? setLabel(ex.type, p) : '–'}</span>
        <input inputmode="decimal" data-i="${i}" data-j="${j}" data-k="${k1}" value="${esc(s[k1])}" placeholder="${p ? esc(p[k1] ?? '') : '–'}" aria-label="${k1}">
        <input inputmode="decimal" data-i="${i}" data-j="${j}" data-k="${k2}" value="${esc(s[k2])}" placeholder="${p ? esc(p[k2] ?? '') : '–'}" aria-label="${k2}">
        <button class="check ${s.done ? 'on' : ''}" data-act="toggle" data-i="${i}" data-j="${j}" aria-label="Mark set done">${icon('check')}</button>
      </div>`;
    }).join('')}
    <div class="row gap mt-sm">
      <button class="btn small ghost grow" data-act="add-set" data-i="${i}">${icon('plus')} Add set</button>
      ${ex.sets.length > 1 ? `<button class="btn small ghost" data-act="del-set" data-i="${i}">Remove last</button>` : ''}
    </div>
  </div>`;
}

function exerciseMenu(i) {
  const cur = getActive();
  const ex = cur.exercises[i];
  const s = openSheet({
    title: ex.name,
    body: `<div class="menu">
      ${i > 0 ? `<button data-a="up">${icon('up')} Move up</button>` : ''}
      ${i < cur.exercises.length - 1 ? `<button data-a="down">${icon('down')} Move down</button>` : ''}
      <button data-a="replace">${icon('edit')} Replace exercise</button>
      <button data-a="remove" class="danger">${icon('trash')} Remove exercise</button>
    </div>`,
    mount(el) {
      el.onclick = async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        const c = getActive();
        if (a === 'up' || a === 'down') {
          const k = a === 'up' ? i - 1 : i + 1;
          [c.exercises[i], c.exercises[k]] = [c.exercises[k], c.exercises[i]];
        } else if (a === 'remove') {
          c.exercises.splice(i, 1);
        } else if (a === 'replace') {
          s.close();
          const p = await pickExercise();
          if (!p) return;
          const c3 = getActive();
          const old = c3.exercises[i];
          c3.exercises[i] = { exId: p.id, name: p.name, type: p.type, sets: old.type === p.type ? old.sets : old.sets.map(() => emptySet(p.type)) };
          saveActive(c3);
          return refresh();
        }
        saveActive(c);
        s.close();
        refresh();
      };
    },
  });
}

async function finishWorkout() {
  const a = getActive();
  const exercises = a.exercises
    .map((ex) => ({
      exId: ex.exId,
      name: ex.name,
      type: ex.type,
      sets: ex.sets
        .filter((s) => (ex.type === 'cardio' ? num(s.km) || num(s.min) : num(s.reps) || num(s.kg)))
        .map(({ done, ...rest }) => Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, num(v)]))),
    }))
    .filter((ex) => ex.sets.length);
  if (!exercises.length) {
    if (await confirmSheet('No sets have any numbers filled in. Discard this workout?', { ok: 'Discard', danger: true })) {
      saveActive(null);
      go('#/training');
    }
    return;
  }
  const now = Date.now();
  const w = {
    name: (a.name || '').trim() || 'Workout',
    date: a.date || todayStr(),
    startedAt: a.startedAt,
    endedAt: a.editId ? a.endedAt : now,
    duration: a.editId ? a.duration : Math.max(1, Math.round((now - a.startedAt) / 60000)),
    notes: (a.notes || '').trim(),
    exercises,
  };
  store.put('workout', w, a.editId);
  saveActive(null);
  clearInterval(timerId);
  toast(a.editId ? 'Workout updated' : 'Workout saved 💪');
  go('#/training');
}

// ---------------------------------------------------------------- exercise picker
export function pickExercise() {
  return new Promise((resolve) => {
    let picked = null;
    const s = openSheet({
      title: 'Add exercise',
      tall: true,
      onClose: () => resolve(picked),
      body: '',
    });
    const list = () => {
      s.setTitle('Add exercise');
      s.setBody(
        `<div class="search-box">${icon('search')}<input id="ex-q" placeholder="Search exercises" autocomplete="off"></div>
        <div id="ex-res"></div>
        <button class="btn ghost block mt" data-a="create">${icon('plus')} Create custom exercise</button>`,
        (el) => {
          const res = el.querySelector('#ex-res');
          const draw = (q) => {
            const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
            const items = allExercises().filter((x) => terms.every((t) => (x.name + ' ' + x.group).toLowerCase().includes(t)));
            const groups = [...GROUPS];
            res.innerHTML = groups
              .map((g) => {
                const inG = items.filter((x) => (x.group || 'Other') === g).sort((a, b) => a.name.localeCompare(b.name));
                if (!inG.length) return '';
                return `<div class="group-label">${g}</div>` + inG.map((x) => `<button class="list-item" data-id="${x.id}">${esc(x.name)}${x.custom ? ' <span class="tag">custom</span>' : ''}</button>`).join('');
              })
              .join('') || `<p class="empty">No match. Create it as a custom exercise below.</p>`;
          };
          draw('');
          el.oninput = (e) => { if (e.target.id === 'ex-q') draw(e.target.value); };
          el.onclick = (e) => {
            const b = e.target.closest('[data-id]');
            if (b) {
              picked = allExercises().find((x) => x.id === b.dataset.id);
              return s.close();
            }
            if (e.target.closest('[data-a="create"]')) create(el.querySelector('#ex-q').value);
          };
        }
      );
    };
    const create = (prefill) => {
      s.setTitle('New exercise');
      s.setBody(
        `<label class="field"><span>Name</span><input id="cx-name" value="${esc(prefill)}" placeholder="e.g. Incline Cable Fly"></label>
        <label class="field"><span>Type</span><select id="cx-type"><option value="strength">Strength (kg × reps)</option><option value="cardio">Cardio (km / minutes)</option></select></label>
        <label class="field"><span>Muscle group</span><select id="cx-group">${GROUPS.map((g) => `<option>${g}</option>`).join('')}</select></label>
        <div class="row gap mt"><button class="btn ghost grow" data-a="back">Back</button><button class="btn primary grow" data-a="save">Create</button></div>`,
        (el) => {
          el.onchange = (e) => {
            if (e.target.id === 'cx-type' && e.target.value === 'cardio') el.querySelector('#cx-group').value = 'Cardio';
          };
          el.onclick = (e) => {
            const a = e.target.closest('[data-a]')?.dataset.a;
            if (a === 'back') return list();
            if (a !== 'save') return;
            const name = el.querySelector('#cx-name').value.trim();
            if (!name) return toast('Give the exercise a name');
            const type = el.querySelector('#cx-type').value;
            const ex = { name, type, group: el.querySelector('#cx-group').value, met: type === 'cardio' ? 7 : 5, custom: true };
            const id = store.put('exercise', ex);
            picked = { ...ex, id };
            s.close();
          };
        }
      );
    };
    list();
  });
}

// ---------------------------------------------------------------- routine editor
let draft = null;
let draftFor = null;

export function renderRoutineEditor(el, id = 'new') {
  if (draftFor !== id || !draft) {
    const r = id !== 'new' ? store.get(id) : null;
    draft = r ? structuredClone(r) : { name: '', exercises: [] };
    draftFor = id;
  }
  const d = draft;
  el.innerHTML = `
    <header class="page-head sticky">
      <button class="icon-btn" data-act="back" aria-label="Back">${icon('chevL')}</button>
      <h1 class="grow">${id === 'new' ? 'New routine' : 'Edit routine'}</h1>
    </header>
    <label class="field"><span>Routine name</span><input data-f="name" value="${esc(d.name)}" placeholder="e.g. Push day"></label>
    ${d.exercises.map((ex, i) => `
      <div class="card r-ex">
        <div class="ex-head">
          <div class="title">${esc(ex.name)}</div>
          <div class="row">
            ${i > 0 ? `<button class="icon-btn" data-act="up" data-i="${i}" aria-label="Move up">${icon('up')}</button>` : ''}
            ${i < d.exercises.length - 1 ? `<button class="icon-btn" data-act="down" data-i="${i}" aria-label="Move down">${icon('down')}</button>` : ''}
            <button class="icon-btn" data-act="remove" data-i="${i}" aria-label="Remove">${icon('trash')}</button>
          </div>
        </div>
        <div class="row gap">
          <label class="field grow"><span>Sets</span><input inputmode="numeric" data-i="${i}" data-k="sets" value="${esc(ex.sets)}"></label>
          ${ex.type === 'cardio' ? '' : `<label class="field grow"><span>Target reps</span><input inputmode="numeric" data-i="${i}" data-k="reps" value="${esc(ex.reps || '')}" placeholder="e.g. 8"></label>`}
        </div>
      </div>`).join('') || `<p class="empty">Add the exercises of this routine.</p>`}
    <button class="btn block" data-act="add">${icon('plus')} Add exercise</button>
    <div class="row gap mt-lg">
      ${id !== 'new' ? `<button class="btn danger ghost grow" data-act="delete">${icon('trash')} Delete</button>` : ''}
      <button class="btn primary grow" data-act="save">${icon('check')} Save routine</button>
    </div>`;

  el.oninput = (e) => {
    const t = e.target;
    if (t.dataset.f) d[t.dataset.f] = t.value;
    else if (t.dataset.k) d.exercises[+t.dataset.i][t.dataset.k] = t.value;
  };
  el.onclick = async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const i = +t.dataset.i;
    switch (t.dataset.act) {
      case 'back':
        draft = null;
        return go('#/training');
      case 'up':
      case 'down': {
        const k = t.dataset.act === 'up' ? i - 1 : i + 1;
        [d.exercises[i], d.exercises[k]] = [d.exercises[k], d.exercises[i]];
        return refresh();
      }
      case 'remove':
        d.exercises.splice(i, 1);
        return refresh();
      case 'add': {
        const p = await pickExercise();
        if (!p) return;
        d.exercises.push({ exId: p.id, name: p.name, type: p.type, sets: p.type === 'cardio' ? 1 : 3, reps: p.type === 'cardio' ? '' : 10 });
        return refresh();
      }
      case 'save': {
        if (!d.name.trim()) return toast('Give the routine a name');
        if (!d.exercises.length) return toast('Add at least one exercise');
        const clean = { name: d.name.trim(), exercises: d.exercises.map((x) => ({ ...x, sets: Math.max(1, Math.round(num(x.sets)) || 1), reps: x.reps === '' ? '' : num(x.reps) })) };
        store.put('routine', clean, id === 'new' ? undefined : id);
        draft = null;
        toast('Routine saved');
        return go('#/training');
      }
      case 'delete':
        if (await confirmSheet(`Delete the routine “${d.name}”? Past workouts are kept.`, { ok: 'Delete', danger: true })) {
          store.remove(id);
          draft = null;
          go('#/training');
        }
    }
  };
}
