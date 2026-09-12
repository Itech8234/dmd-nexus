# Y-COMPS Deployment Guide (DigitalOcean + Docker)

## Prerequisites

- A DigitalOcean droplet (or any VM with Docker + Docker Compose).
- A domain name (optional but recommended for managed TLS).
- Postgres 16 and Redis 7 run as containers via the stack.
- For object media storage at scale, integrate DO Spaces via a Django
  storage backend (e.g. `django-storages[amazon]` pointed at Spaces
  endpoints) and set `DEFAULT_FILE_STORAGE`. The stack uses a docker volume
  for media by default.

## 1. Prepare the environment

```bash
cp .env.example .env
# Set real values:
#   DJANGO_SECRET_KEY   (long random string)
#   DJANGO_DEBUG=0
#   DJANGO_ALLOWED_HOSTS=your-domain,<droplet-ip>
#   DB_PASSWORD         (strong password)
#   SMS_WEBHOOK_SECRET   (long random string, if using SMS fallback)
# Leave USE_SQLITE=0; the compose file forces it off anyway.
```

Never commit `.env` — it is excluded from git.

## 2. Build and run the stack

```bash
docker compose up --build -d
docker compose exec web python manage.py createsuperuser
```

Services:

| Service | Role |
|---|---|
| `db` | Postgres 16 |
| `redis` | Channels layer + Celery broker |
| `web` | runs `collectstatic --noinput` then `migrate`, then Daphne ASGI |
| `nginx` | reverse proxy, serves `/static/` + `/media/` from volumes, proxies `/ws/` |
| `celery-worker` | background tasks |
| `celery-beat` | scheduler (overdue-report scan every 15 min) |

Only nginx is published (port 80). The `web` service is `expose`d internally.

## 3. TLS

Terminate TLS in front of nginx. Two common options:

- **DigitalOcean Load Balancer / App Platform** — enable "Redirect HTTP to
  HTTPS", attach your SSL certificate, point its health check at `GET /healthz/`.
  The app already honours `X-Forwarded-Proto` via
  `SECURE_PROXY_SSL_HEADER` (`ycomps/settings.py`), so `SECURE_SSL_REDIRECT`
  and HSTS behave correctly behind it.
- **Let's Encrypt on the droplet** — install `certbot` with the nginx plugin,
  provision a certificate, then add a `443` server block forwarding to
  `web:8000` and redirecting `80` → `443`.

`DEBUG=0` in production sets: `SECURE_SSL_REDIRECT`, secure
session/CSRF cookies, and HSTS.

## 4. Health checks & logging

- `GET /healthz/` runs a real DB `SELECT 1` and returns
  `{"status":"ok","database":"ok"}` (or `degraded`). Point the load balancer
  here.
- Django logging is configured (`ycomps/settings.py`) to write to the console
  and a rotating `logs/ycomps.log`. In production, ship stdout to your log
  aggregator (DO Logs, Papertrail, etc.).

## 5. Scaling notes

- `web` is stateless (sessions are DB-backed, chat is DB-backed, media is in
  volumes/Spaces) — scale it horizontally behind a load balancer that
  **sticky-WebSocket**s or routes `/ws/` to a single node, since Channels
  requires a shared Redis layer (already configured).
- Increase `nginx` `worker_processes`/`worker_connections` for higher load;
  raise `client_max_body_size` if officials upload large photos.

## 6. Operational checklist before election day

- [ ] Load the real Yobe INEC PU list (the `import_polling_units` command —
      see `docs/OFFLINE_SYNC.md`/README — is ready; source the CSV).
- [ ] Connect a real SMS provider (set `SMS_GATEWAY_BACKEND` +
      credentials in `.env` — see `smsgateway/client.py`, which ships
      Africa's Talking / Termii / Twilio backends).
- [ ] Run a load test against the `/api/v1/reports/` and incident endpoints.
- [ ] Back up Postgres (`pg_dump`) and enable point-in-time recovery.
- [ ] Put the stack behind a WAF (Cloudflare or DO firewall rules).
- [ ] Onboard field officials and print/verify their PU assignments.
- [ ] Test the full offline flow on a real phone with `airplane mode` on.
