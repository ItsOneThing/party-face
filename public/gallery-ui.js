import { t } from './i18n.js';
const $ = id => document.getElementById(id);
let collection = [], current = 0;
export function driveUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'drive.google.com' ? url.href : null; }
  catch { return null; }
}
export function albumLabel(path) {
  if (!path) return t('rootAlbum');
  return path.split(' / ').map(part => ({ '活动': t('activityAlbum'), '工作组': t('teamAlbum'), '赞助': t('sponsorAlbum') }[part] || part)).join(' / ');
}
export function photoCard(photo, getCollection, demo = false) {
  const card = document.createElement('article'); card.className = 'photo-card';
  const open = document.createElement('button'); open.type = 'button'; open.className = 'photo-open';
  open.setAttribute('aria-label', t('openPhoto', { name: photo.name }));
  const image = document.createElement('img');
  if (photo.thumbnail) image.src = photo.thumbnail;
  image.alt = demo ? t('demoAlt') : photo.name; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
  const overlay = document.createElement('span'); overlay.className = 'photo-hover'; overlay.textContent = '⤢ ' + t('enlarge');
  open.append(image, overlay);
  open.addEventListener('click', () => { collection = getCollection(); current = collection.findIndex(p => p.id === photo.id); if (current < 0) return; renderViewer(); $('photo-viewer').showModal(); });
  const bottom = document.createElement('div'); bottom.className = 'photo-card-bottom';
  const caption = document.createElement('div'); caption.className = 'photo-caption';
  const name = document.createElement('span'); name.className = 'photo-name'; name.textContent = photo.name; caption.append(name);
  if (photo.album_path) { const album = document.createElement('small'); album.textContent = albumLabel(photo.album_path); caption.append(album); }
  bottom.append(caption);
  if (demo) { const badge = document.createElement('span'); badge.className = 'demo-tag'; badge.textContent = t('demoBadge'); bottom.append(badge); }
  else {
    const url = driveUrl(photo.drive_url);
    if (url) { const link = document.createElement('a'); link.className = 'photo-link'; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = t('original'); bottom.append(link); }
  }
  image.addEventListener('error', () => { image.removeAttribute('src'); image.alt = t('brokenThumb'); }, { once: true });
  card.append(open, bottom); return card;
}
function renderViewer() {
  const photo = collection[current];
  if (!photo) return;
  $('viewer-image').src = photo.thumbnail || ''; $('viewer-image').alt = photo.demo ? t('demoAlt') : photo.name;
  $('viewer-name').textContent = photo.name; $('viewer-position').textContent = `${current + 1} / ${collection.length}`;
  $('viewer-demo').textContent = photo.demo ? t('demoBadge') : albumLabel(photo.album_path);
  $('viewer-prev').disabled = current === 0; $('viewer-next').disabled = current === collection.length - 1;
  const original = driveUrl(photo.drive_url); $('viewer-original').hidden = !original; if (original) $('viewer-original').href = original;
  $('viewer-note').textContent = photo.demo ? t('demoDescription') : t('viewerNote');
}
export function initViewer() {
  const viewer = $('photo-viewer');
  let pressedOnBlank = false;
  viewer.addEventListener('pointerdown', event => { pressedOnBlank = event.target === viewer; });
  viewer.addEventListener('pointercancel', () => { pressedOnBlank = false; });
  viewer.addEventListener('click', event => {
    if (pressedOnBlank && event.target === viewer) viewer.close();
    pressedOnBlank = false;
  });
  $('viewer-close').addEventListener('click', () => $('photo-viewer').close());
  $('viewer-prev').addEventListener('click', () => { if (current > 0) { current--; renderViewer(); } });
  $('viewer-next').addEventListener('click', () => { if (current < collection.length - 1) { current++; renderViewer(); } });
  $('photo-viewer').addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = current + (event.key === 'ArrowLeft' ? -1 : 1); if (next >= 0 && next < collection.length) { current = next; renderViewer(); } }
  });
  $('photo-viewer').addEventListener('close', () => { $('viewer-image').removeAttribute('src'); collection = []; });
}
