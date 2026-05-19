FROM node:22-alpine AS admin_builder

WORKDIR /build/admin-frontend

COPY admin-frontend/package*.json ./
RUN npm ci

COPY admin-frontend/ ./
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SERVER_PORT=5000

WORKDIR /app

COPY server/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt gunicorn

COPY server/ ./server/
COPY --from=admin_builder /build/admin-frontend/dist ./admin-frontend/dist

RUN mkdir -p /app/logs /app/server/uploads

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/api/health', timeout=5)"

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "server.app:app"]