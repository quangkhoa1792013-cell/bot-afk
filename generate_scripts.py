import os

SERVER = "aquamc.vn"
SCRIPTS_DIR = "scripts"

# 1. Tạo thư mục scripts/ nếu chưa có
os.makedirs(SCRIPTS_DIR, exist_ok=True)

# 2. Định nghĩa nội dung 3 file .txt
txt_files = {
    "login_khoablabla.txt": """wait 9
send /login khoalaptrinh
wait 2
send /server smp""",
    "login_ikujtyhfg.txt": """wait 9
send /login khoablabla
wait 2
send /server smp""",
    "login_afk.txt": """wait 9
send /login khoablabla
wait 2
send /server smp
wait 3
send /warp afk"""
}

# Tạo 3 file .txt bên trong thư mục scripts/
print("Đang tạo 3 file .txt trong thư mục scripts/...")
for filename, content in txt_files.items():
    filepath = os.path.join(SCRIPTS_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")
    print(f"-> Đã tạo: {filepath}")

# 3. Danh sách accounts
accounts = [
    {"name": "khoablabla", "script": "login_khoablabla.txt"},
    {"name": "ikujtyhfg",  "script": "login_ikujtyhfg.txt"},
    {"name": "geasf",      "script": "login_afk.txt"},
    {"name": "djaiwp",     "script": "login_afk.txt"},
    {"name": "hdoiwa",     "script": "login_afk.txt"},
    {"name": "dnwauif",    "script": "login_afk.txt"},
    {"name": "dhwaod",     "script": "login_afk.txt"},
    {"name": "jodawh",     "script": "login_afk.txt"},
    {"name": "dpawjdw",    "script": "login_afk.txt"},
    {"name": "bjkzsd",     "script": "login_afk.txt"},
    {"name": "huidwa",     "script": "login_afk.txt"},
]

# Dọn dẹp file cũ thừa ở ngoài
os.system("rm -f run_*.sh script_*.txt login_*.txt")

print("\nĐang tạo các file <tên_acc>.sh ở ngoài thư mục gốc...")
for acc in accounts:
    name = acc["name"]
    script_path = os.path.join(SCRIPTS_DIR, acc["script"])
    sh_filename = f"{name}.sh"
    
    sh_content = f"""#!/bin/bash
clear
echo "[$(date +%T)] BOT: {name} | Server: {SERVER} | Script: {acc['script']}"
echo "[$(date +%T)] Dang chay: ./MinecraftClient {name} - {SERVER} script={script_path}"
./MinecraftClient {name} - {SERVER} script={script_path}
"""
    with open(sh_filename, "w", encoding="utf-8") as f:
        f.write(sh_content)
    
    try:
        os.chmod(sh_filename, 0o755)
    except Exception:
        pass
        
    print(f"-> Đã tạo: {sh_filename}")

print("\nHoàn tất! Các file .txt nằm gọn trong scripts/, các file .sh nằm ở ngoài.")
