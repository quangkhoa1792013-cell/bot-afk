import os, socket, struct, zlib, time, uuid, sys, re, math, random

HOST = os.environ.get("RAW_HOST", "java.kingmc.vn")
PORT = int(os.environ.get("RAW_PORT", "25565"))
PROTO = 774
USER = "geasf"

BRAND = sys.argv[3] if len(sys.argv) > 3 else "vanilla"
PL_DELAY = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
BATCH_VAL = float(sys.argv[5]) if len(sys.argv) > 5 else 8.0
BATCH_DELAY = float(sys.argv[6]) if len(sys.argv) > 6 else 0.6
HOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 25.0
MAX_ATTEMPTS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
USE_HUMAN = True

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

def readable(data, limit=300):
    txt = data.decode("utf-8", "ignore")
    txt = re.sub(r"[^\x20-\x7E\u00C0-\u024F\u1EA0-\u1EF9]", " ", txt)
    return re.sub(r"\s+", " ", txt).strip()[:limit]

class Session:
    def __init__(self, tag):
        self.tag = tag
        self.log_path = "/home/khoablabla/geasf/scripts/raw_join_test2.log"
        self.t0 = time.time()
        self.state = "login"
        self.comp = False
        self.outcome = "unknown"
        self.stopped = False
        # human sim state
        self.x = 0.0; self.y = 0.0; self.z = 0.0
        self.yaw = 0.0; self.pitch = 0.0
        self.on_ground = 1
        self.walking = False
        self.walk_start = 0.0
        self.pl_at = None       # thời điểm gửi PlayerLoaded
        self.batch_at = None    # thời điểm nhận ChunkBatchFinished
        self.pl_sent = False
        self.batch_tag = None
        self.sbuf = bytearray()   # buffer nhận bền vững
        self.next_move = time.time() + 0.5

    def t(self):
        return f"{time.time()-self.t0:6.2f}s"

    def log(self, msg):
        line = f"[{self.tag} {time.strftime('%H:%M:%S')} {self.t()}] {msg}"
        print(line, flush=True)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    def frame(self, pid, data):
        body = vi(pid) + data
        if self.comp:
            body = vi(0) + body
        return vi(len(body)) + body

    def send(self, pid, data=b""):
        self.s.sendall(self.frame(pid, data))

    def send_log(self, pid, data=b"", label=""):
        self.send(pid, data)
        self.log(f" -> {self.state} id=0x{pid:02X} len={len(data)} {label}")

    def read_packet(self):
        # nhận đủ 5 byte đầu để đọc varint length (timeout-safe qua buffer)
        while len(self.sbuf) < 5:
            c = self.s.recv(65536)
            if not c:
                return "closed"
            self.sbuf.extend(c)
        try:
            ln, hl = rvi_buf(bytes(self.sbuf[:5]), 0)
        except Exception:
            return "closed"
        while len(self.sbuf) < hl + ln:
            c = self.s.recv(65536)
            if not c:
                return "closed"
            self.sbuf.extend(c)
        body = bytes(self.sbuf[hl:hl+ln])
        del self.sbuf[:hl+ln]
        payload = body
        if self.comp:
            dl, i = rvi_buf(body, 0)
            payload = zlib.decompress(body[i:]) if dl != 0 else body[i:]
        pid, i = rvi_buf(payload, 0)
        return pid, payload[i:]

    # ---- human movement ----
    def human_step(self, now):
        """Gọi mỗi 50ms ở state play; gửi PlayerInput + ClientTickEnd + rotation/pos như người chơi."""
        self.send(0x2A, bytes([0x01 if self.walking else 0x00]))
        self.send(0x0C, b"")
        self.log(f"tick input={self.walking}")

        if now >= self.next_move:
            dt = now - (self.next_move - 0.25) if self.next_move > 0.25 else 0.25
            self.next_move = now + random.uniform(0.20, 0.35)

            # bật/tắt đi bộ: đi 4-8 giây, đứng 1-2 giây
            if not self.walking and (now - self.walk_start) > random.uniform(1.0, 2.2):
                self.walking = True
                self.walk_start = now
                self.log("human: bắt đầu đi bộ")
            elif self.walking and (now - self.walk_start) > random.uniform(4.0, 8.0):
                self.walking = False
                self.walk_start = now
                self.log("human: đứng lại")

            # quay máy nhẹ: yaw ±(1-6°), pitch tí
            self.yaw = (self.yaw + random.uniform(-6.0, 6.0)) % 360.0
            self.pitch = max(-80.0, min(80.0, self.pitch + random.uniform(-2.0, 2.0)))

            if self.walking:
                step = 0.06 * random.uniform(0.9, 1.1)   # ~1.2 block/s
                self.x += step * math.cos(math.radians(self.yaw))
                self.z += step * math.sin(math.radians(self.yaw))
                self.send(0x1E, struct.pack(">dddff", self.x, self.y, self.z, self.yaw, self.pitch) + bytes([self.on_ground]))
                self.log(f"human: pos x={self.x:.2f} z={self.z:.2f} yaw={self.yaw:.1f} pitch={self.pitch:.1f}")
            else:
                self.send(0x1F, struct.pack(">ff", self.yaw, self.pitch) + bytes([self.on_ground]))

    def run(self):
        self.s = socket.create_connection((HOST, PORT), 10)
        self.s.settimeout(0.02)
        hs = vi(PROTO) + mcstr("kingmc.vn") + struct.pack(">H", PORT) + vi(2)
        self.send(0x00, hs)
        self.send(0x00, mcstr(USER) + uuid.uuid4().bytes)

        ci = mcstr("en_US") + bytes([8, 0, 1, 0x41, 0, 0, 1, 0])
        nxt_tick = time.time()
        deadline = time.time() + HOLD

        while time.time() < deadline and not self.stopped:
            now = time.time()
            if self.state == "play" and USE_HUMAN:
                while now >= nxt_tick:
                    nxt_tick += 0.05
                    try:
                        if self.batch_at is not None and now >= self.batch_at + BATCH_DELAY and self.batch_tag is None:
                            self.batch_tag = "sent"
                            self.send(0x0A, struct.pack(">f", BATCH_VAL))
                            self.log(f"ChunkBatchReceived({BATCH_VAL}) sau delay {BATCH_DELAY}s")
                        if self.pl_at is not None and now >= self.pl_at and not self.pl_sent:
                            self.pl_sent = True
                            self.send(0x2B, b"")
                            self.log(f">> gửi PlayerLoaded sau delay {PL_DELAY}s")
                        self.human_step(now)
                    except Exception as e:
                        self.log(f"tick error: {e!r}")
                        self.stopped = True
                        break
            try:
                p = self.read_packet()
            except socket.timeout:
                continue
            except Exception as e:
                import traceback; self.log(f"read error: {e!r}\n{traceback.format_exc()}")
                self.outcome = "closed"
                break
            if p is None or p == "closed":
                self.log(f"kết nối đóng (state={self.state})")
                self.outcome = "closed"
                break
            pid, data = p

            if self.state == "login":
                if pid == 0x03:
                    self.comp = True
                    self.log(f"SetCompression thr={vi(0) or ''} ({data[:1]!r})")
                elif pid == 0x02:
                    self.log("LoginSuccess")
                    self.state = "config"
                    self.send(0x03, b"")
                    self.send(0x00, ci)
                    self.send(0x02, mcstr("minecraft:brand") + mcstr(BRAND))
                    self.log("config: sent LoginAck + ClientInformation + brand")
                elif pid == 0x00:
                    msg = readable(data, 400)
                    self.log(f"LOGIN DISCONNECT: {msg}")
                    self.outcome = "blocked7" if "chặn" in msg or "Xac minh" in msg or "thử lại" in msg else "login-kick"
                    break
                else:
                    self.log(f"login 0x{pid:02X} len={len(data)}")

            elif self.state == "config":
                try:
                    if pid == 0x03:
                        self.send(0x03, b"")
                        self.state = "play"
                        self.log(">>> PLAY <<<")
                    elif pid == 0x02:
                        msg = readable(data, 400)
                        self.log(f"CONFIG DISCONNECT: {msg}")
                        self.outcome = "anti-ok" if ("xác minh thành công" in msg.lower()) else "anti-fail"
                        break
                    elif pid == 0x04:
                        self.send(0x04, data)
                    elif pid == 0x0E:
                        self.log("KnownDataPacks -> empty list")
                        self.send(0x07, vi(0))
                    elif pid == 0x13:
                        self.send(0x09, b"")
                        self.log("CodeOfConduct -> accept")
                    elif pid == 0x01:
                        if len(data) >= 2:
                            l, i = rvi_buf(data, 0)
                            self.log(f"config PluginMessage chan={data[i:i+l].decode('utf-8','replace')!r} data={data[i+l:i+l+60]!r}")
                        else:
                            self.log(f"config 0x01 len={len(data)} (rỗng?)")
                    elif pid == 0x07:
                        pass   # Registry Data
                    else:
                        self.log(f"config 0x{pid:02X} len={len(data)} txt={readable(data,100)}")
                except IndexError:
                    self.log(f"config 0x{pid:02X} len={len(data)}: parse skip (IndexError)")

            elif self.state == "play":
                if pid == 0x30:
                    self.log(f"JoinGame len={len(data)}")
                elif pid == 0x46:
                    self.x, self.y, self.z = struct.unpack(">ddd", data[0:24])
                    self.yaw, self.pitch = struct.unpack(">ff", data[24:32])
                    flags = data[32]
                    tpid, _ = rvi_buf(data, 33)
                    self.log(f"Teleport x={self.x:.2f} y={self.y:.2f} z={self.z:.2f} yaw={self.yaw:.1f} tpid={tpid} flags={flags}")
                    self.send(0x00, vi(tpid))
                    self.send(0x1E, struct.pack(">dddff", self.x, self.y, self.z, self.yaw, self.pitch) + bytes([self.on_ground]))
                elif pid == 0x2B:
                    self.send(0x1B, data)
                    self.log("KeepAlive -> ok")
                elif pid == 0x3B:
                    self.send(0x2C, data)
                    self.log("Play Ping -> pong")
                elif pid == 0x18:
                    l, i = rvi_buf(data, 0)
                    chan = data[i:i+l].decode("utf-8", "replace")
                    payload = data[i+l:]
                    self.log(f"PluginMessage chan={chan!r} len={len(payload)} data={payload[:100]!r}")
                elif pid == 0x77:
                    self.log(f"SystemChat: {readable(data)}")
                elif pid == 0x55:
                    self.log(f"ActionBar: {readable(data)}")
                elif pid == 0x20:
                    msg = readable(data, 400)
                    self.log(f" <<< SERVER KICK >>> {msg}")
                    self.outcome = "anti-ok" if ("xác minh thành công" in msg.lower()) else "anti-fail"
                    break
                elif pid == 0x0B:
                    self.batch_at = now
                    self.log(f"ChunkBatchFinished -> hẹn ChunkBatchReceived sau {BATCH_DELAY}s, PlayerLoaded sau {PL_DELAY}s")
                elif pid == 0x74:
                    self.log("StartConfiguration (server bật lại config) — bỏ qua")
                else:
                    self.log(f"play 0x{pid:02X} len={len(data)} txt={readable(data,80)}")
        try:
            self.s.close()
        except Exception:
            pass
        self.log(f"=== Kết thúc (outcome={self.outcome}) ===")
        return self.outcome

def main():
    open("/home/khoablabla/geasf/scripts/raw_join_test2.log", "w").close()
    for attempt in range(1, MAX_ATTEMPTS + 1):
        s = Session(f"A{attempt}")
        print(f"\n########## LẦN JOIN {attempt} ##########", flush=True)
        out = s.run()
        if out == "anti-ok":
            s.log("-> 'vào lại' kích: chờ 3 giây rồi join lại нем")
            time.sleep(3)
            s2 = Session(f"B{attempt}")
            out2 = s2.run()
            if out2 == "anti-ok":
                print("-> lần join lại vẫn bị 'vào lại', thử lần nữa", flush=True)
                time.sleep(2)
                s3 = Session(f"C{attempt}")
                s3.run()
            break
        elif out == "anti-fail":
            print("-> bị từ chối vì behavior. Dừng để xem log.", flush=True)
            break
        elif out in ("blocked7",):
            print("-> server chặn tạm thời. Dừng.", flush=True)
            break
        else:
            print(f"-> kết thúc không rõ: {out}", flush=True)
            time.sleep(5)

if __name__ == "__main__":
    main()
