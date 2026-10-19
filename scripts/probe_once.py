import socket, struct, re, sys, time

HOST, PORT = "java.kingmc.vn", 25565

def vi(n):
    o = b""
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            o += bytes([b | 0x80])
        else:
            return o + bytes([b])

def mcs(s):
    b = s.encode()
    return vi(len(b)) + b

def status_probe():
    t0 = time.time()
    try:
        s = socket.create_connection((HOST, PORT), 6)
        s.settimeout(6)
        hs = vi(774) + mcs("kingmc.vn") + struct.pack(">H", PORT) + vi(1)
        s.sendall(vi(len(hs) + 1) + vi(0) + hs)
        s.sendall(vi(2) + vi(1) + b"\x00")
        data = b""
        while True:
            c = s.recv(4096)
            if not c:
                break
            data += c
            if len(data) > 20000:
                break
        s.close()
        txt = data.decode("utf-8", "ignore")
        has = '"players"' in txt or "play Online" in txt or "online" in txt
        print(f"[{time.strftime('%H:%M:%S')}] status-ping OK: {len(data)} bytes, JSON visible={has} (rtt {time.time()-t0:.2f}s)")
        print("DESCRIPTION...", m.group()[:200] if (m := re.search(r'"description".{0,200}', txt)) else "(không thấy description)")
        return "OK"
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] status-ping THẤT BẠI: {e!r}")
        return "FAIL"

if __name__ == "__main__":
    status_probe()
