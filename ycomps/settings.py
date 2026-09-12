"""
Django settings for Y-COMPS (Yobe Campaign Operations & Polling Unit
Monitoring Platform).
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load variables from .env so local runs (manage.py, Celery, daphne) use the
# same configuration as the Docker stack (which injects these via env_file).
load_dotenv(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# Core / security
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-CHANGE-ME-before-deploying",
)

DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "channels",
    # Y-COMPS apps
    "accounts",
    "geography",
    "officials",
    "reports",
    "incidents",
    "chatops",
    "notifications",
    "auditlog",
    "syncengine",
    "dashboard",
    "field",
    "smsgateway",
    "purequests",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "auditlog.middleware.AuditLogMiddleware",
]

ROOT_URLCONF = "ycomps.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "ycomps.wsgi.application"
ASGI_APPLICATION = "ycomps.asgi.application"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "ycomps"),
        "USER": os.environ.get("DB_USER", "ycomps"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "ycomps"),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

# Fallback to sqlite for local/offline dev when explicitly requested
# (useful when developing on Termux without a Postgres server running).
if os.environ.get("USE_SQLITE") == "1":
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }

AUTH_USER_MODEL = "accounts.User"

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# I18N
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Lagos"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# DRF / JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": "300/min",
        "anon": "30/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if os.environ.get("CORS_ALLOWED_ORIGINS") else []
CORS_ALLOW_CREDENTIALS = True
# The web client sends a device-id header on every request; expose it so the
# browser's CORS preflight (which checks Access-Control-Allow-Headers) allows
# the real request through.
from corsheaders.defaults import default_headers  # noqa: E402
CORS_ALLOW_HEADERS = [*default_headers, "x-ycomps-device-id"]

# ---------------------------------------------------------------------------
# Channels / Redis
# ---------------------------------------------------------------------------
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

# In SQLite/offline dev mode (which also implies no Redis in the typical
# local setup) fall back to the in-memory channel layer so WebSockets still
# work within this single process without requiring a Redis server.
if os.environ.get("USE_SQLITE") == "1":
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }

# ---------------------------------------------------------------------------
# Celery
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

# ---------------------------------------------------------------------------
# Email — account credentials delivery (console backend by default; set
# EMAIL_HOST etc. in .env and EMAIL_BACKEND=smtp to send for real).
# ---------------------------------------------------------------------------
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "1") == "1"
EMAIL_USE_SSL = os.environ.get("EMAIL_USE_SSL", "0") == "1"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "DMD Y-COMPS <no-reply@ycomps.local>")
# Public base URL of the Next.js frontend, used in email CTAs.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000")

# ---------------------------------------------------------------------------
# SMS emergency-reporting fallback (proposal §14)
# ---------------------------------------------------------------------------
SMS_WEBHOOK_SECRET = os.environ.get("SMS_WEBHOOK_SECRET", "")

# ---------------------------------------------------------------------------
# Y-COMPS specific settings
# ---------------------------------------------------------------------------
# How long (hours) before an assigned location's report is considered overdue.
YCOMPS_REPORT_OVERDUE_HOURS = int(os.environ.get("YCOMPS_REPORT_OVERDUE_HOURS", "12"))

# Max upload size accepted client-side before deferring to background sync (bytes).
YCOMPS_MEDIA_PRIORITY_THRESHOLD_BYTES = 2 * 1024 * 1024

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# We run behind the DigitalOcean Nginx/load-balancer which terminates TLS and
# forwards the original scheme. Tell Django to honor the X-Forwarded-Proto
# header so SECURE_SSL_REDIRECT + HSTS behave correctly behind the proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": BASE_DIR / "logs" / "ycomps.log",
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console", "file"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django": {
            "handlers": ["console", "file"],
            "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
    },
}

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
