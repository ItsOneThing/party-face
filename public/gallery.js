import { t } from './i18n.js';
import { photoCard, albumLabel, driveUrl } from './gallery-ui.js';
const $ = id => document.getElementById(id);
export function createGallery(api, isPreview) {
  let photos = [], offset = 0, total = 0, initialized = false, sequence = 0, busy = false;
  let currentAlbum = null, currentQuery = '', folder = null, metadataReady = false, metadataFailed = false;
  const demoPhotos = Array.from({ length: 30 }, (_, i) => ({ id: `demo-${i}`, name: `${i % 3 === 0 ? 'A' : 'P'}${String(i + 1).padStart(2, '0')}.jpg`, album_path: ['活动', '工作组', '赞助'][i % 3], thumbnail: `art/moment-${i % 2 + 1}.svg`, demo: true }));
  function setAlbums(albums) {
    $('album-filter').replaceChildren();
    const all = document.createElement('option'); all.value = ''; all.textContent = t('allAlbums'); $('album-filter').append(all);
    for (const album of albums) { const option = document.createElement('option'); option.value = album.path; option.textContent = `${albumLabel(album.path)} (${album.count})`; $('album-filter').append(option); }
  }
  function setFolder(url) {
    folder = driveUrl(url); $('drive-folder-link').hidden = !folder; if (folder) $('drive-folder-link').href = folder;
  }
  function updateStatus(text, error = false) { $('browse-status').textContent = text; $('browse-status').classList.toggle('error', error); }
  async function load(reset = false) {
    if (!metadataReady && !isPreview) { $('browse-recovery').hidden = false; updateStatus(t('galleryUnavailable'), true); return; }
    if (busy && !reset) return;
    const mine = ++sequence; busy = true; initialized = true; $('browse-more').disabled = true; $('browse-recovery').hidden = true;
    if (reset) { photos = []; offset = 0; $('browse-gallery').replaceChildren(); $('browse-empty').hidden = true; $('browse-more').hidden = true; $('browse-count').textContent = ''; }
    updateStatus(t('galleryLoading')); $('browse-gallery').setAttribute('aria-busy', 'true');
    try {
      let data;
      if (isPreview) {
        const matching = demoPhotos.filter(p => (currentAlbum === null || p.album_path === currentAlbum) && p.name.toLowerCase().includes(currentQuery.toLowerCase()));
        data = { total: matching.length, photos: matching.slice(offset, offset + 24) };
      } else data = await api('browse', { album: currentAlbum, query: currentQuery, offset });
      if (mine !== sequence) return;
      total = data.total; photos.push(...data.photos); offset += data.photos.length;
      for (const photo of data.photos) $('browse-gallery').append(photoCard(photo, () => photos, isPreview));
      $('browse-count').textContent = t('galleryCount', { count: total }); updateStatus(t('shown', { shown: offset, total }));
      $('browse-more').hidden = offset >= total || !data.photos.length; $('browse-empty').hidden = total !== 0;
    } catch (error) {
      if (mine !== sequence) return;
      updateStatus(t('galleryUnavailable'), true); $('browse-recovery').hidden = false;
    } finally {
      if (mine === sequence) { busy = false; $('browse-more').disabled = false; $('browse-gallery').setAttribute('aria-busy', 'false'); }
    }
  }
  function applyFilters() { currentAlbum = $('album-filter').selectedIndex === 0 ? null : $('album-filter').value; currentQuery = $('filename-filter').value.trim(); load(true); }
  $('browse-filters').addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  $('album-filter').addEventListener('change', applyFilters);
  $('browse-more').addEventListener('click', () => load());
  $('browse-retry').addEventListener('click', () => { if (!metadataReady && !isPreview) window.dispatchEvent(new Event('partyface-reconnect')); else load(photos.length === 0); });
  $('clear-filters').addEventListener('click', () => { $('album-filter').selectedIndex = 0; $('filename-filter').value = ''; applyFilters(); });
  if (isPreview) { $('browse-demo-notice').hidden = false; setAlbums(['活动', '工作组', '赞助'].map(path => ({ path, count: 10 }))); }
  return {
    enter() { if (!metadataReady && !isPreview) { if (!metadataFailed) updateStatus(t('connecting')); return; } if (!initialized) load(true); },
    setFolder,
    fail(message) { metadataFailed = true; updateStatus(message || t('galleryUnavailable'), true); $('browse-recovery').hidden = false; },
    configure(info) { metadataReady = true; metadataFailed = false; setAlbums(info.albums || []); setFolder(info.drive_url); if (!$('browse-panel').hidden) load(true); },
  };
}
