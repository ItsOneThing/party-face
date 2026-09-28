import { t, lang, initLanguage, localizedError } from './i18n.js';
import { loadModels, imageFromBlob, detectFaces, MODEL_VERSION } from './recognition.js';
import { createGallery } from './gallery.js';
import { photoCard, initViewer } from './gallery-ui.js';
initLanguage();
const $ = id => document.getElementById(id);
const config = window.PARTY_CONFIG || {};
const params = new URLSearchParams(location.search);
const eventId = params.get('event') || config.defaultEvent;
const eventKey = new URLSearchParams(location.hash.slice(1)).get('key') || '';
let selfie, previewUrl, busy = false, descriptor, offset = 0, total = 0, eventReady = false;
let searchPhotos = [];
initViewer();
const gallery = createGallery(api, !config.endpoint);
if (eventId === config.defaultEvent) gallery.setFolder(config.defaultDriveFolder);
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function updateButton() { $('search-button').disabled = busy || !selfie || !$('consent').checked || !eventReady; }
function clearResults() { $('gallery').replaceChildren(); $('results').hidden = true; $('more-button').hidden = true; descriptor = null; offset = 0; searchPhotos = []; $('fallback-browse').hidden = true; }
function setFile(file) {
  if (busy) return;
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { status(t('invalidFile'), true); return; }
  if (file.size > 15 * 1024 * 1024) { status(t('tooLarge'), true); return; }
  selfie = file; clearResults();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $('selfie-preview').src = previewUrl; $('selfie-preview').hidden = false; $('upload-icon').hidden = true;
  $('file-label').textContent = file.name; $('file-hint').textContent = t('change', { size: (file.size / 1048576).toFixed(1) });
  status(eventReady ? t('selected') : t('selectedSetup')); updateButton();
}
async function api(action, extra = {}) {
  if (!config.endpoint) throw new Error(t('unconfigured'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, event: eventId, key: eventKey, lang, ...extra }), signal: controller.signal, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || t('failed'));
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(t('timeout'));
    throw error;
  } finally { clearTimeout(timer); }
}
async function searchPage() {
  const data = await api('search', { descriptor, model: MODEL_VERSION, offset });
  total = data.total; offset += data.photos.length;
  $('results').hidden = false; $('empty-result').hidden = total !== 0;
  $('results-title').textContent = total ? t('found', { count: total }) : t('moments');
  $('results-description').textContent = total ? t('resultDescription') : t('noResultsDescription');
  searchPhotos.push(...data.photos);
  for (const photo of data.photos) $('gallery').append(photoCard(photo, () => searchPhotos));
  $('more-button').hidden = offset >= total || data.photos.length === 0;
  status(total ? t('shown', { shown: offset, total }) : t('noResults'));
  $('fallback-browse').hidden = total !== 0;
}
function showView(view, save = true) {
  const browse = view === 'browse';
  $('search-panel').hidden = browse; $('browse-panel').hidden = !browse;
  for (const [id, selected] of [['tab-search', !browse], ['tab-browse', browse]]) {
    $(id).classList.toggle('active', selected); $(id).setAttribute('aria-selected', String(selected)); $(id).tabIndex = selected ? 0 : -1;
  }
  if (save) { const url = new URL(location.href); url.searchParams.set('view', browse ? 'browse' : 'search'); history.replaceState(null, '', url); }
  if (browse) gallery.enter();
}
$('tab-search').addEventListener('click', () => showView('search'));
for (const id of ['tab-browse', 'fallback-browse', 'empty-browse', 'result-browse']) $(id).addEventListener('click', () => { showView('browse'); $('tab-browse').focus(); });
$('browse-to-search').addEventListener('click', () => { showView('search'); $('tab-search').focus(); });
for (const id of ['tab-search', 'tab-browse']) $(id).addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); const next = event.key === 'Home' ? 'search' : event.key === 'End' ? 'browse' : id === 'tab-search' ? 'browse' : 'search';
    showView(next); $('tab-' + next).focus();
  }
});
$('selfie').addEventListener('change', event => setFile(event.target.files[0]));
$('consent').addEventListener('change', updateButton);
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, event => { event.preventDefault(); if (!busy) $('dropzone').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('dropzone').addEventListener(name, event => { event.preventDefault(); $('dropzone').classList.remove('dragover'); if (name === 'drop') setFile(event.dataTransfer.files[0]); });
$('search-button').addEventListener('click', async () => {
  if (busy || !selfie || !$('consent').checked || !eventReady) return;
  busy = true; updateButton(); $('selfie').disabled = true; $('consent').disabled = true; clearResults();
  try {
    await loadModels(status); status(t('analyzing'));
    const canvas = await imageFromBlob(selfie); const faces = await detectFaces(canvas); canvas.width = canvas.height = 1;
    if (!faces.length) throw new Error(t('noFace'));
    if (faces.length !== 1) throw new Error(t('manyFaces'));
    descriptor = faces[0].descriptor; status(t('searching')); await searchPage();
    if (!$('search-panel').hidden) $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (error) { descriptor = null; status(localizedError(error), true); $('fallback-browse').hidden = false; }
  finally { busy = false; $('selfie').disabled = false; $('consent').disabled = false; updateButton(); }
});
$('more-button').addEventListener('click', async () => {
  if (busy || !descriptor) return;
  busy = true; updateButton(); $('more-button').disabled = true;
  try { await searchPage(); } catch (error) { status(localizedError(error), true); }
  finally { busy = false; updateButton(); $('more-button').disabled = false; }
});
$('reset-button').addEventListener('click', () => {
  if (busy) return;
  clearResults(); selfie = null; $('selfie').value = ''; $('selfie-preview').hidden = true; $('selfie-preview').removeAttribute('src'); $('upload-icon').hidden = false;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  $('file-label').textContent = t('choose'); $('file-hint').textContent = t('format');
  status(t('chooseAnother')); updateButton(); $('dropzone').scrollIntoView({ block: 'center', behavior: 'smooth' });
});
for (const id of ['privacy-button', 'footer-privacy']) $(id).addEventListener('click', () => $('privacy-dialog').showModal());
$('close-privacy').addEventListener('click', () => $('privacy-dialog').close());
$('demo-button').addEventListener('click', () => {
  clearResults(); $('results').hidden = false; $('empty-result').hidden = true;
  $('results-title').textContent = t('demoTitle'); $('results-description').textContent = t('demoDescription');
  searchPhotos = Array.from({ length: 6 }, (_, i) => ({ id: `search-demo-${i}`, name: t('sample', { n: String(i + 1).padStart(2, '0') }), thumbnail: `art/moment-${i % 2 + 1}.svg`, demo: true }));
  for (const photo of searchPhotos) $('gallery').append(photoCard(photo, () => searchPhotos, true));
  $('results').scrollIntoView({ behavior: 'smooth' });
});
async function init() {
  if (!config.endpoint) { $('setup-banner').hidden = false; status(t('preview')); return; }
  if (!eventKey) { status(t('missingKey'), true); gallery.fail(t('missingKey')); return; }
  status(t('connecting'));
  try {
    const data = await api('info');
    $('event-title').textContent = data.title; $('event-pill').textContent = data.title;
    $('event-count').textContent = t('photoCount', { count: data.photo_count }); document.title = `${data.title} · partyface`;
    gallery.configure(data);
    eventReady = data.indexed_photo_count > 0; status(eventReady ? t('simple') : data.photo_count > 0 ? t('galleryOnly') : t('preparing')); updateButton();
    $('fallback-browse').hidden = eventReady || data.photo_count === 0;
  } catch (error) { status(localizedError(error), true); gallery.fail(localizedError(error)); $('fallback-browse').hidden = false; }
}
window.addEventListener('partyface-reconnect', init);
showView(params.get('view') === 'browse' ? 'browse' : 'search', false);
init();
