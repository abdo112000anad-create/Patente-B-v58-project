#!/usr/bin/env python3
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'public'
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        pathname=unquote(urlsplit(path).path).lstrip('/')
        if pathname in ('','.'):
            return str(ROOT/'index.html')
        candidate=(ROOT/pathname).resolve()
        if candidate.is_relative_to(ROOT) and candidate.is_file():
            return str(candidate)
        public_candidate=(PUBLIC/pathname).resolve()
        if public_candidate.is_relative_to(PUBLIC) and public_candidate.is_file():
            return str(public_candidate)
        return str(ROOT/'__not_found__')
    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)
port=int(os.environ.get('PORT','3000'))
server=ThreadingHTTPServer(('0.0.0.0',port),Handler)
print(f'Patente preview listening on 0.0.0.0:{port}',flush=True)
server.serve_forever()
