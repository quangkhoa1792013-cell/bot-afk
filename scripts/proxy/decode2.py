#!/usr/bin/env python3
# Trình bóc dứt điểm stream, tự kiểm cho từng frame, ko nuốt im lặng.
import zlib, sys, re, struct

def rvi(b, i=0):
    n = 0; sh = 0
    while True:
        x = b[i]; i += 1
        n |= (x & 0x7F) << sh
        if not x & 0x80: return n, i
        sh += 7
        if sh > 35: raise ValueError("varint dài")

def evi(n):
    o = bytearray()
    while True:
        x = n & 0x7F; n >>= 7
        if n: o.append(x | 0x80)
        else: return bytes(o)

def readable(data, limit=160):
    txt = data.decode("utf-8", "ignore")
    return re.sub(r"[^\x20-\x7E\u00C0-\u024F\u1EA0-\u1EF9]", "·", txt)[:limit]

PLUG_IDS = (0x01, 0x02, 0x15, 0x18)
def tag(state, side, pid):
    if state == "login":
        return ("Disconnect,EncryptionRequest,LoginSuccess,SetCompression,LoginPluginRequest".split(",") if side == "s"
                else "Handshake/LoginStart,EncryptionResponse,LoginPluginResponse,LoginAcknowledged".split(","))[pid] if pid < 5 else "?"
    if state == "config":
        return {0x00:"CookieRequest|ClientInformation",0x01:"S.C PluginMessage|C.S PluginMessage",0x02:"Disconnect",0x03:"LoginAck|FinishConfiguration",
                0x04:"KeepAlive|KeepAliveResp",0x05:"Ping|Pong",0x07:"RegistryData",0x09:"ResourcePackPush|ResourcePackResponse",
                0x0D:"UpdateTags|ClientSettings",0x0E:"SelectKnownPacks|KnownPacksResp",0x13:"CodeOfConduct|AcceptCodeOfConduct"}.get(pid, f"cfg0x{pid:02X}")
    return {0x00:"BundleDel|TeleportConfirm",0x01:"SpawnEntity",0x02:"EntityAnim",0x06:"BlockEntityTagQuery",0x08:"ChatMessage",
            0x0B:"ChunkBatchFinished|ChunkBatchReceived",0x0C:"ChunkBatchStarted|ClientTickEnd",0x0D:"UpdateTags|ClientSettings!",
            0x0F:"DeclareCommands|?",0x15:"?",0x18:"PluginMessage",0x20:"Disconnect",0x21:"EntityEvent",0x2B:"KeepAlive|KeepAliveResp",
            0x2C:"ChunkData|Pong",0x30:"JoinGame|?",0x3B:"Ping|?",0x46:"PlayerPositionAndLook|?",0x4C:"PlayerAbilities|PlayerAbilitiesOut",
            0x5F:"HeldItem",0x61:"?",0x69:"EntityPosDelta",0x6A:"EntityPosRotDelta",0x6B:"EntityRotDelta",0x74:"StartConfiguration|?",
            0x77:"SystemChat",0x7B:"?",0x2A:"?|PlayerInput",0x2B:"?|PlayerLoaded?",0x2E:"EntityMetadata|?",0x2F:"?|SetHeldItem?",
            0x08:"ChatMessage",0x08:"?",0x0A:"Statistics|?",0x1E:"?",0x22:"",0x3C:"Animation|Animation/Swing",
            0x46:"PlayerPositionAndLook",0x1D:"?|PlayerPosition",0x1E:"?|PlayerPosRot",0x1F:"?|PlayerRotation",0x20:"?|PlayerMovement",
            0x21:"?|PlayerAction",0x26:"?|PlayerAbilities",0x27:"?|PlayerHeldItemUpdate?"}.get(pid, f"play0x{pid:02X}")

def decode(path, side, max_frames=10000):
    side = side.lower()
    raw = open(path, "rb").read()
    end = len(raw)
    i = 0; idx = 0
    comp = False; state = "login"   # client: frame 0-1 chưa có dl-prefix, từ frame khác bắt đầu có (xem dòng idx==1)
    state = "login"
    while i < end and idx < max_frames:
        try:
            ln, hl = rvi(raw, i)
        except Exception as e:
            print(f"#{idx} !! varint length lỗi tại {i}: {e}; tail hex {raw[i:i+16].hex()}"); break
        if i + hl + ln > end:
            print(f"#{idx} (stream đang viết tiếp — frame {ln} byte chưa đầy) dừng tại {i}")
            break
        bstart = hl            # rvi trả (giá_trị, index_ngay_sau_varint) — đó chính là vị trí body
        body = raw[bstart : bstart+ln]
        i = bstart + ln
        payload = body; compf = "-c-" if False else None
        was_comp = False
        try:
            if comp:
                dl, j = rvi(body)
                if dl:
                    payload = zlib.decompress(body[j:]); was_comp = True
                else:
                    payload = body[j:]
            pid, k = rvi(payload)
            rest = payload[k:]
        except Exception as e:
            print(f"#{idx} !! lỗi content tại offset {i-1}: {e}; body hex {body[:40].hex()}")
            idx += 1
            continue
        name = tag(state, side, pid)
        extra = ""
        if pid in PLUG_IDS and ("Plugin" in name or name in ("0x01|0x02",)):
            try:
                cln, c = rvi(rest)
                chan = rest[c:c+cln].decode("utf-8", "replace")
                extra = f" chan={chan!r} data={rest[c+cln:c+cln+80]!r}"
            except Exception:
                extra = f" raw={rest[:60]!r}"
        if name.startswith("SetCompression"):
            try:
                thr, _ = rvi(rest); extra = f" threshold={thr}"
                if side == "s": comp = True
            except Exception:
                pass
        if name.startswith("LoginSuccess"):
            state = "config"
            try:
                uuid = rest[:16].hex(); nln, c = rvi(rest, 16)
                extra = f" name={rest[16+c:16+c+nln].decode('utf-8','replace')!r} uuid={uuid}"
            except Exception:
                pass
        if name in ("Disconnect",) and "LoginAck" not in name and "|FinishConfiguration" not in name:
            extra = f" ★ {readable(rest, 250)}"
        if name == "SystemChat":
            extra = f" {readable(rest, 200)}"
        if name in ("LoginAck|FinishConfiguration",):
            if state == "config": state = "play"
            elif state == "login": state = "config"
        if state == "login" and name == "LoginAck|FinishConfiguration":
            state = "config"
        print(f"#{idx} [{state}] {name} pid=0x{pid:02X} len={len(payload)}{' zlib' if was_comp else ''}{extra}")
        if side == "c" and idx == 1:
            comp = True   # client: dl-prefix từ LoginAck (frame MSB thứ 3)
        idx += 1
    print(f"— hết {idx} frames —")

if __name__ == "__main__":
    decode(sys.argv[1], sys.argv[2])
