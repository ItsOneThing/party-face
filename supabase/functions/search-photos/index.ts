// Public, read-only search. Authentication is an unguessable per-event link token.
// Never log request bodies: they contain biometric features.
const MODEL = "face-api-0.22.2-ssd-landmark68-descriptor128-v1";
const FACENET_MODEL = "facenet512-onnx-ssd68-align5-prewhiten-l2-v1";
const DIMENSIONS: Record<string, number> = { [MODEL]: 128, [FACENET_MODEL]: 512 };
const BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SALT = Deno.env.get("RATE_LIMIT_SALT") || "";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(x => x.trim()).filter(Boolean);
const headers: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json",
  ...(!SERVICE.startsWith("sb_secret_") ? { Authorization: `Bearer ${SERVICE}` } : {}) };
async function hash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
async function backend(path: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, { method: body === undefined ? "GET" : "POST", headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error("Backend unavailable");
  return response.json();
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowed = ORIGINS.includes(origin);
  const cors: Record<string, string> = { "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json",
    ...(allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } : {}) };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });
  if (!SALT || !ORIGINS.length) return reply(503, { error: "活动接口尚未配置完成。" });
  if (origin && !allowed) return reply(403, { error: "此网站地址未获允许。" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "请使用 POST 请求。" });
  if (!req.headers.get("content-type")?.includes("application/json")) return reply(415, { error: "请求格式错误。" });
  try {
    // Read incrementally to bound memory even with missing/spoofed Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: "请求为空。" });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 16384) { await reader.cancel(); return reply(413, { error: "请求过大。" }); } chunks.push(value); }
    const bytes = new Uint8Array(size); let cursor = 0; for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
    let input; try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400, { error: "请求格式错误。" }); }
    if (!input || !["info", "search", "browse"].includes(input.action) || typeof input.event !== "string" ||
      !/^[a-z0-9][a-z0-9-]{1,63}$/.test(input.event) || typeof input.key !== "string" || !/^[A-Za-z0-9_-]{32,100}$/.test(input.key))
      return reply(400, { error: "活动链接不完整或无效。" });
    const tokenHash = await hash(input.key);
    const events = await backend(`/rest/v1/events?slug=eq.${encodeURIComponent(input.event)}&token_hash=eq.${tokenHash}&active=eq.true&select=id,title,title_it,photo_credit,photo_credit_it,contact_name,expires_at,model_version,drive_folder_id,published_group_revision`);
    const event = events[0];
    if (!event || (event.expires_at && new Date(event.expires_at) <= new Date())) return reply(404, { error: "活动不存在、尚未开放或已关闭。请联系组织者。" });
    if (input.action === "search") {
      const d = input.descriptor;
      const dimension = DIMENSIONS[event.model_version];
      if (!dimension || !Array.isArray(d) || d.length !== dimension || !d.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 2))
        return reply(400, { error: "人脸特征格式错误，请重新选择自拍。" });
      const norm = Math.sqrt(d.reduce((sum: number, n: number) => sum + n * n, 0));
      if (norm < 0.1 || norm > 3 || input.model !== event.model_version || (event.model_version === FACENET_MODEL && Math.abs(norm - 1) > 0.01))
        return reply(400, { error: "识别模型不匹配，请刷新页面或联系组织者。" });
    }
    if (input.action !== "info" && (!Number.isInteger(input.offset) || input.offset < 0 || input.offset > 100000 || input.offset % 24 !== 0))
      return reply(400, { error: "分页参数错误。" });
    if (input.action === "browse" && ((input.album !== null && (typeof input.album !== "string" || input.album.length > 1000)) ||
      typeof input.query !== "string" || input.query.length > 100)) return reply(400, { error: "相册筛选参数错误。" });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const permit = await backend("/rest/v1/rpc/consume_budget", { p_event: event.id, p_client: await hash(`${SALT}:${ip}`), p_action: input.action });
    if (!permit) return reply(429, { error: "当前访问较多或今日查询额度已用完，请稍后再试或联系组织者。" });
    if (input.action === "info") {
      const summary = await backend("/rest/v1/rpc/gallery_summary", { p_event: event.id });
      const folder = event.drive_folder_id;
      return reply(200, { title: input.lang === "it" ? (event.title_it || event.title) : event.title,
        photo_credit: input.lang === "it" ? (event.photo_credit_it || event.photo_credit) : event.photo_credit,
        contact_name: event.contact_name, model: event.model_version, ...summary,
        drive_url: /^[A-Za-z0-9_-]{10,100}$/.test(folder || "") ? `https://drive.google.com/drive/folders/${folder}` : null });
    }
    const result = input.action === "browse"
      ? await backend("/rest/v1/rpc/browse_photos", { p_event: event.id, p_album: input.album, p_query: input.query.trim(), p_offset: input.offset })
      : await backend(event.published_group_revision ? "/rest/v1/rpc/match_person_groups" : "/rest/v1/rpc/match_photos", { p_event: event.id, p_descriptor: JSON.stringify(input.descriptor), p_offset: input.offset });
    if (result.photos.length) {
      const signed = await backend("/storage/v1/object/sign/event-thumbnails", { paths: result.photos.map((p: { thumbnail_path: string }) => p.thumbnail_path), expiresIn: 3600 });
      const urls = new Map(signed.map((s: { path: string; signedURL?: string }) => [s.path, s.signedURL ? `${BASE}/storage/v1${s.signedURL}` : null]));
      return reply(200, { total: result.total, photos: result.photos.map((p: { id: string; name: string; drive_url: string; thumbnail_path: string; album_path?: string }) =>
        ({ id: p.id, name: p.name, drive_url: p.drive_url, album_path: p.album_path || "", thumbnail: urls.get(p.thumbnail_path) || "" })) });
    }
    return reply(200, { total: result.total, photos: [] });
  } catch {
    // Generic errors intentionally exclude credentials and request vectors.
    return reply(503, { error: "查询服务暂时不可用，请稍后重试；持续失败请联系活动组织者。" });
  }
});
