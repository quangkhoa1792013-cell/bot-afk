FROM python:3.12-slim

# pgrep (kiểm tra trạng thái bot) — chỉ dùng cho máy local; Render không sao nếu thiếu
RUN apt-get update && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=7860
EXPOSE 7860

CMD ["python3", "app.py"]
