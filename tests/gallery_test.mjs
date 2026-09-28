import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element {
  children = []; listeners = {}; hidden = false; disabled = false; checked = true; open = false; selectedIndex = 0; value = ''; textContent = '';
  replaceChildren(...items) { this.children = items; this.selectedIndex = 0; }
  append(...items) { this.children.push(...items); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute() {}
  classList = { toggle() {} };
}
const elements = new Map();
const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
let timer;
const doc = { hidden: false, getElementById: el, createElement: () => new Element() };
const context = vm.createContext({ document: doc, window: { dispatchEvent() {} }, Event, setInterval: handler => { timer = handler; }, t: key => key, photoCard: photo => photo, albumLabel: value => value, driveUrl: value => value });
const source = fs.readFileSync('public/gallery.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export function createGallery', 'function createGallery');
vm.runInContext(source + '\nthis.createGallery = createGallery;', context);
let count = 30, calls = [], failing = false;
const api = async (action, extra = {}) => {
  calls.push({ action, ...extra });
  if (failing) throw new Error('unavailable');
  if (action === 'info') return { photo_count: count, albums: [{ path: '活动', count }], drive_url: 'https://drive.google.com/drive/folders/example' };
  return { total: count, photos: Array.from({ length: Math.min(24, Math.max(0, count - extra.offset)) }, (_, i) => ({ id: String(extra.offset + i), name: 'photo.jpg' })) };
};
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const gallery = context.createGallery(api, false);
gallery.configure({ photo_count: count, albums: [{ path: '活动', count }] });
await settle();
await el('browse-more').listeners.click(); await settle();
assert.equal(el('browse-gallery').children.length, 30);
calls = []; await timer(); await settle();
assert.equal(calls.filter(c => c.action === 'browse').length, 0, 'unchanged activity must not redownload thumbnails');
count = 31; calls = []; await timer(); await settle();
assert.equal(el('browse-gallery').children.length, 31, 'refresh preserves loaded pages and includes new photos');
assert.equal(new Set(el('browse-gallery').children.map(p => p.id)).size, 31);
assert.deepEqual(calls.filter(c => c.action === 'browse').map(c => c.offset), [0, 24]);
doc.hidden = true; calls = []; await timer(); await settle(); assert.equal(calls.length, 0);
doc.hidden = false; el('photo-viewer').open = true; await timer(); await settle(); assert.equal(calls.length, 0);
el('photo-viewer').open = false;
el('album-filter').selectedIndex = 1; el('album-filter').value = '活动'; el('filename-filter').value = 'photo';
await el('album-filter').listeners.change(); await settle();
count = 32; calls = []; await timer(); await settle();
assert.ok(calls.filter(c => c.action === 'browse').every(c => c.album === '活动' && c.query === 'photo'));
assert.equal(el('album-filter').selectedIndex, 1, 'category remains selected after metadata refresh');
failing = true; count = 33; await timer(); await settle();
assert.equal(el('browse-live').checked, false, 'stop automatic requests after failure');
assert.equal(el('browse-gallery').children.length, 24, 'failure preserves visible photos');
failing = false; await el('browse-refresh').listeners.click(); await settle();
assert.equal(el('browse-live-status').textContent, 'galleryUpdated');
console.log('Gallery live-refresh checks passed: change detection, pagination, filters, visibility, viewer, failure and manual retry.');
