---
title: AFK Bot Control
emoji: ⛏️
colorFrom: emerald
colorTo: indigo
sdk: docker
app_port: 7860
short_description: Web dashboard quản lý dàn bot AFK + xác minh captcha
---

# ⛏️ AFK Bot Control

Web dashboard quản lý dàn bot AFK: **Flask** + **WebSocket** (cập nhật live, không giật), terminal chạy `run.sh`, log & chat từng bot 2 chế độ (chia ô / một ô), xác minh captcha qua Discord.

Hướng dẫn chi tiết: [`web/README.md`](web/README.md)

## Chạy nhanh

```bash
cd web
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install
.venv/bin/python app.py
```

Mở **http://localhost:7860**
