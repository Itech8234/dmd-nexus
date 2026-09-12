import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ycomps.settings")

app = Celery("ycomps")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "check-overdue-polling-units": {
        "task": "geography.tasks.check_overdue_polling_units",
        "schedule": crontab(minute="*/15"),
    },
}
