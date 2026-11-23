// Energy & nutrition maths.

import { store } from './store.js';
import { EXERCISES } from './data-exercises.js';
import { round, num } from './ui.js';

export const ACTIVITY = {
  sedentary: { label: 'Sedentary: desk job, little exercise', f: 1.2 },
  light: { label: 'Light: exercise 1–3×/week', f: 1.375 },
  moderate: { label: 'Moderate: exercise 3–5×/week', f: 1.55 },
  active: { label: 'Active: exercise 6–7×/week', f: 1.725 },
  very: { label: 'Very active: physical job + training', f: 1.9 },
};
export const GOALS = {
  lose: { label: 'Lose weight (−500 kcal/day ≈ −0.5 kg/week)', delta: -500 },
  slowlose: { label: 'Lose slowly (−250 kcal/day)', delta: -250 },
  maintain: { label: 'Maintain weight', delta: 0 },
  gain: { label: 'Lean bulk (+250 kcal/day)', delta: 250 },
};
export const MEALS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'snack', label: 'Snack' },
  { id: 'dinner', label: 'Dinner' },
];

// kcal burned per step per kg of body weight (≈0.04 kcal/step at 80 kg)
export const STEP_KCAL_PER_KG = 0.0005;

const DEFAULT_PROFILE = { sex: 'male', birthYear: 2000, height: 178, weight: 75, activity: 'moderate', goal: 'maintain' };

export function getProfile() {
  const p = store.get('profile');
  return { ...DEFAULT_PROFILE, ...(p || {}), _set: !!p };
}

/** Body weight on a given date: latest body entry on/before the date, else profile weight. */
export function weightOn(date) {
  const entries = store
    .list('body')
    .filter((b) => num(b.weight) > 0 && (!date || b.date <= date))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return entries.length ? num(entries[0].weight) : num(getProfile().weight) || 75;
}

export function bmr(p = getProfile(), w = weightOn()) {
  const age = new Date().getFullYear() - num(p.birthYear);
  const base = 10 * w + 6.25 * num(p.height) - 5 * age;
  return Math.max(800, base + (p.sex === 'female' ? -161 : 5));
}

export function suggestedTargets(p = getProfile(), w = weightOn()) {
  const tdee = bmr(p, w) * (ACTIVITY[p.activity]?.f || 1.55);
  const kcal = Math.round((tdee + (GOALS[p.goal]?.delta || 0)) / 10) * 10;
  const protein = Math.round(w * (p.goal === 'lose' || p.goal === 'slowlose' ? 2.0 : 1.8));
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, tdee: Math.round(tdee) };
}

export function targets(p = getProfile(), w = weightOn()) {
  const s = suggestedTargets(p, w);
  return {
    kcal: num(p.tKcal) || s.kcal,
    protein: num(p.tProtein) || s.protein,
    carbs: num(p.tCarbs) || s.carbs,
    fat: num(p.tFat) || s.fat,
  };
}

// ---------- intake ----------
export function entryMacros(e) {
  const k = num(e.grams) / 100;
  return { kcal: num(e.kcal) * k, p: num(e.p) * k, c: num(e.c) * k, f: num(e.f) * k };
}
export function sumMacros(list) {
  return list.reduce(
    (a, e) => {
      const m = entryMacros(e);
      a.kcal += m.kcal;
      a.p += m.p;
      a.c += m.c;
      a.f += m.f;
      return a;
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}
export const entriesOn = (date) => store.list('entry').filter((e) => e.date === date).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

// ---------- expenditure ----------
const exById = new Map(EXERCISES.map((e) => [e.id, e]));
export const findExercise = (id) => exById.get(id) || store.get(id);

/**
 * Net extra kcal of a workout above resting (BMR is counted separately).
 * When the day has step data, the part of step-based cardio (running, walking...)
 * already captured by the step counter is subtracted to avoid double counting.
 */
export function workoutKcal(w, weight, hasSteps) {
  const exs = w.exercises || [];
  let cardioMin = 0;
  let kcal = 0;
  let hasStrength = false;
  for (const ex of exs) {
    const meta = findExercise(ex.exId) || {};
    if (ex.type === 'cardio') {
      const sets = (ex.sets || []).filter((s) => num(s.min) > 0 || num(s.km) > 0);
      for (const s of sets) {
        const met = num(meta.met) || 7;
        let min = num(s.min);
        if (!min && num(s.km)) min = num(s.km) * 6; // assume ~6 min/km if only distance
        let k = (met - 1) * weight * (min / 60);
        if (hasSteps && meta.stepBased) {
          const steps = num(s.km) && meta.stepsPerKm ? num(s.km) * meta.stepsPerKm : min * (met > 6 ? 160 : 105);
          k -= steps * STEP_KCAL_PER_KG * weight;
        }
        kcal += Math.max(0, k);
        cardioMin += min;
      }
    } else if ((ex.sets || []).some((s) => num(s.reps) > 0)) hasStrength = true;
  }
  if (hasStrength) {
    let dur = num(w.duration);
    if (!dur) dur = exs.reduce((n, e) => n + (e.sets || []).length, 0) * 2.5;
    const strengthMin = Math.max(0, dur - cardioMin);
    kcal += (5 - 1) * weight * (strengthMin / 60);
  }
  return Math.round(kcal);
}

export function dayOut(date) {
  const p = getProfile();
  const w = weightOn(date);
  const b = bmr(p, w);
  const stepsRec = store.get('steps-' + date);
  const steps = stepsRec ? num(stepsRec.steps) : null;
  const hasSteps = steps != null;
  // With step data: resting + digestion (~10%) + steps. Without: sedentary baseline (×1.2).
  const base = hasSteps ? b * 1.1 : b * 1.2;
  const stepsKcal = hasSteps ? steps * STEP_KCAL_PER_KG * w : 0;
  const workouts = store.list('workout').filter((x) => x.date === date);
  const workoutsKcal = workouts.reduce((n, x) => n + workoutKcal(x, w, hasSteps), 0);
  const estimated = Math.round(base + stepsKcal + workoutsKcal);
  const override = store.get('out-' + date);
  return {
    bmr: Math.round(b),
    base: Math.round(base),
    steps,
    stepsSource: stepsRec?.source || null,
    stepsKcal: Math.round(stepsKcal),
    workouts: workouts.length,
    workoutsKcal,
    estimated,
    override: override ? num(override.kcal) : null,
    total: override ? num(override.kcal) : estimated,
  };
}

// ---------- training stats ----------
export function workoutVolume(w) {
  let v = 0;
  for (const ex of w.exercises || []) if (ex.type !== 'cardio') for (const s of ex.sets || []) v += num(s.kg) * num(s.reps);
  return round(v);
}
export const workoutSetCount = (w) => (w.exercises || []).reduce((n, e) => n + (e.sets || []).length, 0);
