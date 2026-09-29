import hashlib
import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('party_server', ROOT / 'tools/server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class ImporterTests(unittest.TestCase):
    def test_modern_secret_key_is_not_sent_as_bearer_jwt(self):
        with patch.dict(server.os.environ, {'SUPABASE_URL': 'https://test.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'sb_secret_test'}), patch.object(server, 'request', return_value=b'[]') as mocked:
            server.cloud('/rest/v1/events')
        headers = mocked.call_args.args[3]
        self.assertEqual(headers['apikey'], 'sb_secret_test')
        self.assertNotIn('Authorization', headers)

    def test_folder_link_and_id(self):
        self.assertEqual(server.folder_id('https://drive.google.com/drive/folders/1Rruj0bvN9gZzSbvtwEVbPRoUshQ0-X7x?usp=sharing'), server.DEFAULT_FOLDER)
        self.assertEqual(server.folder_id(server.DEFAULT_FOLDER), server.DEFAULT_FOLDER)
        for value in ('../../.env', 'abc', "x' or 1=1"):
            with self.assertRaises(ValueError):
                server.folder_id(value)

    def test_vectors_reject_nonfinite_wrong_length_and_bad_boxes(self):
        valid = {'descriptor': [0.1] * 128, 'box': {'x': .1, 'y': .1, 'width': .2, 'height': .2}}
        server.validate_faces([valid])
        server.validate_faces([])
        for bad in ([dict(valid, descriptor=[.1] * 127)], [dict(valid, descriptor=[math.nan] * 128)],
                    [dict(valid, descriptor=[math.inf] * 128)], [dict(valid, descriptor=[True] * 128)],
                    [dict(valid, box={'x': -1, 'y': 0, 'width': 1, 'height': 1})]):
            with self.assertRaises(ValueError):
                server.validate_faces(bad)

    def test_facenet_requires_512_normalized_features(self):
        valid = {'descriptor': [1.0] + [0.0] * 511, 'box': {'x': 0, 'y': 0, 'width': 1, 'height': 1}}
        server.validate_faces([valid], server.FACENET_MODEL)
        for descriptor in ([0.0] * 512, [0.1] * 128, [1.0] * 512):
            with self.assertRaises(ValueError):
                server.validate_faces([dict(valid, descriptor=descriptor)], server.FACENET_MODEL)

    def test_recursion_pagination_dedup_and_unsupported_files(self):
        folder = {'id': 'subfolder123', 'name': 'sub', 'mimeType': 'application/vnd.google-apps.folder'}
        photo = {'id': 'photo1234567', 'name': 'A.jpg', 'mimeType': 'image/jpeg', 'md5Checksum': 'abc'}
        other = {'id': 'video1234567', 'name': 'clip.mp4', 'mimeType': 'video/mp4'}
        pages = [{'files': [folder, photo], 'nextPageToken': 'next'}, {'files': [other]}, {'files': [photo]}]
        with patch.object(server, 'drive', side_effect=pages) as mocked:
            photos, warnings = server.enumerate_files('rootfolder123')
        self.assertEqual(len(photos), 1)
        self.assertEqual(len(photos[0]['fingerprint']), 64)
        self.assertEqual(photos[0]['album_path'], 'sub')
        self.assertEqual(len(warnings), 1)
        self.assertEqual(mocked.call_args_list[1].args[0]['pageToken'], 'next')
        self.assertIn('subfolder123', mocked.call_args_list[2].args[0]['q'])

    def test_resume_reads_more_than_1000_rows_and_reimports_changed(self):
        key = 'K' * 43
        event = {'id': 'event-uuid', 'token_hash': hashlib.sha256(key.encode()).hexdigest(), 'drive_folder_id': server.DEFAULT_FOLDER, 'model_version': server.MODEL, 'active': True}
        imported = [{'drive_file_id': 'p' + str(i), 'fingerprint': 'same', 'model_version': server.MODEL} for i in range(1001)]
        photos = [{'id': 'p' + str(i), 'name': 'A.jpg', 'fingerprint': 'same'} for i in range(1001)]
        photos.append({'id': 'changed', 'name': 'new.jpg', 'fingerprint': 'new'})
        imported.append({'drive_file_id': 'changed', 'fingerprint': 'old', 'model_version': server.MODEL})
        calls = []
        def cloud(path, method='GET', *args, **kwargs):
            calls.append(path)
            if path.startswith('/rest/v1/events?slug='):
                return [event]
            if method == 'PATCH':
                return None
            return imported[:1000] if 'offset=0' in path else imported[1000:]
        with tempfile.TemporaryDirectory() as folder, patch.object(server, 'DATA', Path(folder)), \
             patch.object(server, 'local_settings', return_value={'test-event': {'id': 'event-uuid', 'key': key}}), \
             patch.object(server, 'enumerate_files', return_value=(photos, [])), patch.object(server, 'cloud', side_effect=cloud):
            result = server.make_event({'slug': 'test-event', 'title': 'Event', 'folder': server.DEFAULT_FOLDER})
        self.assertEqual(result['skipped'], 1001)
        self.assertEqual(result['pending'], [{'id': 'changed', 'name': 'new.jpg'}])
        self.assertTrue(any('offset=1000' in call for call in calls))

    def test_import_only_accepts_scanned_ids(self):
        with patch.object(server, 'CURRENT', {'id': 'event'}), patch.object(server, 'FILES', {}):
            with self.assertRaises(ValueError):
                server.save_photo({'id': 'unknown', 'model': server.MODEL, 'faces': []})

    def test_gallery_only_import_can_later_build_face_index(self):
        key = 'K' * 43
        event = {'id': 'event-uuid', 'token_hash': hashlib.sha256(key.encode()).hexdigest(), 'drive_folder_id': server.DEFAULT_FOLDER, 'model_version': server.MODEL}
        photos = [{'id': 'p1', 'name': 'A.jpg', 'fingerprint': 'same'}]
        row = {'drive_file_id': 'p1', 'fingerprint': 'same', 'model_version': server.MODEL, 'face_indexed': False}
        def cloud(path, method='GET', *args, **kwargs):
            if path.startswith('/rest/v1/events?slug='): return [event]
            return None if method == 'PATCH' else [row]
        with tempfile.TemporaryDirectory() as folder, patch.object(server, 'DATA', Path(folder)), \
             patch.object(server, 'local_settings', return_value={'test-event': {'id': 'event-uuid', 'key': key}}), \
             patch.object(server, 'enumerate_files', return_value=(photos, [])), patch.object(server, 'cloud', side_effect=cloud):
            payload = {'slug': 'test-event', 'title': 'Event', 'folder': server.DEFAULT_FOLDER}
            self.assertEqual(server.make_event(dict(payload, recognize=False))['skipped'], 1)
            self.assertEqual(server.make_event(dict(payload, recognize=True))['pending'], [{'id': 'p1', 'name': 'A.jpg'}])

    def test_public_build_excludes_admin_and_secrets_and_checks_assets(self):
        build_spec = importlib.util.spec_from_file_location('build', ROOT / 'tools/build_site.py')
        builder = importlib.util.module_from_spec(build_spec); build_spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); public = root / 'public'; public.mkdir()
            for name in builder.FILES:
                (public / name).write_text('asset')
            for name in ['art', 'models', 'vendor']:
                (public / name).mkdir()
            (public / 'admin.html').write_text('private UI')
            (public / 'person-groups.html').write_text('private review UI')
            (public / 'person-groups-ui.js').write_text('private review code')
            (root / '.env').write_text('SECRET=private')
            with patch.object(builder, 'ROOT', root):
                builder.build()
            self.assertFalse((root / 'dist/admin.html').exists())
            self.assertFalse((root / 'dist/person-groups.html').exists())
            self.assertFalse((root / 'dist/person-groups-ui.js').exists())
            self.assertFalse((root / 'dist/.env').exists())
            self.assertTrue((root / 'dist/index.html').exists())

    def test_downloaded_assets_match_checksums(self):
        manifest = json.loads((ROOT / 'public/asset-checksums.json').read_text())
        self.assertGreater(len(manifest), 5)
        for name, checksum in manifest.items():
            self.assertEqual(hashlib.sha256((ROOT / 'public' / name).read_bytes()).hexdigest(), checksum, name)

if __name__ == '__main__':
    unittest.main()
