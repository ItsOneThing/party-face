// Validate the actual Edge Function with mocked backend responses, without cloud credentials.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/search-photos/index.ts', import.meta.url), 'utf8'));
const eventId = '11111111-1111-4111-8111-111111111111';
const model = 'face-api-0.22.2-ssd-landmark68-descriptor128-v1';
const valid = { action: 'search', event: 'test-event', key: 'k'.repeat(43), model, descriptor: Array(128).fill(.1), offset: 0 };
function createHandler({ limited = false, active = true, configured = true, recognitionModel = model } = {}) {
  let handler;
  const calls = [];
  const env = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-key', RATE_LIMIT_SALT: configured ? 'salt' : '', ALLOWED_ORIGINS: 'https://example.github.io' };
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/events?')) return Response.json(active ? [{ id: eventId, title: '活动', title_it: 'Festa', model_version: recognitionModel, drive_folder_id: 'drivefolder12345' }] : []);
    if (url.includes('/consume_budget')) return Response.json(!limited);
    if (url.includes('/photos?')) return new Response('[]', { headers: { 'content-range': '0-0/37' } });
    if (url.includes('/gallery_summary')) return Response.json({ photo_count: 37, indexed_photo_count: 33, albums: [{ path: '活动', count: 37 }] });
    if (url.includes('/browse_photos')) return Response.json({ total: 37, photos: [{ id: 'photo', name: 'A.jpg', album_path: '活动', thumbnail_path: `${eventId}/photo.jpg`, drive_url: 'https://drive.google.com/file/d/photo/view' }] });
    if (url.includes('/match_photos')) return Response.json({ total: 37, photos: [{ id: 'photo', name: 'A.jpg', thumbnail_path: `${eventId}/photo.jpg`, drive_url: 'https://drive.google.com/file/d/photo/view' }] });
    if (url.includes('/object/sign/')) return Response.json([{ path: `${eventId}/photo.jpg`, signedURL: '/object/sign/event-thumbnails/photo.jpg?token=temporary' }]);
    throw new Error('Unexpected backend call');
  };
  vm.runInNewContext(source, { Deno: { env: { get: name => env[name] }, serve: fn => { handler = fn; } }, crypto: webcrypto, TextEncoder, TextDecoder, Response, Request, fetch: fakeFetch, Uint8Array });
  return { handler, calls };
}
async function invoke(instance, body, options = {}) {
  const response = await instance.handler(new Request('https://test.supabase.co/functions/v1/search-photos', { method: 'POST', headers: { Origin: 'https://example.github.io', 'Content-Type': 'application/json', ...options.headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { response, data: await response.json() };
}
let instance = createHandler();
const facenetModel='facenet512-onnx-ssd68-align5-prewhiten-l2-v1';
const facenetVector=Array(512).fill(0);facenetVector[0]=1;
assert.equal((await invoke(createHandler({recognitionModel:facenetModel}),{...valid,model:facenetModel,descriptor:facenetVector})).response.status,200);
assert.equal((await invoke(createHandler({recognitionModel:facenetModel}),valid)).response.status,400);
assert.equal((await invoke(createHandler({recognitionModel:facenetModel}),{...valid,model:facenetModel,descriptor:Array(512).fill(.1)})).response.status,400);
let result = await invoke(instance, valid);
assert.equal(result.response.status, 200); assert.equal(result.data.total, 37);
assert.equal(result.data.photos[0].thumbnail, 'https://test.supabase.co/storage/v1/object/sign/event-thumbnails/photo.jpg?token=temporary');
assert.equal('embedding' in result.data.photos[0], false);
assert.equal('thumbnail_path' in result.data.photos[0], false);
assert.equal(result.response.headers.get('cache-control'), 'no-store');
result = await invoke(createHandler(), { ...valid, action: 'info', lang: 'it' });
assert.deepEqual(result.data, { title: 'Festa', model, photo_count: 37, indexed_photo_count: 33, albums: [{ path: '活动', count: 37 }], drive_url: 'https://drive.google.com/drive/folders/drivefolder12345' });
const browse = { action: 'browse', event: valid.event, key: valid.key, offset: 0, album: '活动', query: ' A ' };
instance = createHandler(); result = await invoke(instance, browse);
assert.equal(result.response.status, 200);
assert.equal(result.data.photos[0].album_path, '活动');
assert.equal(instance.calls.some(c => c.url.includes('match_photos')), false);
assert.deepEqual(JSON.parse(instance.calls.find(c => c.url.includes('browse_photos')).options.body), { p_event: eventId, p_album: '活动', p_query: 'A', p_offset: 0 });
for (const bad of [{ ...browse, album: 5 }, { ...browse, query: 'x'.repeat(101) }, { ...browse, offset: 1 }]) assert.equal((await invoke(createHandler(), bad)).response.status, 400);
assert.equal((await invoke(createHandler({ active: false }), browse)).response.status, 404);
assert.equal((await invoke(createHandler({ limited: true }), browse)).response.status, 429);
for (const bad of [ { ...valid, descriptor: [1] }, { ...valid, descriptor: Array(128).fill(0) },
  { ...valid, model: 'different-model' }, { ...valid, offset: 1 }, { ...valid, key: 'short' },
  { ...valid, event: "x' or true" }, { ...valid, descriptor: Array(128).fill(null) } ]) {
  instance = createHandler(); result = await invoke(instance, bad);
  assert.equal(result.response.status, 400); assert.equal(instance.calls.some(c => c.url.includes('match_photos')), false);
}
assert.equal((await invoke(createHandler({ limited: true }), valid)).response.status, 429);
assert.equal((await invoke(createHandler({ active: false }), valid)).response.status, 404);
assert.equal((await invoke(createHandler({ configured: false }), valid)).response.status, 503);
assert.equal((await invoke(createHandler(), valid, { headers: { Origin: 'https://untrusted.example' } })).response.status, 403);
assert.equal((await invoke(createHandler(), '{invalid')).response.status, 400);
assert.equal((await invoke(createHandler(), 'x'.repeat(17000))).response.status, 413);
console.log('Edge Function checks passed: search + browse validation, activity access, rate limits, album filters and signed results (mock backend).');
