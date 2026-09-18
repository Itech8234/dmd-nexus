# ycomps/settings.py

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_DIR = BASE_DIR / "logs"
LOG_PATH = LOG_DIR / "ycomps.log"

IS_VERCEL = os.environ.get("VERCEL", "").lower() == "1"
IS_PRODUCTION = (
    os.environ.get("DJANGO_ENV", "").lower() in {"production", "prod"}
    or os.environ.get("DJANGO_DEBUG", "1") == "0"
    or IS_VERCEL
)

handlers = {
    "console": {
        "class": "logging.StreamHandler",
        "formatter": "verbose",
    }
}

# Keep file logging for local/dev only when the directory is present.
# Never require logs/ycomps.log to exist in production/Vercel.
if not IS_PRODUCTION:
    try:
        LOG_DIR.mkdir(exist_ok=True)
    except OSError:
        pass
    else:
        handlers["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOG_PATH,
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
        }

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
    "handlers": handlers,
    "root": {
        "handlers": ["console"] if IS_PRODUCTION else ["console", *(["file"] if "file" in handlers else [])],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django": {
            "handlers": ["console"] if IS_PRODUCTION else ["console", *(["file"] if "file" in handlers else [])],
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
