"""Allowlist public assets. Never copy local data, credentials, or the admin tool."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
FILES = ['index.html', 'styles.css', 'gallery.css', 'config.js', 'app.js', 'recognition.js', 'i18n.js', 'gallery.js', 'gallery-ui.js', 'asset-checksums.json']

def build():
    output = ROOT / 'dist'
    # Only replaces this script's generated output directory, never source files.
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    for name in FILES:
        source = ROOT / 'public' / name
        if not source.is_file():
            raise RuntimeError('Missing asset: ' + name + '. Run tools/download_models.py first.')
        shutil.copy2(source, output / name)
    for name in ['art', 'models', 'vendor']:
        shutil.copytree(ROOT / 'public' / name, output / name)
    (output / '.nojekyll').touch()
    print('Built dist/: website and models only. No admin, secrets or biometric indexes.')

if __name__ == '__main__':
    build()
