import socket, struct, zlib, time, uuid, sys, re, random

HOST = "java.kingmc.vn"
PORT = 25565
PROTO = 774
USER = "geasf"
RUN_SECONDS = 50

# ---- paket helpers ----
def vi(n):
    out = b""
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out += bytes([b | 0x80])
        else:
            out += bytes([b])
            return out

def rvi_sock(s):
    n = 0; sh = 0
    while True:
        c = s.recv(1)
        if not c:
            return None
        b = c[0]
        n |= (b & 0x7F) << sh
        if not b & 0x80:
            return n
        sh += 7

def rvi_buf(b, i):
    n = 0; sh = 0
    while True:
        x = b[i]; i += 1
        n |= (x & 0x7F) << sh
        if not x & 0x80:
            return n, i
        sh += 7

def mcstr(s):
    b = s.encode("utf-8")
    return vi(len(b)) + b

class Raw:
    def __init__(self, log_path):
        self.comp = False
        self.log_path = log_path
        self.t_start = time.time()
        self.state = "login"
        self.joined = False

    def t(self):
        return f"{time.time()-self.t_start:6.2f}s"

    def log(self, msg):
        line = f"[{time.strftime('%H:%M:%S')} {self.t()}] {msg}"
        print(line, flush=True)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    def frame(self, pid, data, comp=None):
        body = vi(pid) + data
        if (self.comp if comp is None else comp):
            body = vi(0) + body
        return vi(len(body)) + body

    def send(self, pid, data=b""):
        self.s.sendall(self.frame(pid, data))
        self.log(f" -> {self.state} id=0x{pid:02X} len={len(data)}")

    def read_packet(self):
        ln = rvi_sock(self.s)
        if ln is None:
            return None
        buf = b""
        while len(buf) < ln:
            c = self.s.recv(ln - len(buf))
            if not c:
                return "closed"
            buf += c
        if self.comp:
            dl, i = rvi_buf(buf, 0)
            buf = zlib.decompress(buf[i:]) if dl != 0 else buf[i:]
        pid, i = rvi_buf(buf, 0)
        return pid, buf[i:]

    def readable(self, data, limit=200):
        txt = data.decode("utf-8", "ignore")
        txt = re.sub(r"[^\x20-\x7E\u00C0-\u024F\u1EA0-\u1EF9]", " ", txt)
        txt = re.sub(r"\s+", " ", txt).strip()
        return txt[:limit]

def main():
    log_path = "/home/khoablabla/geasf/scripts/raw_join_test.log"
    open(log_path, "w").close()
    c = Raw(log_path)
    c.s = socket.create_connection((HOST, PORT), 10)
    c.s.settimeout(0.02)

    hs = vi(PROTO) + mcstr("kingmc.vn") + struct.pack(">H", PORT) + vi(2)
    c.send(0x00, hs)
    c.send(0x00, mcstr(USER) + uuid.uuid4().bytes)

    deadline = time.time() + RUN_SECONDS
    ci = mcstr("en_US") + bytes([8, 0, 1, 0x41, 0, 0, 1, 0])
    sent_config_brand = False
    sent_play_brand = False
    nxt_tick = time.time()

    while time.time() < deadline:
        # ---- tick cadence: every 50 ms in play state ----
        now = time.time()
        while now >= nxt_tick:
            nxt_tick += 0.05
            if c.state == "config" and sent_config_brand is False:
                pass
            if c.state == "play":
                try:
                    if not sent_play_brand:
                        c.s.sendall(c.frame(0x15, mcstr("minecraft:brand") + mcstr("vanilla")))
                        c.log(" -> play id=0x15 PluginMessage brand 'vanilla'")
                        sent_play_brand = True
                    c.s.sendall(c.frame(0x2A, b"\x00"))   # Player Input flags=0
                    c.s.sendall(c.frame(0x0C, b""))       # Client Tick End
                except Exception as e:
                    c.log(f"tick send error: {e!r}")
                    break

        try:
            p = c.read_packet()
        except socket.timeout:
            continue
        except Exception as e:
            c.log(f"read error: {e!r}")
            break
        if p is None:
            c.log("connection closed")
            break
        if p == "closed":
            c.log(f"connection closed (state={c.state}, joined={c.joined})")
            break
        pid, data = p
        if c.state == "login":
            if pid == 0x03:
                thr, _ = rvi_buf(data, 0)
                c.comp = True
                c.log(f" <- login 0x03 SetCompression thr={thr}")
            elif pid == 0x02:
                c.log(" <- login 0x02 LoginSuccess")
                c.state = "config"
                c.send(0x03, b"")                                       # LoginAcknowledged
                c.send(0x00, ci)                                        # ClientInformation
                c.s.sendall(c.frame(0x02, mcstr("minecraft:brand") + mcstr("vanilla")))
                c.log(" -> config id=0x02 PluginMessage brand 'vanilla'")
                sent_config_brand = True
            elif pid == 0x00:
                c.log(f" <- login 0x00 Disconnect: {c.readable(data, 400)}")
                break
            else:
                c.log(f" <- login 0x{pid:02X} len={len(data)}")
        elif c.state == "config":
            if pid == 0x03:
                c.log(" <- config 0x03 FinishConfiguration -> confirm")
                c.send(0x03, b"")
                c.state = "play"
                c.joined = True
                c.log(" >>> PLAY <<<")
            elif pid == 0x02:
                c.log(f" <- config 0x02 Disconnect: {c.readable(data, 400)}")
                break
            elif pid == 0x04:
                c.send(0x04, data)
            elif pid == 0x05:
                c.log(f" <- config 0x05 Ping len={len(data)}")
                c.send(0x05, data)
            elif pid == 0x0E:
                c.log(f" <- config 0x0E KnownDataPacks len={len(data)} -> reply empty list")
                c.send(0x07, vi(0))
            elif pid == 0x13:
                c.log(" <- config 0x13 CodeOfConduct -> accept")
                c.send(0x09, b"")
            elif pid == 0x09:
                c.log(f" <- config 0x09 ResourcePack len={len(data)} -> accept")
                c.send(0x06, vi(3))  # 3 = accepted
            elif pid == 0x01:
                chan_len, i = rvi_buf(data, 0)
                chan = data[i:i+chan_len].decode("utf-8", "replace")
                c.log(f" <- config 0x01 PluginMessage chan={chan!r} data={data[i+chan_len:i+chan_len+80]!r}")
            else:
                c.log(f" <- config 0x{pid:02X} len={len(data)} txt={c.readable(data, 120)}")
        elif c.state == "play":
            try:
                if pid == 0x30:
                    c.log(f" <- play 0x30 JoinGame len={len(data)}")
                elif pid == 0x46:  # Player Position (teleport)
                    x, y, z = struct.unpack(">ddd", data[0:24])
                    yaw, pitch = struct.unpack(">ff", data[24:32])
                    flags = data[32]
                    tpid, _ = rvi_buf(data, 33)
                    c.log(f" <- play 0x46 PlayerPosition y={y:.2f} flags={flags} tpid={tpid} -> confirm")
                    c.send(0x00, vi(tpid))                          # TeleportConfirm
                    pos = struct.pack(">dddff", x, y, z, yaw, pitch) + bytes([flags])
                    c.send(0x1E, pos)                               # PlayerPositionAndRotation
                elif pid == 0x2B:
                    c.send(0x1B, data)                              # KeepAlive reply
                    c.log(f" <- play 0x2B KeepAlive len={len(data)} -> ok")
                elif pid == 0x3B:
                    c.send(0x2C, data)                              # Pong
                    c.log(f" <- play 0x3B Ping len={len(data)} -> pong")
                elif pid == 0x18:
                    ln, i = rvi_buf(data, 0)
                    chan = data[i:i+ln].decode("utf-8", "replace")
                    payload = data[i+ln:]
                    c.log(f" <- play 0x18 PluginMessage chan={chan!r} len={len(payload)} payload={payload[:120]!r}")
                elif pid == 0x77:
                    c.log(f" <- play 0x77 SystemChat len={len(data)} txt={c.readable(data, 300)}")
                elif pid == 0x55:
                    c.log(f" <- play 0x55 ActionBar txt={c.readable(data, 300)}")
                elif pid == 0x6E:
                    c.log(f" <- play 0x6E SubTitle txt={c.readable(data, 300)}")
                elif pid == 0x70:
                    c.log(f" <- play 0x70 TitleText txt={c.readable(data, 300)}")
                elif pid == 0x09:
                    c.log(f" <- play 0x09 BossBar len={len(data)}")
                elif pid == 0x20:
                    c.log(f" <<< DISCONNECT >>> {c.readable(data, 400)}")
                    break
                elif pid == 0x0B:
                    c.send(0x0A, struct.pack(">f", 1.0))            # ChunkBatchReceived
                    c.log(" <- play 0x0B ChunkBatchFinished -> sent ChunkBatchReceived")
                    c.send(0x2B if False else 0x2B, b"")
                    c.log(" -> play id=0x2B PlayerLoaded")
                elif pid == 0x0C:
                    pass   # ChunkBatchStarted, silent
                elif pid == 0x2C:
                    pass   # Pong quirk, silent
                elif pid == 0x0F:
                    c.log(f" <- play 0x0F TabComplete len={len(data)}")
                elif pid == 0x8A:
                    c.log(f" <- play 0x8A ShowDialog len={len(data)} txt={c.readable(data,200)}")
                elif pid in (0x2C,):
                    c.log(f" <- play 0x{pid:02X} len={len(data)}")
                else:
                    c.log(f" <- play 0x{pid:02X} len={len(data)} txt={c.readable(data, 100)}")
            except Exception as e:
                c.log(f"play handler error pid=0x{pid:02X}: {e!r}")
                break

    try:
        c.s.close()
    except Exception:
        pass
    c.log("=== test kết thúc ===")

if __name__ == "__main__":
    main()
