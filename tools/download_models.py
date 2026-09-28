"""Download pinned face-api.js 0.22.2 assets. No paid API or runtime inference service."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/0.22.2/'
MODELS = ['ssd_mobilenetv1', 'face_landmark_68', 'face_recognition']

def download(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return
    print('Downloading', target.name, flush=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'partyface-setup/1'})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(30 * 1024 * 1024)
    temp = target.with_suffix(target.suffix + '.tmp')
    temp.write_bytes(data)
    temp.replace(target)

def main():
    download(BASE + 'dist/face-api.min.js', ROOT / 'public/vendor/face-api.min.js')
    download(BASE + 'LICENSE', ROOT / 'public/vendor/face-api-LICENSE.txt')
    for model in MODELS:
        name = model + '_model-weights_manifest.json'
        target = ROOT / 'public/models' / name
        download(BASE + 'weights/' + name, target)
        for group in json.loads(target.read_text()):
            for shard in group['paths']:
                if '/' in shard or '..' in shard:
                    raise ValueError('Invalid shard name')
                download(BASE + 'weights/' + shard, target.parent / shard)
    paths = list((ROOT / 'public/models').glob('*')) + list((ROOT / 'public/vendor').glob('*'))
    hashes = {str(p.relative_to(ROOT / 'public')): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
    (ROOT / 'public/asset-checksums.json').write_text(json.dumps(hashes, indent=2) + '\n')
    print('Ready. Model/library version: face-api.js 0.22.2. Assets are served from your own site.')

if __name__ == '__main__':
    main()
