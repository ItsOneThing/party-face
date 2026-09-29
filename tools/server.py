"""Loopback-only import UI. Cloud credentials never reach the browser or public directory."""
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
DATA = ROOT / 'local-data'
MODEL = 'face-api-0.22.2-ssd-landmark68-descriptor128-v1'
FACENET_MODEL = 'facenet512-onnx-ssd68-align5-prewhiten-l2-v1'
MODEL_DIMENSIONS = {MODEL: 128, FACENET_MODEL: 512}
DEFAULT_FOLDER = '1Rruj0bvN9gZzSbvtwEVbPRoUshQ0-X7x'
SESSION = secrets.token_urlsafe(32)
FILES = {}
CURRENT = None
LOCK = threading.Lock()

def read_env():
    path = ROOT / '.env'
    if path.exists():
        for line in path.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith('#') or '=' not in line:
                continue
            name, value = line.split('=', 1)
            os.environ.setdefault(name.strip(), value.strip().strip('\"\''))

def required(name):
    value = os.environ.get(name, '')
    if not value or 'YOUR_' in value:
        raise ValueError('请先在 .env 填写 ' + name)
    return value

def request(url, method='GET', body=None, headers=None, maximum=100 * 1024 * 1024):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            data = res.read(maximum + 1)
            if len(data) > maximum:
                raise ValueError('文件超过本地导入上限（100 MB）。')
            return data
    except urllib.error.HTTPError as error:
        # Never expose URLs (API keys) or upstream response bodies in logs or browser.
        raise ValueError('远端请求失败（HTTP %s），请检查 API 配置、数据库结构和文件权限。' % error.code) from None
    except urllib.error.URLError:
        raise ValueError('网络连接失败，请检查网络后重试。') from None

def cloud(path, method='GET', body=None, extra=None, raw=False):
    base = required('SUPABASE_URL').rstrip('/')
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', base):
        raise ValueError('SUPABASE_URL 必须是 https://项目ID.supabase.co')
    key = required('SUPABASE_SERVICE_ROLE_KEY')
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if not key.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + key
    headers.update(extra or {})
    payload = body if isinstance(body, bytes) else (json.dumps(body).encode() if body is not None else None)
    result = request(base + path, method, payload, headers)
    return result if raw else (json.loads(result) if result else None)

def drive(params):
    params = dict(params, key=required('GOOGLE_DRIVE_API_KEY'))
    data = request('https://www.googleapis.com/drive/v3/files?' + urllib.parse.urlencode(params))
    return json.loads(data)

def folder_id(value):
    match = re.search(r'/folders/([A-Za-z0-9_-]+)', value)
    candidate = match.group(1) if match else value.strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{10,100}', candidate):
        raise ValueError('Google Drive 文件夹链接无效。')
    return candidate

def enumerate_files(folder):
    queue = [(folder, '')]; visited = set(); photos = []; warnings = []
    while queue:
        parent, album = queue.pop(0)
        if parent in visited:
            continue
        visited.add(parent)
        if len(visited) > 1000:
            raise ValueError('文件夹过多，请选择更小的活动文件夹。')
        page = None
        while True:
            params = {'q': "'%s' in parents and trashed = false" % parent, 'pageSize': 1000,
                      'fields': 'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,webViewLink,resourceKey,size)', 'orderBy': 'name'}
            if page:
                params['pageToken'] = page
            data = drive(params)
            for item in data.get('files', []):
                mime = item['mimeType']
                if mime == 'application/vnd.google-apps.folder':
                    queue.append((item['id'], (album + ' / ' if album else '') + item['name']))
                elif mime in ('image/jpeg', 'image/png', 'image/webp'):
                    if int(item.get('size', 0)) > 100 * 1024 * 1024:
                        warnings.append(item['name'] + ' 超过 100 MB，已跳过。')
                    else:
                        item['album_path'] = album
                        identity = {key: item.get(key, '') for key in ('id', 'name', 'md5Checksum', 'modifiedTime', 'webViewLink', 'resourceKey', 'album_path')}
                        item['fingerprint'] = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
                        photos.append(item)
                else:
                    warnings.append(item['name'] + ' 不是支持的图片格式，已跳过。')
            page = data.get('nextPageToken')
            if not page:
                break
    # Deduplicate by Drive ID; shared shortcuts are deliberately not followed.
    return list({p['id']: p for p in photos}.values()), warnings

def local_settings():
    path = DATA / 'events.json'
    return json.loads(path.read_text()) if path.exists() else {}

def save_settings(data):
    DATA.mkdir(exist_ok=True)
    path = DATA / 'events.json'; temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    temporary.chmod(0o600); temporary.replace(path)

def make_event(payload):
    global CURRENT, FILES
    slug = payload.get('slug', '').strip(); title = payload.get('title', '').strip()
    title_it = payload.get('title_it', '').strip() or None
    recognize = payload.get('recognize', True) is True
    model = payload.get('model', MODEL)
    if model not in MODEL_DIMENSIONS:
        raise ValueError('不支持的识别模型。')
    if title_it and len(title_it) > 100:
        raise ValueError('意大利语活动名称最多 100 字符。')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,63}', slug) or not 1 <= len(title) <= 100:
        raise ValueError('活动编号请用 2–64 位小写字母、数字或短横线；活动名称不能为空。')
    folder = folder_id(payload.get('folder', ''))
    photos, warnings = enumerate_files(folder)
    if not photos:
        raise ValueError('未找到可导入的照片。请检查文件夹是否公开、API 是否启用。')
    settings = local_settings()
    events = cloud('/rest/v1/events?slug=eq.' + slug + '&select=*')
    if events:
        event = events[0]
        saved = settings.get(slug)
        if not saved or hashlib.sha256(saved['key'].encode()).hexdigest() != event['token_hash']:
            raise ValueError('此活动编号已存在，但本机缺少对应访问码。请恢复 local-data 备份，或使用新编号。')
        if event['drive_folder_id'] != folder or event['model_version'] != model:
            raise ValueError('活动编号已用于其他文件夹或模型，请为新活动使用新编号。')
        cloud('/rest/v1/events?id=eq.' + event['id'], 'PATCH', {'title': title, 'title_it': title_it})
        saved['title'] = title
    else:
        key = secrets.token_urlsafe(32)
        event = cloud('/rest/v1/events', 'POST', {'slug': slug, 'title': title, 'title_it': title_it, 'drive_folder_id': folder,
                      'model_version': model, 'threshold': 0.75 if model == FACENET_MODEL else 0.42, 'token_hash': hashlib.sha256(key.encode()).hexdigest()}, {'Prefer': 'return=representation'})[0]
        saved = {'id': event['id'], 'key': key, 'title': title, 'folder': folder}
        settings[slug] = saved
    save_settings(settings)
    # Supabase defaults to 1000 rows: paginate import checkpoints explicitly.
    imported = {}; start = 0
    while True:
        rows = cloud('/rest/v1/photos?event_id=eq.%s&select=drive_file_id,fingerprint,model_version,face_indexed&order=id&limit=1000&offset=%d' % (saved['id'], start))
        imported.update({r['drive_file_id']: r for r in rows})
        if len(rows) < 1000:
            break
        start += len(rows)
    FILES = {p['id']: p for p in photos}; CURRENT = dict(saved, slug=slug, model=model)
    pending = [p for p in photos if p['id'] not in imported or imported[p['id']]['fingerprint'] != p['fingerprint'] or imported[p['id']]['model_version'] != model or (recognize and not imported[p['id']].get('face_indexed', True))]
    return {'total': len(photos), 'skipped': len(photos) - len(pending), 'pending': [{'id': p['id'], 'name': p['name']} for p in pending], 'warnings': warnings, 'active': event.get('active', False)}

def image_path(file_id):
    if file_id not in FILES:
        raise ValueError('请先扫描活动文件夹。')
    item = FILES[file_id]
    cache_id = hashlib.sha256((file_id + item['fingerprint']).encode()).hexdigest()
    directory = DATA / 'images'; directory.mkdir(parents=True, exist_ok=True)
    full = directory / (cache_id + '.jpg'); thumb = directory / (cache_id + '-thumb.jpg')
    if not full.exists() or not thumb.exists():
        url = 'https://www.googleapis.com/drive/v3/files/' + file_id + '?' + urllib.parse.urlencode({'alt': 'media', 'key': required('GOOGLE_DRIVE_API_KEY')})
        headers = {}
        if item.get('resourceKey'):
            headers['X-Goog-Drive-Resource-Keys'] = file_id + '/' + item['resourceKey']
        data = request(url, headers=headers)
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 60000000:
                raise ValueError('图片超过 6000 万像素，请先缩小后重新上传。')
            img = ImageOps.exif_transpose(source).convert('RGB')
            img.thumbnail((2400, 2400)); img.save(full, 'JPEG', quality=92)
            img.thumbnail((640, 640)); img.save(thumb, 'JPEG', quality=72, optimize=True)
    return full, thumb

def validate_faces(faces, model=MODEL):
    if not isinstance(faces, list) or len(faces) > 300:
        raise ValueError('人脸数据无效。')
    for face in faces:
        descriptor = face.get('descriptor')
        dimension = MODEL_DIMENSIONS.get(model)
        if not dimension or not isinstance(descriptor, list) or len(descriptor) != dimension or not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) and abs(n) <= 2 for n in descriptor):
            raise ValueError('人脸特征维度或数值与模型不一致。')
        if model == FACENET_MODEL and not 0.99 <= math.sqrt(sum(n*n for n in descriptor)) <= 1.01:
            raise ValueError('FaceNet512 特征必须已单位归一化。')
        box = face.get('box', {})
        if not all(isinstance(box.get(k), (int, float)) and math.isfinite(box[k]) and 0 <= box[k] <= 1.1 for k in ('x', 'y', 'width', 'height')):
            raise ValueError('人脸坐标无效。')

def save_photo(payload):
    if not CURRENT or payload.get('id') not in FILES or payload.get('model') != CURRENT.get('model', MODEL):
        raise ValueError('导入会话或模型无效。')
    model = CURRENT.get('model', MODEL)
    faces = payload.get('faces'); validate_faces(faces, model)
    indexed = payload.get('indexed', True)
    if not isinstance(indexed, bool) or (not indexed and faces):
        raise ValueError('未建立索引的照片不能包含人脸特征。')
    item = FILES[payload['id']]; _, thumb = image_path(item['id'])
    path = CURRENT['id'] + '/' + item['id'] + '.jpg'
    cloud('/storage/v1/object/event-thumbnails/' + path, 'POST', thumb.read_bytes(),
          {'Content-Type': 'image/jpeg', 'x-upsert': 'true'}, raw=True)
    url = item.get('webViewLink') or ('https://drive.google.com/file/d/' + item['id'] + '/view')
    if item.get('resourceKey') and 'resourcekey=' not in url.lower():
        url += ('&' if '?' in url else '?') + 'resourcekey=' + urllib.parse.quote(item['resourceKey'])
    cloud('/rest/v1/rpc/import_photo', 'POST', {'p_event': CURRENT['id'], 'p_file': item['id'], 'p_name': item['name'],
          'p_url': url, 'p_thumbnail': path, 'p_fingerprint': item['fingerprint'], 'p_model': model, 'p_faces': faces,
          'p_album': item.get('album_path', ''), 'p_indexed': indexed})
    # Keep a local backup of imported vectors; never publish local-data.
    backup = DATA / 'indexes' / CURRENT['slug']; backup.mkdir(parents=True, exist_ok=True)
    (backup / (item['id'] + '.json')).write_text(json.dumps({'file': item, 'model': model, 'faces': faces, 'indexed': indexed}))
    return {'faces': len(faces)}

def publish(payload):
    if not CURRENT:
        raise ValueError('请先扫描活动。')
    active = payload.get('active') is True
    base = required('PUBLIC_SITE_URL')
    if not base.startswith(('https://', 'http://127.0.0.1:', 'http://localhost:')) or '?' in base or '#' in base:
        raise ValueError('PUBLIC_SITE_URL 请填写网站基础地址，不含 ? 或 #。')
    if active:
        rows = cloud('/rest/v1/photos?event_id=eq.' + CURRENT['id'] + '&select=id&limit=1')
        if not rows:
            raise ValueError('至少导入一张照片后才能发布。')
    cloud('/rest/v1/events?id=eq.' + CURRENT['id'], 'PATCH', {'active': active})
    return {'active': active, 'link': base.rstrip('/') + '/?event=' + CURRENT['slug'] + '#key=' + CURRENT['key']}

def group_event(payload):
    slug = payload.get('slug', '')
    if not isinstance(slug, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,63}', slug):
        raise ValueError('请填写有效的活动编号。')
    saved = local_settings().get(slug)
    if not saved or not saved.get('key'):
        raise ValueError('本机没有这个活动的访问码，请恢复 local-data 备份。')
    events = cloud('/rest/v1/events?slug=eq.' + slug + '&select=*')
    if not events or events[0]['id'] != saved['id'] or events[0]['token_hash'] != hashlib.sha256(saved['key'].encode()).hexdigest():
        raise ValueError('活动与本机访问码不一致。')
    if events[0]['model_version'] != FACENET_MODEL:
        raise ValueError('人物分组仅用于新的 FaceNet512 活动，不能混用旧模型特征。')
    return events[0]

def group_load(payload):
    if payload.get('consent') is not True:
        raise ValueError('请先确认人物已明确同意识别与分组测试。')
    event = group_event(payload); event_id = event['id']
    signature = cloud('/rest/v1/rpc/person_index_signature', 'POST', {'p_event': event_id})
    photos = cloud('/rest/v1/photos?event_id=eq.' + event_id + '&select=id,name,drive_url,thumbnail_path&order=id&limit=501')
    if len(photos) > 500:
        raise ValueError('当前分组工具最多处理 500 张照片，请使用较小的测试活动。')
    faces = []; offset = 0
    while True:
        rows = cloud('/rest/v1/faces?event_id=eq.' + event_id + '&select=id,photo_id,embedding,box&order=id&limit=1000&offset=' + str(offset))
        faces.extend(rows)
        if len(faces) > 2000:
            raise ValueError('当前分组工具最多处理 2000 张人脸，请使用较小的测试活动。')
        if len(rows) < 1000: break
        offset += len(rows)
    if not faces:
        raise ValueError('这个活动还没有人脸索引，请先完成 FaceNet512 导入。')
    if signature != cloud('/rest/v1/rpc/person_index_signature', 'POST', {'p_event': event_id}):
        raise ValueError('导入索引正在变化，请完成导入后再读取。')
    signed = cloud('/storage/v1/object/sign/event-thumbnails', 'POST', {'paths': [p['thumbnail_path'] for p in photos], 'expiresIn': 3600})
    urls = {s['path']: required('SUPABASE_URL').rstrip('/') + '/storage/v1' + s['signedURL'] for s in signed if s.get('signedURL')}
    output_photos = [{'id': p['id'], 'name': p['name'], 'url': urls.get(p['thumbnail_path'], ''), 'drive_url': p['drive_url']} for p in photos]
    output_faces = [{'id': str(f['id']), 'photoId': f['photo_id'], 'descriptor': json.loads(f['embedding']) if isinstance(f['embedding'], str) else f['embedding'], 'box': f['box']} for f in faces]
    revisions = cloud('/rest/v1/person_group_revisions?event_id=eq.' + event_id + '&index_signature=eq.' + signature + '&select=id&order=created_at.desc,id.desc&limit=1')
    saved_groups = []; revision = revisions[0]['id'] if revisions else None
    if revision:
        offset = 0
        while True:
            rows = cloud('/rest/v1/person_groups?revision_id=eq.' + revision + '&select=id,name,reviewed&order=id&limit=1000&offset=' + str(offset))
            saved_groups.extend(rows)
            if len(rows) < 1000: break
            offset += len(rows)
        members = cloud('/rest/v1/person_group_faces?revision_id=eq.' + revision + '&select=group_id,face_id&order=face_id&limit=1000')
        if len(members) == 1000:
            members += cloud('/rest/v1/person_group_faces?revision_id=eq.' + revision + '&select=group_id,face_id&order=face_id&limit=1000&offset=1000')
        for group in saved_groups:
            group['faces'] = [str(m['face_id']) for m in members if m['group_id'] == group['id']]
    return {'event': event_id, 'slug': event['slug'], 'signature': signature, 'photos': output_photos, 'faces': output_faces,
            'groups': saved_groups, 'revision': revision, 'published': event.get('published_group_revision')}

def group_save(payload):
    if payload.get('consent') is not True:
        raise ValueError('请先确认人物已明确同意识别与分组测试。')
    event = group_event(payload)
    groups = payload.get('groups')
    if not isinstance(groups, list) or not 1 <= len(groups) <= 2000:
        raise ValueError('分组数据无效。')
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get('name', ''), str) or len(group.get('name', '')) > 60 or not isinstance(group.get('reviewed'), bool) or not isinstance(group.get('faces'), list):
            raise ValueError('分组数据无效。')
    signature = payload.get('signature')
    if not isinstance(signature, str) or not re.fullmatch(r'[a-f0-9]{32}', signature):
        raise ValueError('请重新读取活动索引后再保存。')
    return cloud('/rest/v1/rpc/save_person_groups', 'POST', {'p_event': event['id'], 'p_groups': groups, 'p_signature': signature})

def group_publish(payload):
    if payload.get('consent') is not True:
        raise ValueError('请先确认人物已明确同意识别与分组测试。')
    event = group_event(payload); revision = payload.get('revision', '')
    if not isinstance(revision, str) or not re.fullmatch(r'[a-f0-9-]{36}', revision):
        raise ValueError('请先保存分组，再发布保存的版本。')
    cloud('/rest/v1/rpc/publish_person_groups', 'POST', {'p_event': event['id'], 'p_revision': revision})
    return {'published': revision, 'active': event['active']}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, fmt, *args):
        # No URL logging: activity tokens must not appear in logs.
        pass

    def valid_host(self):
        return self.headers.get('Host') in ('127.0.0.1:8765', 'localhost:8765')

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def respond(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        if not self.valid_host():
            return self.respond(403, {'error': 'Invalid host'})
        url = urllib.parse.urlsplit(self.path)
        if url.path == '/api/session':
            if self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
                return self.respond(403, {'error': 'Invalid origin'})
            return self.respond(200, {'session': SESSION, 'configured': all(os.environ.get(k) and 'YOUR_' not in os.environ[k] for k in ('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_DRIVE_API_KEY')), 'folder': DEFAULT_FOLDER})
        if url.path == '/api/image':
            if self.headers.get('X-Local-Session') != SESSION:
                return self.respond(403, {'error': 'Invalid session'})
            try:
                file_id = urllib.parse.parse_qs(url.query).get('id', [''])[0]
                full, _ = image_path(file_id); data = full.read_bytes()
                self.send_response(200); self.send_header('Content-Type', 'image/jpeg'); self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
            except ValueError as error:
                self.respond(400, {'error': str(error)})
            return
        # Restrict to public files even if symlinks/path traversal are introduced later.
        translated = Path(self.translate_path(self.path)).resolve()
        if not translated.is_relative_to(PUBLIC.resolve()):
            return self.respond(403, {'error': 'Invalid path'})
        if translated.is_dir() and not (translated / 'index.html').exists():
            return self.respond(404, {'error': 'Not found'})
        super().do_GET()

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') not in ('http://127.0.0.1:8765', 'http://localhost:8765') or self.headers.get('X-Local-Session') != SESSION:
            return self.respond(403, {'error': 'Local session required'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 2 * 1024 * 1024:
                return self.respond(413, {'error': 'Request too large'})
            payload = json.loads(self.rfile.read(size))
            if not LOCK.acquire(blocking=False):
                return self.respond(409, {'error': '另一个导入任务正在运行，请稍后重试。'})
            try:
                actions = {'/api/scan': make_event, '/api/save': save_photo, '/api/publish': publish,
                           '/api/groups/load': group_load, '/api/groups/save': group_save, '/api/groups/publish': group_publish}
                if self.path not in actions:
                    return self.respond(404, {'error': 'Not found'})
                result = actions[self.path](payload)
            finally:
                LOCK.release()
            self.respond(200, result)
        except (ValueError, KeyError, TypeError):
            # ValueError from our own validation is safe; JSON/PIL parsing is generic.
            import sys
            error = sys.exc_info()[1]
            message = str(error) if type(error) is ValueError else '导入数据无效，请检查设置后重试。'
            self.respond(400, {'error': message})
        except Exception:
            self.respond(500, {'error': '导入失败，请检查配置与网络后重新扫描；已成功的照片会跳过。'})

if __name__ == '__main__':
    read_env()
    print('partyface preview: http://127.0.0.1:8765/')
    print('Import tool: http://127.0.0.1:8765/admin.html')
    print('Keep this terminal open while importing. Credentials remain on this computer.')
    ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
