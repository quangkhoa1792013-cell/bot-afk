FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash tmux jq nodejs npm iproute2 procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=7860
EXPOSE 7860

CMD ["python3", "app.py"]
