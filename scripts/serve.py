"""Local static preview with byte-range support for accurate MP4 seeking."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re

class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def send_head(self):
        path = Path(self.translate_path(self.path))
        self.byte_range = None
        request = self.headers.get('Range')
        if not request or not path.is_file():
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', request.strip())
        size = path.stat().st_size
        if not match or not any(match.groups()):
            self.send_error(400, 'Invalid byte range')
            return None
        lo, hi = match.groups()
        start = int(lo) if lo else max(0, size - int(hi))
        end = min(int(hi), size - 1) if hi and lo else size - 1
        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        f = path.open('rb')
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Last-Modified', self.date_time_string(path.stat().st_mtime))
        self.end_headers()
        f.seek(start)
        self.byte_range = (start, end)
        return f

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def copyfile(self, source, outputfile):
        try:
            if self.byte_range is None:
                return super().copyfile(source, outputfile)
            remaining = self.byte_range[1] - self.byte_range[0] + 1
            while remaining:
                data = source.read(min(65536, remaining))
                if not data:
                    break
                outputfile.write(data)
                remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Browsers cancel prior range requests when the user seeks.

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    print(f'FloorSAV preview: http://{args.bind}:{args.port}', flush=True)
    ThreadingHTTPServer((args.bind, args.port), partial(Handler, directory=str(root))).serve_forever()
