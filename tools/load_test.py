"""Opt-in real-endpoint test. Needs a vector file; never prints the event token or vector."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import math
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request

MODEL = 'face-api-0.22.2-ssd-landmark68-descriptor128-v1'

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--endpoint', required=True)
    parser.add_argument('--link-file', required=True, help='Local text file containing the complete activity link')
    parser.add_argument('--vector-file', required=True, help='Local JSON array of 128 numbers from the SAME model')
    parser.add_argument('--levels', default='10,50,100,250')
    parser.add_argument('--origin', required=True, help='Allowed website origin, without path')
    parser.add_argument('--run', action='store_true', help='Explicitly run against the real free project and consume its quotas')
    args = parser.parse_args()
    if not args.run:
        parser.error('Add --run to explicitly consume real API and thumbnail-signing quotas.')
    from pathlib import Path
    url = urllib.parse.urlsplit(Path(args.link_file).read_text().strip())
    event = urllib.parse.parse_qs(url.query)['event'][0]
    key = urllib.parse.parse_qs(url.fragment)['key'][0]
    vector = json.loads(Path(args.vector_file).read_text())
    if len(vector) != 128 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in vector):
        parser.error('Invalid vector file')
    payload = json.dumps({'action': 'search', 'event': event, 'key': key, 'model': MODEL, 'descriptor': vector, 'offset': 0}).encode()
    levels = [int(n) for n in args.levels.split(',')]
    if any(n < 1 or n > 250 for n in levels):
        parser.error('Levels must be in 1..250')

    def one(barrier):
        barrier.wait(); start = time.perf_counter()
        req = urllib.request.Request(args.endpoint, data=payload, headers={'Content-Type': 'application/json', 'Origin': args.origin})
        code = 0
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                body = json.loads(response.read()); code = response.status
                if not isinstance(body.get('photos'), list):
                    code = 502
        except urllib.error.HTTPError as error:
            code = error.code
        except Exception:
            code = 0
        return time.perf_counter() - start, code

    import threading
    for level in levels:
        barrier = threading.Barrier(level)
        with ThreadPoolExecutor(max_workers=level) as pool:
            results = [f.result() for f in as_completed([pool.submit(one, barrier) for _ in range(level)])]
        successful = sorted(seconds for seconds, code in results if code == 200)
        codes = {str(code): sum(c == code for _, c in results) for _, code in results}
        print(json.dumps({'concurrent_requests': level, 'responses': codes,
              'p50_seconds': round(statistics.median(successful), 3) if successful else None,
              'p95_seconds': round(successful[max(0, math.ceil(len(successful) * .95) - 1)], 3) if successful else None}))
        if level != levels[-1]:
            print('Wait 65 seconds between levels to avoid mixing rate-limit windows.', flush=True)
            time.sleep(65)

if __name__ == '__main__':
    run()
