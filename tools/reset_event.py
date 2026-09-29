"""Explicitly reset one legacy event for reimport. Never touches Google Drive originals."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import server


def reset(slug, execute=False):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,63}', slug):
        raise ValueError('Invalid event slug')
    rows = server.cloud('/rest/v1/events?slug=eq.' + slug + '&select=*')
    if len(rows) != 1 or rows[0]['model_version'] != server.MODEL:
        raise ValueError('Expected exactly one legacy event; refusing to erase a new-model event')
    event = rows[0]
    saved = server.local_settings().get(slug)
    if not saved or saved['id'] != event['id'] or hashlib.sha256(saved['key'].encode()).hexdigest() != event['token_hash']:
        raise ValueError('Local activity credential does not match')
    photos = []; offset = 0
    while True:
        page = server.cloud('/rest/v1/photos?event_id=eq.' + event['id'] + '&select=drive_file_id,fingerprint,thumbnail_path&order=id&limit=1000&offset=' + str(offset))
        photos.extend(page)
        if len(page) < 1000: break
        offset += len(page)
    if any(not p['thumbnail_path'].startswith(event['id'] + '/') for p in photos):
        raise ValueError('Unexpected thumbnail path; refusing reset')
    print(json.dumps({'event': slug, 'legacy_photos': len(photos), 'execute': execute, 'drive_originals': 'preserved'}))
    if not execute: return
    route = '/rest/v1/events?id=eq.' + event['id']
    server.cloud(route, 'PATCH', {'active': False, 'published_group_revision': None, 'latest_group_revision': None})
    server.cloud('/rest/v1/person_group_revisions?event_id=eq.' + event['id'], 'DELETE')
    # Delete derived storage through the Storage API, not storage SQL tables.
    for start in range(0, len(photos), 100):
        server.cloud('/storage/v1/object/event-thumbnails', 'DELETE', {'prefixes': [p['thumbnail_path'] for p in photos[start:start+100]]})
    server.cloud('/rest/v1/photos?event_id=eq.' + event['id'], 'DELETE')  # cascades faces
    for table in ('photos', 'faces', 'person_group_revisions'):
        if server.cloud('/rest/v1/' + table + '?event_id=eq.' + event['id'] + '&select=id&limit=1'):
            raise ValueError('Reset incomplete; activity remains closed')
    # Change the model only AFTER the incompatible data is removed. Keep ID, key and role grants.
    server.cloud(route, 'PATCH', {'model_version': server.FACENET_MODEL, 'threshold': 0.75})
    backup = server.DATA / 'indexes' / slug
    if backup.exists():
        for file in backup.glob('*.json'):
            data = json.loads(file.read_text())
            if data.get('model') == server.MODEL: file.unlink()
    for photo in photos:
        cache = hashlib.sha256((photo['drive_file_id'] + photo['fingerprint']).encode()).hexdigest()
        for suffix in ('.jpg', '-thumb.jpg'):
            (server.DATA / 'images' / (cache + suffix)).unlink(missing_ok=True)
    print('Reset verified: old index removed; permissions and activity key retained; activity closed for reimport.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('slug')
    parser.add_argument('--execute', action='store_true', help='Delete derived data; without this flag only reports counts')
    args = parser.parse_args()
    server.read_env()
    reset(args.slug, args.execute)
