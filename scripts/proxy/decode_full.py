#!/usr/bin/env python3
# Decode tường minh raw stream (client hoặc server) - bật comp đúng chỗ,
# gắn nhãn packet bằng palette 1.21.11 (protocol 774).
import zlib, sys, re, struct

def vi(data, i=0):
    n = 0; sh = 0
    while True:
        x = data[i]; i += 1
        n |= (x & 0x7F) << sh
        if not x & 0x80:
            return n, i
        sh += 7
        if sh > 35:
            raise ValueError("varint")

IN_LOGIN = {0x00: "Disconnect", 0x01: "EncryptionRequest", 0x02: "LoginSuccess", 0x03: "SetCompression", 0x04: "LoginPluginRequest"}
OUT_LOGIN = {0x00: "Handshake/LoginStart", 0x01: "EncryptionResponse", 0x02: "LoginPluginResponse", 0x03: "LoginAcknowledged"}

IN_CONFIG = {
    0x00: "CookieRequest", 0x01: "S->C PluginMessage", 0x02: "Disconnect", 0x03: "FinishConfiguration",
    0x04: "KeepAlive", 0x05: "Ping", 0x06: "ResetChat", 0x07: "RegistryData", 0x08: "ResourcePackPop",
    0x09: "ResourcePackPush", 0x0A: "StoreCookie", 0x0B: "Transfer", 0x0C: "UpdateFeatures",
    0x0D: "UpdateTags", 0x0E: "SelectKnownPacks", 0x0F: "CustomReportDetails", 0x10: "ServerLinks",
    0x11: "ClearDialog", 0x12: "DeclareCodeOfConduct", 0x13: "CodeOfConduct",
}
OUT_CONFIG = {
    0x00: "ClientInformation", 0x01: "CookieResponse", 0x02: "PluginMessage", 0x03: "FinishConfiguration",
    0x04: "KeepAliveResp", 0x05: "Pong", 0x06: "ResourcePackResponse", 0x07: "KnownPacksResp",
    0x08: "CustomClickAction", 0x09: "AcceptCodeOfConduct",
}
IN_PLAY = {
    0x00: "BundleDelimiter", 0x01: "SpawnEntity", 0x02: "EntityAnimation", 0x03: "Statistics",
    0x04: "BlockChangedAck", 0x05: "BlockBreakAnim", 0x06: "BlockEntityData", 0x08: "BlockChange",
    0x09: "BossBar", 0x0A: "ServerDifficulty", 0x0B: "ChunkBatchFinished", 0x0C: "ChunkBatchStarted",
    0x18: "PluginMessage", 0x1A: "EntityEffect", 0x1E: "AddPlayerInfo?", 0x20: "Disconnect",
    0x21: "EntityEvent", 0x2B: "KeepAlive", 0x2C: "ChunkData", 0x2D: "RoomPing?", 0x2E: "EntityMetadata",
    0x30: "JoinGame", 0x3B: "Ping", 0x46: "PlayerPositionAndLook", 0x4C: "PlayerAbilities",
    0x55: "ActionBar?", 0x5F: "HeldItem?", 0x61: "UpdateEntityPosition?", 0x6E: "Subtitle?",
    0x70: "TitleText?", 0x74: "StartConfiguration", 0x77: "SystemChat", 0x7B: "EntityMotion?",
    0x7C: "EntityDataFull?", 0x7D: "?", 0x7E: "?",
}
OUT_PLAY = {
    0x00: "TeleportConfirm", 0x06: "ChatCommand", 0x08: "ChatMessage", 0x09: "PlayerSession",
    0x0A: "ChunkBatchReceived", 0x0B: "ClientStatus", 0x0C: "ClientTickEnd", 0x0D: "ClientSettings",
    0x15: "PluginMessage", 0x1B: "KeepAliveResp", 0x1D: "PlayerPosition", 0x1E: "PlayerPosRot",
    0x1F: "PlayerRotation", 0x20: "PlayerMovement", 0x21: "PlayerStuck?", 0x22: "VehicleMove",
    0x2A: "PlayerInput", 0x2B: "PlayerLoaded", 0x2C: "Pong", 0x3C: "Animation/Swing", 0x3D: "BlockEntityQuery?",
    0x26: "PlayerAbilities", 0x27: "PlayerAction", 0x28: "EntityAction/Sneak?",
}

def readable(data, limit=160):
    txt = data.decode("utf-8", "ignore")
    txt = re.sub(r"[^\x20-\x7E\u00C0-\u024F\u1EA0-\u1EF9]", "·", txt)
    return re.sub(r"\s+", " ", txt).strip()[:limit]

def main(path, side):
    side = side.lower()
    fin = IN_LOGIN if side == "s" else OUT_LOGIN
    fconf = IN_CONFIG if side == "s" else OUT_CONFIG
    fplay = IN_PLAY if side == "s" else OUT_PLAY
    data = open(path, "rb").read()
    print(f"=== {path} ({side.upper()}, {len(data)} bytes) ===")
    i = 0; idx = 0
    # stream C->S: sau khi client nhận SetCompression (song song), mọi frame C->S có dl-prefix.
    # stream S->C: comp on sau frame SetCompression (logic dưới).
    comp = False; state = "login"
    while i < len(data):
        start = i
        try:
            ln, hl = vi(data, i)
        except Exception:
            print(f"#{idx} decode hết an toàn tại {i} (biến đoạn frame chưa đủ)")
            break
        if hl + ln > len(data) - i:
            print(f"#{idx} (cuối) frame len={ln} chưa đủ — stream cắt giữa chừng, dừng ở {idx} frame")
            break
        body = data[i+hl:i+hl+ln]
        i += hl + ln
        payload = body; compf = False
        if comp:
            try:
                dl, j = vi(body)
                if dl:
                    payload = zlib.decompress(body[j:]); compf = True
                else:
                    payload = body[j:]
            except Exception:
                payload = body
        try:
            pid, k = vi(payload)
            rest = payload[k:]
        except Exception:
            idx += 1; continue
        tbl = fin if state == "login" else (fconf if state == "config" else fplay)
        name = tbl.get(pid, "?")
        extra = ""
        if pid in (0x01, 0x02, 0x15, 0x18) and name and ("Plugin" in name or "Brand" in name):
            try:
                cln, c = vi(rest)
                chan = rest[c:c+cln].decode("utf-8", "replace")
                extra = f" chan={chan!r} data={rest[c+cln:c+cln+70]!r}"
            except Exception:
                pass
        if name == "LoginSuccess" and state == "login":
            try:
                nln, c = vi(rest[16:])
                extra = f" name={rest[16+c:16+c+nln].decode('utf-8','replace')!r}"
            except Exception:
                pass
        if name == "SetCompression":
            try:
                thr, _ = vi(rest); extra = f" threshold={thr}"
                comp = True
            except Exception:
                pass
        if name == "Disconnect":
            extra = f" {readable(rest, 220)}"
        if side == "c" and idx == 2:
            comp = True   # phía client: dl-prefix từ frame thứ 3 trở đi (after LoginStart)
        if name == "SystemChat":
            extra = f" {readable(rest, 160)}"
        if name == "FinishConfiguration":
            if state == "login": state = "config"
            elif state == "config": state = "play"
        if name == "LoginSuccess":
            state = "config"
        if compf or name not in ("ClientTickEnd", "PlayerInput", "KeepAliveResp", "PlayerMovement", "PlayerPosRot", "PlayerRotation", "PingResp?") or idx < 40:
            if not (name in ("PlayerMovement", "PlayerPosRot", "PlayerRotation", "ClientTickEnd", "PlayerInput") and idx > 40):
                print(f"#{idx} [{state}] {name} pid=0x{pid:02X} len={len(payload)}{extra}")
        idx += 1
    print(f"({idx} frame)")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
