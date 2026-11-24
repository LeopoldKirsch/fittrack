// Settings: profile & targets, account/sync, Apple Health steps Shortcut, backup.

import { store } from '../store.js';
import * as sync from '../sync.js';
import { ACTIVITY, GOALS, getProfile, suggestedTargets, weightOn, bmr } from '../calc.js';
import { esc, icon, num, fmtNum, toast, refresh, confirmSheet, copyText, download, todayStr } from '../ui.js';

let stepToken = null;
let showConn = false;

export function render(el) {
  const p = getProfile();
  const w = weightOn();
  const sug = suggestedTargets(p, w);
  const st = sync.getState();
  const cfg = sync.getConfig();
  const steps = store.list('steps').filter((x) => x.source === 'health').sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  el.innerHTML = `
    <header class="page-head"><h1>Settings</h1><span class="sync-dot" data-sync></span></header>

    <section class="card">
      <h2>Profile</h2>
      <p class="muted small">Used to estimate your resting metabolism and daily targets.</p>
      <div class="grid2">
        <label class="field"><span>Sex</span><select data-p="sex">
          <option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option>
          <option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
        <label class="field"><span>Birth year</span><input inputmode="numeric" data-p="birthYear" value="${esc(p.birthYear)}"></label>
        <label class="field"><span>Height (cm)</span><input inputmode="decimal" data-p="height" value="${esc(p.height)}"></label>
        <label class="field"><span>Weight (kg)</span><input inputmode="decimal" data-p="weight" value="${esc(p.weight)}"></label>
      </div>
      <p class="muted small">Once you log your weight in the Body tab, the latest entry is used (currently ${fmtNum(w, 1)} kg).</p>
      <label class="field"><span>Activity level (outside of logged workouts)</span><select data-p="activity">
        ${Object.entries(ACTIVITY).map(([k, v]) => `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="field"><span>Goal</span><select data-p="goal">
        ${Object.entries(GOALS).map(([k, v]) => `<option value="${k}" ${p.goal === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>

      <h3 class="mt">Daily targets</h3>
      <p class="muted small">Suggested: BMR ${fmtNum(bmr(p, w))} kcal × activity = ${fmtNum(sug.tdee)} kcal maintenance. Leave a field empty to use the suggestion.</p>
      <div class="grid2">
        <label class="field"><span>Calories (kcal)</span><input inputmode="numeric" data-p="tKcal" value="${esc(p.tKcal || '')}" placeholder="${sug.kcal}"></label>
        <label class="field"><span>Protein (g)</span><input inputmode="numeric" data-p="tProtein" value="${esc(p.tProtein || '')}" placeholder="${sug.protein}"></label>
        <label class="field"><span>Carbs (g)</span><input inputmode="numeric" data-p="tCarbs" value="${esc(p.tCarbs || '')}" placeholder="${sug.carbs}"></label>
        <label class="field"><span>Fat (g)</span><input inputmode="numeric" data-p="tFat" value="${esc(p.tFat || '')}" placeholder="${sug.fat}"></label>
      </div>
      <button class="btn primary block mt" data-act="save-profile">${icon('check')} Save profile</button>
    </section>

    <section class="card">
      <h2>${icon('cloud')} Account & sync</h2>
      ${!cfg || showConn ? connForm(cfg) : st.signedIn ? `
        <div class="kv"><span>Signed in as</span><b>${esc(st.email)}</b></div>
        <div class="kv"><span>Status</span><b class="status-${st.status}">${statusText(st)}</b></div>
        ${st.error ? `<p class="error small">${esc(st.error)}</p>` : ''}
        <div class="row gap mt"><button class="btn grow" data-act="sync">Sync now</button><button class="btn ghost grow" data-act="signout">Sign out</button></div>
        <button class="link small mt" data-act="conn">Change Supabase project</button>` : `
        <p class="muted small">Sign in to sync your data between your phone and laptop. Your data stays on this device until then.</p>
        <label class="field"><span>Email</span><input id="au-email" type="email" autocomplete="email"></label>
        <label class="field"><span>Password</span><input id="au-pw" type="password" autocomplete="current-password"></label>
        <div class="row gap"><button class="btn primary grow" data-act="signin">Sign in</button><button class="btn grow" data-act="signup">Create account</button></div>
        ${st.error ? `<p class="error small">${esc(st.error)}</p>` : ''}
        <button class="link small mt" data-act="conn">Change Supabase project</button>`}
    </section>

    <section class="card">
      <h2>${icon('steps')} Apple Health steps</h2>
      ${!st.signedIn ? `<p class="muted small">Sign in first. Steps are sent by an iPhone Shortcut to your account, then show up on every device.</p>` : `
        <p class="muted small">Web apps can't read Apple Health directly, so a Shortcut on your iPhone sends today's step count to your account automatically.</p>
        ${steps ? `<div class="kv"><span>Last received</span><b>${fmtNum(steps.steps)} steps (${esc(steps.date)})</b></div>` : ''}
        <label class="field"><span>Your shortcut's exact name (used by the “Sync steps now” button)</span>
          <input id="sc-name" value="${esc(sync.getShortcutName())}" autocapitalize="off" autocomplete="off"></label>
        <button class="btn accent block mt" data-act="run-shortcut">${icon('steps')} Sync steps now</button>
        ${stepToken ? shortcutGuide(cfg, stepToken) : `<button class="btn block" data-act="token">Show Shortcut setup</button>`}`}
    </section>

    <section class="card">
      <h2>Data</h2>
      <p class="muted small">Download a backup of everything (JSON), or restore one.</p>
      <div class="row gap wrap">
        <button class="btn grow" data-act="export">Export backup</button>
        <label class="btn grow">Import backup<input type="file" accept="application/json,.json" id="import" hidden></label>
      </div>
      <button class="btn danger ghost block mt" data-act="wipe">Delete all data on this device</button>
    </section>
    <p class="muted small center">Discipline · works offline · data in your own Supabase project</p>
  `;

  el.onclick = async (e) => {
    const t = e.target.closest('[data-act],[data-copy]');
    if (!t) return;
    if (t.dataset.copy != null) return copyText(t.dataset.copy);
    try {
      switch (t.dataset.act) {
        case 'save-profile': {
          const np = {};
          el.querySelectorAll('[data-p]').forEach((i) => {
            const k = i.dataset.p;
            np[k] = ['sex', 'activity', 'goal'].includes(k) ? i.value : i.value.trim() === '' ? '' : num(i.value);
          });
          if (!np.birthYear || !np.height || !np.weight) return toast('Birth year, height and weight are needed');
          store.put('profile', np, 'profile');
          toast('Profile saved');
          return refresh();
        }
        case 'conn':
          showConn = true;
          return refresh();
        case 'conn-cancel':
          showConn = false;
          return refresh();
        case 'conn-save': {
          const url = el.querySelector('#sb-url').value.trim();
          const key = el.querySelector('#sb-key').value.trim();
          if (!/^https:\/\/.+\.supabase\.co$/.test(url.replace(/\/$/, ''))) return toast('URL should look like https://xxxx.supabase.co');
          if (!key) return toast('Paste the publishable key');
          sync.saveConfig(url, key);
          showConn = false;
          stepToken = null;
          await sync.getClient();
          toast('Connected');
          return refresh();
        }
        case 'signin':
        case 'signup': {
          const email = el.querySelector('#au-email').value.trim();
          const pw = el.querySelector('#au-pw').value;
          if (!email || pw.length < 6) return toast('Enter your email and a password (6+ characters)');
          t.disabled = true;
          if (t.dataset.act === 'signin') {
            await sync.signIn(email, pw);
            toast('Signed in, syncing…');
          } else {
            const r = await sync.signUp(email, pw);
            toast(r.needsConfirm ? 'Check your inbox to confirm your email, then sign in' : 'Account created, syncing…', 4000);
          }
          return refresh();
        }
        case 'signout':
          if (await confirmSheet('Sign out? Data stays on this device and keeps syncing once you sign back in.', { ok: 'Sign out' })) {
            await sync.signOut();
            stepToken = null;
            refresh();
          }
          return;
        case 'sync':
          await sync.syncNow();
          return refresh();
        case 'run-shortcut':
          sync.setShortcutName(el.querySelector('#sc-name').value);
          return sync.runStepsShortcut();
        case 'token':
          stepToken = await sync.getStepToken(true);
          return refresh();
        case 'export':
          return download(`discipline-backup-${todayStr()}.json`, store.exportAll());
        case 'wipe':
          if (await confirmSheet('Delete ALL data stored on this device? Data already synced to your account stays in Supabase.', { ok: 'Delete everything', danger: true })) {
            store.clearAll();
            localStorage.removeItem('ft.active');
            localStorage.removeItem('ft.sync.v1');
            toast('Local data deleted');
            refresh();
          }
          return;
      }
    } catch (err) {
      t.disabled = false;
      toast(err.message || 'Something went wrong', 4000);
    }
  };

  el.onchange = async (e) => {
    if (e.target.id === 'sc-name') {
      sync.setShortcutName(e.target.value);
      return toast('Shortcut name saved');
    }
    if (e.target.id !== 'import' || !e.target.files[0]) return;
    try {
      const n = store.importAll(await e.target.files[0].text());
      toast(`Imported ${n} records`);
      refresh();
    } catch (err) {
      toast(err.message || 'Import failed', 4000);
    }
  };

  if (st.signedIn && !stepToken) sync.getStepToken(false).then((tk) => {
    if (tk) {
      stepToken = tk;
      refresh();
    }
  }).catch(() => {});
}

function statusText(st) {
  const when = st.lastSync ? new Date(st.lastSync).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
  return { synced: `Synced · ${when}`, syncing: 'Syncing…', offline: `Offline · last ${when}`, error: 'Sync error', local: `Last sync ${when}` }[st.status] || st.status;
}

function connForm(cfg) {
  return `
    <p class="muted small">Connect your free Supabase project (one-time). Find these values in Supabase → Project Settings → API Keys / Data API.</p>
    <label class="field"><span>Project URL</span><input id="sb-url" placeholder="https://xxxx.supabase.co" value="${esc(cfg?.url || '')}" autocapitalize="off" autocomplete="off"></label>
    <label class="field"><span>Publishable key</span><input id="sb-key" placeholder="sb_publishable_…" value="${esc(cfg?.key || '')}" autocapitalize="off" autocomplete="off"></label>
    <div class="row gap">${cfg ? `<button class="btn ghost grow" data-act="conn-cancel">Cancel</button>` : ''}<button class="btn primary grow" data-act="conn-save">Connect</button></div>`;
}

function copyRow(label, value) {
  return `<div class="copy-row"><div class="grow"><div class="muted small">${label}</div><code>${esc(value)}</code></div>
    <button class="btn small" data-copy="${esc(value)}">${icon('copy')} Copy</button></div>`;
}

function shortcutGuide(cfg, token) {
  const url = `${cfg.url}/rest/v1/rpc/log_steps`;
  return `
    <ol class="steps-guide">
      <li>Open the <b>Shortcuts</b> app → <b>Shortcuts</b> tab → <b>+</b>, and name the shortcut <b>Send Steps</b>.</li>
      <li>Add the action <b>Find Health Samples</b>: Type = <b>Steps</b>, add the filter <b>Start Date is Today</b>.</li>
      <li>Add <b>Calculate Statistics</b>: Operation = <b>Sum</b>, input = <i>Health Samples</i>.</li>
      <li>Add <b>Get Contents of URL</b> with the URL below. Expand it: Method = <b>POST</b>.
        Headers: <code>apikey</code> = the key below. Request Body = <b>JSON</b> with 2 fields:
        <code>p_token</code> (Text) = your token, <code>p_steps</code> (Number) = the blue <i>Statistics Result</i> variable (tap the field → Select Variable).
        The date is filled in automatically (today, Paris time).</li>
      <li>Tap ▶︎ once to test it and allow Health access. The response should read <code>ok: … steps on …</code>.
</li>
      <li><b>Automation</b> tab → <b>+</b>: create <b>Time of Day</b> (e.g. 21:30, Daily) and <b>App → Is Opened</b> (an app you open often), both <b>Run Immediately</b> → run <b>Send Steps</b>.
        iPhone hides Health data while locked, which is why the “app opened” trigger matters. The button above runs it on demand.</li>
    </ol>
    ${copyRow('URL', url)}
    ${copyRow('Header apikey', cfg.key)}
    ${copyRow('p_token (keep it private)', token)}
    <p class="muted small">If you wear an Apple Watch and your steps look doubled, add the filter <b>Source is</b> your iPhone (or Watch) in step 2.</p>`;
}
