const api = typeof browser !== 'undefined' ? browser : chrome;
const cb = document.getElementById('enabled');
const dbg = document.getElementById('debug');
const count = document.getElementById('count');

document.getElementById('ver').textContent = 'verze ' + api.runtime.getManifest().version;

api.storage.local.get({ enabled: true, debug: false, skipped: 0 }).then((v) => {
  cb.checked = v.enabled !== false;
  dbg.checked = v.debug === true;
  count.textContent = v.skipped || 0;
});

cb.addEventListener('change', () => api.storage.local.set({ enabled: cb.checked }));
dbg.addEventListener('change', () => api.storage.local.set({ debug: dbg.checked }));

document.getElementById('reset').addEventListener('click', () => {
  api.storage.local.set({ skipped: 0 });
  count.textContent = 0;
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.skipped) count.textContent = changes.skipped.newValue || 0;
});
