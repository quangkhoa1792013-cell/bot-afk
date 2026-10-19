#!/usr/bin/env python3
# Proxy v3: client thật -> 127.0.0.1:25570 -> java.kingmc.vn:25565
# - Frame đầu chiều client = Handshake -> rewrite host thành kingmc.vn:25565
# - Log id/len 2 chiều, phân tích packet quan trọng (plugin msg, disconnect, chat)
# - Giữ raw stream cả 2 chiều để phân tích offline

import socket, threading, struct, zlib, time, itertools, re, os

LISTEN_PORT = 25570
TARGET_HOST = "java.kingmc.vn"
TARGET_PORT = 25565
OUT_DIR = "/home/khoablabla/geasf/scripts/proxy"
os.makedirs(OUT_DIR, exist_ok=True)
LOG = os.path.join(OUT_DIR, "proxy.log")

lk = threading.Lock()
conn_counter = itertools.count(1)

def vi(data, i=0):
    n = 0; sh = 0
    while True:
        x = data[i]; i += 1
        n |= (x & 0x7F) << sh
        if not x & 0x80:
            return n, i
        sh += 7
        if sh > 35:
            raise ValueError("varint too long")

def enc_varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)

def readable(data, limit=300):
    txt = data.decode("utf-8", "ignore")
    txt = re.sub(r"[^\x20-\x7E\u00C0-\u024F\u1EA0-\u1EF9]", " ", txt)
    return re.sub(r"\s+", " ", txt).strip()[:limit]

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    with lk:
        print(line, flush=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")

class Splitter:
    """Dồn byte thành frames varint-length"""
    def __init__(self):
        self.buf = bytearray()
    def feed(self, chunk):
        self.buf.extend(chunk)
        frames = []
        while True:
            if not self.buf:
                break
            try:
                ln, hl = vi(bytes(self.buf[:5]))
                if ln > 2_500_000:
                    raise ValueError("frame quá lớn")
            except (IndexError, ValueError):
                break
            if len(self.buf) < hl + ln:
                break
            body = bytes(self.buf[hl:hl+ln])
            del self.buf[:hl+ln]
            frames.append(body)
        return frames

# ---- phase tracking + in packet đáng chú ý ----
DETAIL_IN = {   # clientbound
    0x18: "PluginMsg", 0x20: "DISCONNECT", 0x77: "SystemChat", 0x55: "ActionBar",
    0x30: "JoinGame", 0x46: "PlayerPosition", 0x2B: "KeepAlive", 0x3B: "Ping",
    0x0B: "ChunkBatchFinished", 0x0C: "ChunkBatchStarted", 0x02: "LoginSuccess(Login)",
    0x03: "FinishConfig(Config)",
}
DETAIL_OUT = {  # serverbound
    0x00: "Handshake/LoginStart/TelConfirm", 0x02: "Brand(Config)", 0x03: "LoginAck/FinishCfg",
    0x15: "PluginMsgOut", 0x0C: "ClientTickEnd", 0x2A: "PlayerInput", 0x1B: "KeepAliveOut",
    0x1D: "Pos", 0x1E: "PosRot", 0x1F: "Rot", 0x20: "OnGround", 0x2B: "PlayerLoaded",
    0x0A: "ChunkBatchReceived", 0x2C: "Pong", 0x08: "ChatOut",
}
# packets hơi thô - chỉ cộng counter
NOISY = {("s", 0x2C), ("s", 0x01), ("s", 0x02), ("s", 0x03), ("s", 0x04), ("s", 0x05)}
NOISY_C = {("c", 0x0C), ("c", 0x2A)}

def analyze(sid, pb, direction, pid, payload, comp, idx):
    pre = "C->S" if direction == "c" else "S->C"
    phase = pb["name"]
    table = DETAIL_IN if direction == "s" else DETAIL_OUT
    name = table.get(pid)

    # phase transitions
    if direction == "s":
        if pid == 0x03 and phase == "login" and len(payload) <= 8:
            pb["comp"] = True
        elif pid == 0x02 and phase == "login":
            pb["name"] = "config"
        elif pid == 0x03 and phase == "config" and len(payload) == 0:
            pb["name"] = "play"
    else:
        if pid == 0x03 and phase == "login" and len(payload) == 0:
            pb["name"] = "config"

    note = ""
    if name:
        if pid in (0x15, 0x18):
            try:
                ln, i = vi(payload)
                chan = payload[i:i+ln].decode("utf-8", "replace")
                note = f"chan={chan!r} data={payload[i+ln:i+ln+80]!r}"
            except Exception:
                note = f"data={payload[:80]!r}"
        elif pid == 0x20:
            note = f"*** {readable(payload, 350)}"
        elif pid == 0x77:
            note = f"txt={readable(payload, 260)}"
        elif pid == 0x00 and direction == "c" and phase == "login":
            try:
                ln, i = vi(payload)
                note = f"LoginStart name={payload[i:i+ln].decode('utf-8','replace')!r}"
            except Exception:
                note = f"data={payload[:40]!r}"
        elif pid == 0x02 and direction == "c" and phase == "config":
            try:
                ln, i = vi(payload)
                chan = payload[i:i+ln].decode("utf-8", "replace")
                note = f"chan={chan!r} data={payload[i+ln:i+ln+60]!r}"
            except Exception:
                pass
        log(f"{sid} {phase} {pre} #{idx} id=0x{pid:02X} len={len(payload)} [{name}] {note}")
    else:
        key = (direction, pid)
        if (key not in NOISY and key not in NOISY_C) or idx <= 20:
            log(f"{sid} {phase} {pre} #{idx} id=0x{pid:02X} len={len(payload)}")

def pump(sid, src, dst, direction, rawf, sp, pb):
    idx = 0
    try:
        while True:
            data = src.recv(65536)
            if not data:
                log(f"{sid} {'client' if direction=='c' else 'server'} stream đóng")
                break
            rawf.write(data); rawf.flush()

            to_send = data
            if direction == "c" and idx == 0:
                # frame đầu là handshake: parse + rewrite
                tmp = Splitter()
                frames = tmp.feed(data)
                if frames:
                    body = frames[0]
                    newframe, info = handshake_rewrite(body)
                    if newframe:
                        prefix_len = len(enc_varint(len(body))) + len(body)
                        to_send = newframe + data[prefix_len:]
                        log(f"{sid} ## rewrite handshake {info[0]!r}:{info[1]} -> kingmc.vn:25565")

            frames = sp.feed(to_send)
            for body in frames:
                payload = body
                comp = False
                if pb["comp"]:
                    try:
                        dl, i = vi(body)
                        if dl != 0:
                            comp = True
                            payload = zlib.decompress(body[i:])
                        else:
                            payload = body[i:]
                    except Exception:
                        pass
                try:
                    pid, i = vi(payload)
                    analyze(sid, pb, direction, pid, payload[i:], comp, idx)
                except Exception:
                    log(f"{sid} parse lỗi payload len={len(payload)}")
                idx += 1
            dst.sendall(to_send)
    except Exception as e:
        log(f"{sid} {'client' if direction=='c' else 'server'} stream lỗi: {e!r}")
    try:
        rawf.close()
    except Exception:
        pass

def handshake_rewrite(body):
    """body = packet body ĐÃ gồm packet-id varint ở đầu"""
    try:
        pid, i = vi(body)
        if pid != 0:
            return None, ("không phải handshake", 0, -1)
        ver, k = vi(body, i)
        hostn, j = vi(body, k)
        host = body[j:j+hostn]
        port = struct.unpack(">H", body[j+hostn:j+hostn+2])[0]
        nxt, _ = vi(body, j+hostn+2)
        if nxt in (1, 2) and host != b"kingmc.vn":
            new_body = enc_varint(0) + enc_varint(ver) + enc_varint(len("kingmc.vn")) + b"kingmc.vn" + struct.pack(">H", 25565) + enc_varint(nxt)
            newframe = enc_varint(len(new_body)) + new_body
            return newframe, (host.decode("utf-8","replace"), port, nxt)
        return None, (host.decode("utf-8","replace"), port, nxt)
    except Exception:
        return None, ("?", 0, -1)

def handle(client, addr):
    ident = f"conn{next(conn_counter)}"
    log(f"{ident} client connect từ {addr[0]}:{addr[1]}")
    try:
        target = socket.create_connection((TARGET_HOST, TARGET_PORT), 10)
    except Exception as e:
        log(f"{ident} không kết nối được server đích: {e!r}")
        client.close()
        return
    target.settimeout(None)
    client.settimeout(None)
    sp_c = Splitter(); sp_s = Splitter()
    pb_c = {"name": "login", "comp": False}
    pb_s = {"name": "login", "comp": False}
    craw = open(os.path.join(OUT_DIR, f"{ident}_client.bin"), "wb")
    sraw = open(os.path.join(OUT_DIR, f"{ident}_server.bin"), "wb")
    tc = threading.Thread(target=pump, args=(ident, client, target, "c", craw, sp_c, pb_c), daemon=True)
    ts = threading.Thread(target=pump, args=(ident, target, client, "s", sraw, sp_s, pb_s), daemon=True)
    tc.start(); ts.start()
    tc.join(); ts.join()
    log(f"{ident} kết thúc")
    try: client.close()
    except Exception: pass
    try: target.close()
    except Exception: pass

def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", LISTEN_PORT))
    srv.listen(8)
    log("=== PROXY v3 LISTEN 127.0.0.1:25570 ===")
    while True:
        cli, addr = srv.accept()
        threading.Thread(target=handle, args=(cli, addr), daemon=True).start()

if __name__ == "__main__":
    main()
