// Supabase sync + auth. Loaded lazily so the app runs fully offline / without an account.

import { store } from './store.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
const META_KEY = 'ft.sync.v1';
const CFG_KEY = 'ft.sbcfg';

let client = null;
let session = null;
let state = { status: 'local', error: '' };
let syncing = false;
let again = false;
let timer = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(getState()));
export const onSyncChange = (fn) => listeners.add(fn);

export function getConfig() {
  try {
    const own = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (own?.url && own?.key) return own;
  } catch {}
  const c = window.FT_CONFIG || {};
  return c.supabaseUrl && c.supabaseKey ? { url: c.supabaseUrl, key: c.supabaseKey } : null;
}

export function saveConfig(url, key) {
  if (url && key) localStorage.setItem(CFG_KEY, JSON.stringify({ url: url.trim().replace(/\/$/, ''), key: key.trim() }));
  else localStorage.removeItem(CFG_KEY);
  client = null;
  session = null;
  state = { status: 'local', error: '' };
  emit();
}

function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getState() {
  return {
    configured: !!getConfig(),
    signedIn: !!session,
    email: session?.user?.email || '',
    status: state.status,
    error: state.error,
    lastSync: readMeta().lastSync || null,
  };
}

export async function getClient() {
  if (client) return client;
  const cfg = getConfig();
  if (!cfg) return null;
  const { createClient } = await import(SUPABASE_JS);
  const c = createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ft.auth' },
  });
  client = c;
  c.auth.onAuthStateChange((_ev, s) => {
    const was = !!session;
    session = s;
    if (s && !was) syncSoon(0);
    emit();
  });
  const { data } = await c.auth.getSession();
  session = data.session;
  emit();
  return c;
}

export async function signIn(email, password) {
  const c = await getClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
  return { needsConfirm: !data.session };
}

export async function signOut() {
  const c = await getClient();
  await c?.auth.signOut();
  session = null;
  localStorage.removeItem(META_KEY);
  emit();
}

export function syncSoon(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  if (syncing) {
    again = true;
    return;
  }
  let c;
  try {
    c = await getClient();
  } catch {
    state = { status: 'error', error: 'Could not load the sync library (offline?)' };
    emit();
    return;
  }
  if (!c || !session) return;
  if (!navigator.onLine) {
    state = { status: 'offline', error: '' };
    emit();
    return;
  }
  syncing = true;
  state = { status: 'syncing', error: '' };
  emit();
  try {
    const userId = session.user.id;
    // 1) push local changes
    const dirty = store.dirty();
    for (let i = 0; i < dirty.length; i += 400) {
      const chunk = dirty.slice(i, i + 400);
      const rows = chunk.map((r) => ({
        user_id: userId,
        id: r.id,
        kind: r.kind,
        data: r.data,
        updated_at: new Date(r.updated_at).toISOString(),
        deleted: !!r.deleted,
      }));
      const { error } = await c.from('records').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
      store.markClean(chunk);
    }
    // 2) pull remote changes since last pull (small overlap; merging is idempotent)
    const meta = readMeta();
    const same = meta.user === userId && meta.since;
    let since = same ? new Date(Date.parse(meta.since) - 10000).toISOString() : '1970-01-01T00:00:00Z';
    let maxTs = same ? meta.since : null;
    for (;;) {
      const { data, error } = await c
        .from('records')
        .select('id,kind,data,updated_at,deleted,server_ts')
        .gt('server_ts', since)
        .order('server_ts', { ascending: true })
        .limit(1000);
      if (error) throw error;
      if (data.length) {
        store.mergeRemote(data);
        since = data[data.length - 1].server_ts;
        if (!maxTs || Date.parse(since) > Date.parse(maxTs)) maxTs = since;
      }
      if (data.length < 1000) break;
    }
    localStorage.setItem(META_KEY, JSON.stringify({ user: userId, since: maxTs, lastSync: Date.now() }));
    state = { status: 'synced', error: '' };
  } catch (e) {
    console.error(e);
    state = { status: 'error', error: e.message || String(e) };
  } finally {
    syncing = false;
    emit();
    if (again) {
      again = false;
      syncSoon(300);
    }
  }
}

// ---------- Apple Health steps (iOS Shortcut -> log_steps RPC) ----------
export async function getStepToken(create = false) {
  const c = await getClient();
  if (!c || !session) throw new Error('Sign in first');
  const { data, error } = await c.from('step_tokens').select('token').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  if (data?.token || !create) return data?.token || null;
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const { error: e2 } = await c.from('step_tokens').upsert({ user_id: session.user.id, token });
  if (e2) throw e2;
  return token;
}

export function startAutoSync() {
  store.on((src) => src === 'local' && syncSoon());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncSoon(200));
  window.addEventListener('online', () => syncSoon(200));
  setInterval(() => document.visibilityState === 'visible' && syncSoon(0), 5 * 60 * 1000);
  if (getConfig()) getClient().then(() => syncSoon(0)).catch(() => {});
}
