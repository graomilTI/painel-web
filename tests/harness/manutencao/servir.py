"""Servidor estático sem cache para o harness (o navegador guardava módulos antigos entre uma rodada e outra).
Uso: python servir.py PORTA [PASTA]"""
import http.server
import os
import sys


class SemCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    if len(sys.argv) > 2:
        os.chdir(sys.argv[2])
    http.server.ThreadingHTTPServer(('', int(sys.argv[1])), SemCache).serve_forever()
