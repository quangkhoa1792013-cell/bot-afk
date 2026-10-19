#!/usr/bin/env python3
# Download + ttyd proxy tren cung port
# - /download* -> phuc vu file install (neu .download_on, neu tat thi bao)
# - con lai -> proxy sang ttyd 127.0.0.1:PORT+1 (ttyd chay noi bo)
import http.server
import socketserver
import os
import urllib.parse
import http.client
import socket

PORT = 2013
TTYD_HOST = "127.0.0.1"
# BIND_HOST: hardened = 127.0.0.1 (chi Caddy 80/443 ra ngoai, chan 0.0.0.0:2013 truc tiep)
# Dat BIND_HOST=0.0.0.0 neu muon mo cong truc tiep (dung cho ban phat hanh nhe)
BIND_HOST = os.environ.get("BIND_HOST", "127.0.0.1")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
socketserver.TCPServer.allow_reuse_address = True

def get_tty_port(port):
    try:
        v = int(os.environ.get("TTYD_PORT", 0))
        if v > 0:
            return v
    except:
        pass
    return port + 1

def download_enabled():
    return os.path.exists(os.path.join(BASE_DIR, ".download_on"))

class Handler(http.server.BaseHTTPRequestHandler):
    def serve_portal(self, head_only=False):
        """Portal GUI tai / (sau Caddy auth, truoc khi proxy ttyd)."""
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/" or head_only:
            # HEAD / se do serve_download xu ly? portal chi GET
            if parsed.path == "/" and head_only:
                self.send_response(200)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                return True
            if parsed.path != "/":
                return False
        # GET /
        portal_path = os.path.join(BASE_DIR, "caddy", "portal.html")
        # fallback to index.html
        if not os.path.exists(portal_path):
            portal_path = os.path.join(BASE_DIR, "caddy", "index.html")
        if os.path.exists(portal_path):
            try:
                with open(portal_path, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                if not head_only:
                    self.wfile.write(data)
                return True
            except:
                pass
        # neu ko co file portal, proxy nhu cu
        return False

    def serve_download(self, head_only=False):
        """Phuc vu /download* KHONG can mk. Tra ve True neu da xu ly."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 1. /download -> trang chinh (chi khi bat, neu tat thi bao)
        if path == "/download" or path == "/download/":
            if not download_enabled():
                self.send_response(200)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                if not head_only:
                    html = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>Download</title></head><body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px;background:#0f0f0f;color:#eee"><h1>Download dang tat</h1><p>Chay 'bot download on' tren server de mo.</p><p><a href="/" style="color:#00d4ff">Ve trang chu (ttyd)</a></p></body></html>"""
                    self.wfile.write(html.encode('utf-8'))
                return True
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            if not head_only:
                html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Download Bot</title>
<style>
body{{font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px;background:#0f0f0f;color:#eee}}
h1{{color:#00d4ff}} a{{display:block;padding:16px;margin:12px 0;background:#1a1a2e;border:1px solid #333;border-radius:8px;text-decoration:none;color:#fff;font-size:18px}} a:hover{{background:#16213e;border-color:#00d4ff}} small{{color:#888}}
</style></head><body>
<h1>Download Bot</h1>
<p>Chon file (ghi tay /download de vao day, / la ttyd):</p>
<a href="/download/install.sh">Linux - install.sh <small>({self.file_size("install.sh")})</small></a>
<a href="/download/install.bat">Windows - install.bat <small>({self.file_size("install.bat")})</small></a>
<a href="/download/install.ps1">Windows - install.ps1 <small>({self.file_size("install.ps1")})</small></a>
<p><a href="/" style="background:#004400">Ve trang chu (ttyd)</a></p>
<p style="color:#666;font-size:13px">LAN: http://{self.get_lan_ip()}:{PORT}/download</p>
</body></html>"""
                self.wfile.write(html.encode('utf-8'))
            return True

        # 2. /download/file -> tai file (chi khi bat, KHONG can mk)
        if path.startswith("/download/"):
            if not download_enabled():
                self.send_error(403, "Download dang tat")
                return True
            fname = os.path.basename(path)
            if fname in ["install.sh", "install.bat", "install.ps1"]:
                fpath = os.path.join(BASE_DIR, fname)
                if os.path.exists(fpath):
                    self.send_response(200)
                    self.send_header("Content-type", "application/octet-stream")
                    self.send_header("Content-Disposition", f'attachment; filename="{fname}"')
                    self.send_header("Content-Length", str(os.path.getsize(fpath)))
                    self.end_headers()
                    if not head_only:
                        with open(fpath, 'rb') as f:
                            self.wfile.write(f.read())
                    return True
            self.send_error(404, "Not found")
            return True
        return False

    def do_GET(self):
        # / -> portal GUI, /download* -> tu do, con lai -> ttyd
        if self.serve_portal(head_only=False):
            return
        if self.serve_download(head_only=False):
            return
        self.proxy_to_ttyd()

    def do_HEAD(self):
        if self.serve_portal(head_only=True):
            return
        if self.serve_download(head_only=True):
            return
        self.proxy_to_ttyd()

    def _method_not_for_download(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/download" or parsed.path.startswith("/download/"):
            # /download chi cho GET/HEAD -> cac method khac bao 405, khong day sang ttyd (de khoi doi mk)
            self.send_error(405, "Method Not Allowed - /download chi ho tro GET/HEAD")
            return True
        return False

    def do_POST(self):
        if self._method_not_for_download(): return
        self.proxy_to_ttyd()
    def do_PUT(self):
        if self._method_not_for_download(): return
        self.proxy_to_ttyd()
    def do_DELETE(self):
        if self._method_not_for_download(): return
        self.proxy_to_ttyd()
    def do_OPTIONS(self):
        if self._method_not_for_download(): return
        self.proxy_to_ttyd()

    def proxy_to_ttyd(self):
        ttyd_port = get_tty_port(PORT)
        if self.headers.get("Upgrade", "").lower() == "websocket":
            self.proxy_websocket(ttyd_port)
            return
        try:
            conn = http.client.HTTPConnection(TTYD_HOST, ttyd_port, timeout=10)
            headers = {k: v for k, v in self.headers.items() if k.lower() not in ["host", "connection"]}
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length > 0 else None
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            self.send_response(resp.status, resp.reason)
            for hk, hv in resp.getheaders():
                if hk.lower() in ["connection", "transfer-encoding"]: continue
                self.send_header(hk, hv)
            self.end_headers()
            data = resp.read()
            self.wfile.write(data)
            conn.close()
        except Exception as e:
            self.send_error(502, f"Proxy error to ttyd: {e}")

    def proxy_websocket(self, ttyd_port):
        try:
            remote = socket.create_connection((TTYD_HOST, ttyd_port), timeout=5)
            req_line = f"{self.command} {self.path} {self.request_version}\r\n"
            remote.sendall(req_line.encode())
            for hk, hv in self.headers.items():
                remote.sendall(f"{hk}: {hv}\r\n".encode())
            remote.sendall(b"\r\n")
            self.connection.setblocking(False)
            remote.setblocking(False)
            import select
            while True:
                r, _, _ = select.select([self.connection, remote], [], [], 10)
                if not r:
                    break
                for sock in r:
                    try:
                        data = sock.recv(8192)
                        if not data:
                            return
                        if sock is self.connection:
                            remote.sendall(data)
                        else:
                            self.connection.sendall(data)
                    except:
                        return
        except Exception as e:
            try:
                self.send_error(502, f"WS proxy error: {e}")
            except: pass
        finally:
            try: remote.close()
            except: pass

    def file_size(self, name):
        p = os.path.join(BASE_DIR, name)
        if os.path.exists(p):
            s = os.path.getsize(p)
            return f"{s/1024:.1f} KB" if s>1024 else f"{s} B"
        return "chua co"
    def get_lan_ip(self):
        try:
            s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8",80))
            ip=s.getsockname()[0]; s.close(); return ip
        except: return "127.0.0.1"
    def log_message(self, format, *args):
        print(f"[{self.client_address[0]}] {format%args}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT))
    ttyd_port = get_tty_port(port)
    bind_host = os.environ.get("BIND_HOST", BIND_HOST)
    print(f"[*] Web chay tren {bind_host}:{port} -> ttyd {TTYD_HOST}:{ttyd_port}")

    class DualStackServer(socketserver.ThreadingTCPServer):
        # IPv6 '::' nhan ca IPv4 (khong bi cloudflared noi ::1 tu choi -> 502)
        address_family = socket.AF_INET6
        def server_bind(self):
            try: self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except OSError: pass
            super().server_bind()

    # BIND_HOST=0.0.0.0/:: -> dual-stack '::'; 127.0.0.1 -> IPv4 thuan (hardened)
    if bind_host in ("0.0.0.0", "::", ""):
        server_cls = DualStackServer
        addr = ("::", port)
    else:
        server_cls = socketserver.ThreadingTCPServer
        addr = (bind_host, port)
    socketserver.TCPServer.allow_reuse_address = True
    with server_cls(addr, Handler) as httpd:
        httpd.serve_forever()
