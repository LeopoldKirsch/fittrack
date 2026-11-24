// Local-first record store. Every piece of data (workout, routine, food entry, body
// measurement, profile, steps...) is one record {id, kind, data, updated_at, deleted}.
// Records live in localStorage so the app works offline; sync.js mirrors them to Supabase.

import { uid } from './ui.js';

const KEY = 'ft.records.v1';
let recs = new Map();
const listeners = new Set();

function load() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    recs = new Map(arr.map((r) => [r.id, r]));
  } catch {
    recs = new Map();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...recs.values()]));
  } catch (e) {
    console.error('Could not save data', e);
  }
}

function emit(source) {
  listeners.forEach((fn) => fn(source));
}

const view = (r) => ({ ...r.data, id: r.id });

export const store = {
  init: load,
  on: (fn) => listeners.add(fn),

  list(kind) {
    const out = [];
    for (const r of recs.values()) if (r.kind === kind && !r.deleted) out.push(view(r));
    return out;
  },
  get(id) {
    const r = recs.get(id);
    return r && !r.deleted ? view(r) : null;
  },
  put(kind, data, id) {
    id = id || data.id || uid();
    const { id: _ignored, ...clean } = data;
    recs.set(id, { id, kind, data: clean, updated_at: Date.now(), deleted: false, dirty: true });
    persist();
    emit('local');
    return id;
  },
  remove(id) {
    const r = recs.get(id);
    if (!r || r.deleted) return;
    recs.set(id, { id, kind: r.kind, data: {}, updated_at: Date.now(), deleted: true, dirty: true });
    persist();
    emit('local');
  },

  // ---- sync support ----
  dirty: () => [...recs.values()].filter((r) => r.dirty),
  markClean(pushed) {
    for (const p of pushed) {
      const r = recs.get(p.id);
      if (r && r.updated_at === p.updated_at) r.dirty = false;
    }
    persist();
  },
  /** Merge rows pulled from the server; last write (by updated_at) wins. */
  mergeRemote(rows) {
    let changed = false;
    for (const row of rows) {
      const t = Date.parse(row.updated_at);
      const local = recs.get(row.id);
      if (local && local.updated_at >= t) continue;
      recs.set(row.id, { id: row.id, kind: row.kind, data: row.data || {}, updated_at: t, deleted: !!row.deleted, dirty: false });
      changed = true;
    }
    if (changed) {
      persist();
      emit('remote');
    }
  },
  markAllDirty() {
    for (const r of recs.values()) r.dirty = true;
    persist();
  },

  // ---- backup ----
  exportAll: () =>
    JSON.stringify(
      { app: 'fittrack', version: 1, exported: new Date().toISOString(), records: [...recs.values()].filter((r) => !r.deleted) },
      null,
      1
    ),
  importAll(json) {
    const obj = JSON.parse(json);
    if (!Array.isArray(obj.records)) throw new Error('Not a Discipline backup file');
    let n = 0;
    for (const r of obj.records) {
      if (!r.id || !r.kind) continue;
      recs.set(r.id, { id: r.id, kind: r.kind, data: r.data || {}, updated_at: Date.now(), deleted: false, dirty: true });
      n++;
    }
    persist();
    emit('local');
    return n;
  },
  clearAll() {
    recs = new Map();
    persist();
    emit('local');
  },
};
