
import os
import json

SERVER = "aquamc.vn"
SCRIPTS_DIR = "scripts"
BOTS_DIR = "bots"

# 1. Tạo thư mục scripts/ và bots/ nếu chưa có
os.makedirs(SCRIPTS_DIR, exist_ok=True)
os.makedirs(BOTS_DIR, exist_ok=True)

# 2. Định nghĩa nội dung các file .txt (script login MCC)
txt_files = {
    "login_khoablabla.txt": """wait 9000
send /login khoalaptrinh
wait 2000
send /server smp""",
    "login_ikujtyhfg.txt": """wait 9000
send /login khoablabla
wait 2000
send /server smp""",
    "login_afk.txt": """wait 9000
send /login khoablabla
wait 2000
send /server smp
wait 3000
send /warp afk"""
}

# Tạo các file .txt trong thư mục scripts/
print("Đang tạo các file script trong thư mục scripts/...")
for filename, content in txt_files.items():
    filepath = os.path.join(SCRIPTS_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")
    print(f"-> Đã tạo: {filepath}")

# 3. Danh sách bots (mỗi bot 1 thư mục riêng trong bots/)
accounts = [
    {"name": "khoablabla", "username": "khoablabla", "script": "login_khoablabla.txt"},
    {"name": "ikujtyhfg",  "username": "ikujtyhfg",  "script": "login_ikujtyhfg.txt"},
    {"name": "geasf",      "username": "geasf",      "script": "login_afk.txt"},
    {"name": "djaiwp",     "username": "djaiwp",     "script": "login_afk.txt"},
    {"name": "hdoiwa",     "username": "hdoiwa",     "script": "login_afk.txt"},
    {"name": "dnwauif",    "username": "dnwauif",    "script": "login_afk.txt"},
    {"name": "dhwaod",     "username": "dhwaod",     "script": "login_afk.txt"},
]

# Dọn dẹp file cũ thừa ở ngoài
os.system("rm -f run_*.sh script_*.txt login_*.txt")

print("\nĐang tạo cấu trúc bots/<tên_bot>/ ...")
for acc in accounts:
    name = acc["name"]
    bot_dir = os.path.join(BOTS_DIR, name)
    os.makedirs(bot_dir, exist_ok=True)

    # bot.json metadata (web UI đọc cái này)
    bot_json = {
        "id": name,
        "name": name,
        "username": acc["username"],
        "password": "-",
        "accountType": "mojang",
        "serverHost": SERVER,
        "serverPort": 25565,
        "minecraftVersion": "auto",
        "script": acc["script"],
    }
    with open(os.path.join(bot_dir, "bot.json"), "w", encoding="utf-8") as f:
        json.dump(bot_json, f, indent=2, ensure_ascii=False)

    # run.sh - chạy MMC trực tiếp kèm script login
    sh_content = f"""#!/bin/bash
# Bot: {name} ({acc['username']} @ {SERVER}:25565)
# Script login: scripts/{acc['script']}
cd "$(dirname "$0")/../.."
./MinecraftClient "{os.path.join(bot_dir, 'bot.ini')}" script="{os.path.join(SCRIPTS_DIR, acc['script'])}"
"""
    sh_filename = os.path.join(bot_dir, "run.sh")
    with open(sh_filename, "w", encoding="utf-8") as f:
        f.write(sh_content)
    try:
        os.chmod(sh_filename, 0o755)
    except Exception:
        pass

    print(f"-> Đã tạo: {bot_dir}/ (bot.json + run.sh)")

print("\nHoàn tất! Các bot nằm gọn trong bots/<tên_bot>/, scripts trong scripts/.")
print("Mở web UI: tạo bot trong GUI sẽ tự tạo đủ các file. Script này tạo sẵn để khởi tạo nhanh.")
