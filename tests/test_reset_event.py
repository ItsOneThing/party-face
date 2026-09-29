import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import reset_event
server = reset_event.server

class ResetTests(unittest.TestCase):
    def test_refuses_wrong_model_or_missing_local_credential(self):
        for model in (server.FACENET_MODEL, server.MODEL):
            with patch.object(server, 'cloud', return_value=[{'id':'event-id','model_version':model,'token_hash':'wrong'}]), patch.object(server, 'local_settings', return_value={}):
                with self.assertRaises(ValueError): reset_event.reset('welcome-2026', True)

    def test_removes_data_before_model_change_and_preserves_credentials(self):
        key='test-activity-key'
        event={'id':'event-id','model_version':server.MODEL,'token_hash':server.hashlib.sha256(key.encode()).hexdigest()}
        photo={'drive_file_id':'file','fingerprint':'fingerprint','thumbnail_path':'event-id/file.jpg'}
        calls=[]
        def cloud(path, method='GET', body=None):
            calls.append((path,method,body))
            if path.startswith('/rest/v1/events?slug='): return [event]
            if 'select=drive_file_id' in path: return [photo]
            return []
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder);backup=data/'indexes/welcome-2026';backup.mkdir(parents=True)
            (backup/'old.json').write_text('{"model":"'+server.MODEL+'"}')
            with patch.object(server,'cloud',side_effect=cloud), patch.object(server,'DATA',data), patch.object(server,'local_settings',return_value={'welcome-2026':{'id':'event-id','key':key}}):
                reset_event.reset('welcome-2026',True)
            self.assertFalse((backup/'old.json').exists())
        mutations=[c for c in calls if c[1]!='GET']
        self.assertEqual(mutations[0][2]['active'],False)
        self.assertEqual(mutations[-1][2],{'model_version':server.FACENET_MODEL,'threshold':.75})
        self.assertTrue(any(c[0].startswith('/rest/v1/photos?') and c[1]=='DELETE' for c in calls))
        self.assertFalse(any('event_admins' in c[0] or c[0].startswith('https://www.googleapis.com') for c in calls))
        self.assertFalse(any(c[1]=='DELETE' and c[0].startswith('/rest/v1/events?') for c in calls))

    def test_dry_run_never_writes(self):
        key='test-key';event={'id':'event-id','model_version':server.MODEL,'token_hash':server.hashlib.sha256(key.encode()).hexdigest()}
        with patch.object(server,'cloud',side_effect=[[event],[]]) as cloud, patch.object(server,'local_settings',return_value={'welcome-2026':{'id':'event-id','key':key}}):
            reset_event.reset('welcome-2026')
            self.assertTrue(all(len(c.args)==1 for c in cloud.call_args_list))

if __name__=='__main__': unittest.main()
