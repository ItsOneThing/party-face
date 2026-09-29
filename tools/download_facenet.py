"""Optional FaceNet512 assets for local testing/new events. No cloud inference."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MODEL_SHA = 'a1c06dcb79dc17a42af01d5bcbce4822caa148b9c24bf7eb8b8e556b4fd0d5db'
MODEL_URL = 'https://github.com/PicPeak/picpeak/releases/download/ml-models-v1/facenet512.onnx'
ORT_VERSION = '1.22.0'

def main():
    target = ROOT / 'public/models/facenet512.onnx'
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != MODEL_SHA:
        temporary = target.with_suffix('.download')
        digest = hashlib.sha256(); size = 0
        try:
            with urllib.request.urlopen(MODEL_URL, timeout=90) as response, temporary.open('wb') as output:
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > 110 * 1024 * 1024:
                        raise ValueError('Model exceeds expected size')
                    digest.update(chunk); output.write(chunk)
            if digest.hexdigest() != MODEL_SHA:
                raise ValueError('FaceNet512 checksum mismatch')
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    runtime = ROOT / 'public/vendor/ort'
    runtime.mkdir(parents=True, exist_ok=True)
    files = ['dist/ort.wasm.min.js', 'dist/ort-wasm-simd-threaded.mjs', 'dist/ort-wasm-simd-threaded.wasm']
    with urllib.request.urlopen(f'https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-{ORT_VERSION}.tgz', timeout=90) as response:
        archive = response.read(60 * 1024 * 1024)
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as package:
        for name in files:
            member = package.getmember('package/' + name)
            if not member.isfile() or member.size > 30 * 1024 * 1024:
                raise ValueError('Unexpected runtime asset')
            (runtime / Path(name).name).write_bytes(package.extractfile(member).read())
    with urllib.request.urlopen('https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE', timeout=30) as response:
        (runtime / 'LICENSE').write_bytes(response.read(100000))
    notices = ROOT / 'public/vendor/facenet'
    notices.mkdir(parents=True, exist_ok=True)
    (notices / 'deepface-LICENSE.txt').write_bytes((ROOT / 'licenses/deepface-LICENSE.txt').read_bytes())
    (notices / 'THIRD_PARTY_NOTICES.md').write_bytes((ROOT / 'THIRD_PARTY_NOTICES.md').read_bytes())
    paths = [target, *runtime.iterdir(), *notices.iterdir()]
    manifest = {str(p.relative_to(ROOT / 'public')): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
    (ROOT / 'public/facenet-checksums.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('FaceNet512 verified; ONNX Runtime Web', ORT_VERSION, 'ready. Model: 93,985,004 bytes.', flush=True)

if __name__ == '__main__':
    main()
