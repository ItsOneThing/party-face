// Authentication is checked on every request by the Auth server. Never trust a decoded JWT or input actor.
// Service credentials and biometric request/response bodies must never be logged.
const BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(x => x.trim()).filter(Boolean);
const serviceHeaders = { apikey: SERVICE, "Content-Type": "application/json",
  ...(!SERVICE?.startsWith("sb_secret_") ? { Authorization: `Bearer ${SERVICE}` } : {}) };
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "", allowed = ORIGINS.includes(origin);
  const cors = { "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json",
    ...(allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization,apikey,content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } : {}) };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });
  if (!BASE || !SERVICE || !ORIGINS.length) return reply(503, { error: "管理接口尚未配置。" });
  if (origin && !allowed) return reply(403, { error: "网站地址未获允许。" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "请使用 POST。" });
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization)) return reply(401, { error: "请先登录管理账号。" });
  if (!req.headers.get("content-type")?.includes("application/json")) return reply(415, { error: "请求格式错误。" });
  try {
    const auth = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: authorization } });
    if (!auth.ok) return reply(401, { error: "登录已失效，请重新登录。" });
    const user = await auth.json();
    if (!user.id || user.is_anonymous || !user.email_confirmed_at) return reply(401, { error: "请使用已确认邮箱的管理员账号。" });
    const reader = req.body?.getReader(); if (!reader) return reply(400, { error: "请求为空。" });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 512000) { await reader.cancel(); return reply(413, { error: "请求过大。" }); } chunks.push(value); }
    const bytes = new Uint8Array(size); let cursor = 0; for (const chunk of chunks) { bytes.set(chunk,cursor); cursor += chunk.length; }
    let input; try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400, { error: "请求格式错误。" }); }
    if (!input || !["events","load","save","publish"].includes(input.action) ||
       (input.action !== "events" && (typeof input.slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(input.slug))))
      return reply(400, { error: "活动参数错误。" });
    // Construct an explicit payload; supplied actor/user/role fields cannot influence authorization.
    const payload = { consent: input.consent, groups: input.groups, signature: input.signature,
      base_revision: input.base_revision ?? null, revision: input.revision, base_published: input.base_published ?? null };
    const response = await fetch(`${BASE}/rest/v1/rpc/admin_groups`, { method: "POST", headers: serviceHeaders,
      body: JSON.stringify({ p_actor: user.id, p_action: input.action, p_slug: input.slug || null, p_payload: payload }) });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "P0429") return reply(429, { error: "管理请求较多，请稍后再试。" });
      if (data.code === "42501") return reply(403, { error: "此账号没有该活动的权限；仅负责人可以发布。" });
      if (data.code === "40001") return reply(409, { error: "其他管理员已保存或索引已变化。你的修改仍在本页；先记录修改，再重新读取最新草稿核对。" });
      return reply(400, { error: "分组无效或索引已变化，请检查活动、完整分组与 006 迁移。" });
    }
    if (input.action === "load") {
      const signedResponse = await fetch(`${BASE}/storage/v1/object/sign/event-thumbnails`, { method: "POST", headers: serviceHeaders,
        body: JSON.stringify({ paths: data.photos.map((p: { thumbnail_path: string }) => p.thumbnail_path), expiresIn: 900 }) });
      if (!signedResponse.ok) throw new Error("Unavailable");
      const signed = await signedResponse.json();
      const urls = new Map(signed.map((s: { path: string; signedURL?: string }) => [s.path,s.signedURL ? `${BASE}/storage/v1${s.signedURL}` : ""]));
      data.photos = data.photos.map((p: { id: string; name: string; drive_url: string; thumbnail_path: string }) =>
        ({ id:p.id, name:p.name, drive_url:p.drive_url, url:urls.get(p.thumbnail_path) || "" }));
    }
    return reply(200,data);
  } catch { return reply(503, { error: "管理服务暂时不可用，请稍后再试。" }); }
});
