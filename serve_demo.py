#!/usr/bin/env python3
"""
serve_demo.py
-------------
Lightweight static file server for the web_demo/ presentation UI.
Run this from the project root and open http://localhost:8080 in your browser.
"""
import http.server
import socketserver
import os
import webbrowser
import threading

PORT = 8080
DEMO_DIR = os.path.join(os.path.dirname(__file__), "web_demo")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DEMO_DIR, **kwargs)
    def log_message(self, fmt, *args):
        print(f"  [{self.address_string()}] {fmt % args}")

def open_browser():
    import time; time.sleep(0.8)
    webbrowser.open(f"http://localhost:{PORT}")

if __name__ == "__main__":
    threading.Thread(target=open_browser, daemon=True).start()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"\n✅  Serving web demo at  http://localhost:{PORT}")
        print("   Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
