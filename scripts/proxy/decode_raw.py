#!/usr/bin/env python3
# Parse raw stream file (wire bytes) -> frames -> decode
import zlib, sys, re

def vi(data, i=0):
    n = 0; sh = 0
    while True:
        x = data[i]; i += 1
        n |= (x & 0x7F) << sh
        if not x & 0x80:
            return n, i
        sh += 7
        if sh > 35:
            raise ValueError("varint quá dài")

def main(path, label):
    data = open(path, "rb").read()
    print(f"=== {label}: {len(data)} bytes ===")
    i = 0; idx = 0; comp = False
    problems = 0
    while i < len(data):
        try:
            ln, ni = vi(data, i)
        except Exception as e:
            print(f"#{idx} LỖI varint tại offset {i}: {e}; còn {len(data)-i} bytes: {data[i:i+24].hex()}")
            break
        body_start = ni; body_end = ni + ln
        if body_end > len(data):
            print(f"#{idx} frame thiếu (cần {ln}, có {len(data)-ni}) — stream KẾT THÚC GIỮA FRAME tại {i}; hex đầu: {data[i:i+24].hex()}")
            break
        body = data[body_start:body_end]
        payload = body; comp_flag = False
        if comp:
            try:
                dl, j = vi(body)
                if dl != 0:
                    payload = zlib.decompress(body[j:])
                    comp_flag = True
                else:
                    payload = body[j:]
            except Exception as e:
                problems += 1
                print(f"#{idx} *** ZLIB LỖI tại offset {i} frameLen={ln} dl-bad hex={body[:24].hex()}: {e}")
                # thử coi như không compressed
                payload = body
        try:
            pid, k = vi(payload)
            rest = payload[k:]
        except Exception:
            pid = -1; rest = payload
        txt = re.sub(rb'[^\x20-\x7e]', b'.', rest[:48]).decode()
        print(f"#{idx} off={i} frameLen={ln} comp={comp_flag} pid=0x{pid:02X} payLen={len(payload)} {txt}")
        if comp and not comp_flag and pid == 0x03 and ln <= 3:
            comp = True
            print(f"      ^^ SetCompression -> bật comp (từ frame sau)")
        i = body_end; idx += 1
    print(f"tổng {idx} frames, {problems} lỗi zlib")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "?")
