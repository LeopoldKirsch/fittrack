import { store } from './store.js';
import * as sync from './sync.js';
import { $$, setRefresh, setOnSheetsClosed, isSheetOpen } from './ui.js';
import * as training from './views/training.js';
import * as nutrition from './views/nutrition.js';
import * as body from './views/body.js';
import * as settings from './views/settings.js';

const ROUTES = {
  training: { render: training.render, tab: 'training' },
  workout: { render: training.renderWorkout, tab: 'training' },
  routine: { render: training.renderRoutineEditor, tab: 'training' },
  nutrition: { render: nutrition.render, tab: 'nutrition' },
  body: { render: body.render, tab: 'body' },
  settings: { render: settings.render, tab: 'settings' },
};

let lastRoute = '';
let pendingRemote = false;

function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: ROUTES[name] ? name : 'training', params: params.map(decodeURIComponent) };
}

function render() {
  const { name, params } = parseHash();
  const route = ROUTES[name];
  const view = document.getElementById('view');
  const key = name + '/' + params.join('/');
  const y = window.scrollY;
  view.onclick = view.oninput = view.onchange = view.onkeydown = null;
  route.render(view, ...params);
  $$('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === route.tab));
  document.body.dataset.route = name;
  if (key !== lastRoute) window.scrollTo(0, 0);
  else window.scrollTo(0, y);
  lastRoute = key;
  paintSync(sync.getState());
}

const isEditing = () => {
  const a = document.activeElement;
  return a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
};

function paintSync(st) {
  const cls = !st.configured || !st.signedIn ? 'off' : st.status;
  const title = !st.configured ? 'Local only' : !st.signedIn ? 'Not signed in' : st.status;
  $$('[data-sync]').forEach((d) => {
    d.className = 'sync-dot ' + cls;
    d.title = title;
  });
}

setRefresh(render);
setOnSheetsClosed(() => {
  if (pendingRemote) {
    pendingRemote = false;
    render();
  }
});

store.init();
store.on((src) => {
  if (src !== 'remote') return;
  // Don't yank the UI from under the user while they're typing or in a sheet.
  if (isSheetOpen() || isEditing() || parseHash().name === 'workout') pendingRemote = true;
  else render();
});
sync.onSyncChange((st) => {
  paintSync(st);
  if (parseHash().name === 'settings' && !isEditing() && !isSheetOpen()) render();
});

window.addEventListener('hashchange', render);
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (pendingRemote && !isEditing() && !isSheetOpen() && parseHash().name !== 'workout') {
      pendingRemote = false;
      render();
    }
  }, 300);
});
// Day rollover: re-render when the app comes back after midnight.
let renderedDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== renderedDay) {
    renderedDay = new Date().toDateString();
    location.reload();
  }
});

render();
sync.startAutoSync();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
