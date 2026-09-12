from django.apps import AppConfig


class IncidentsConfig(AppConfig):
    name = "incidents"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        """Idempotently seed the standard incident taxonomy on startup.

        Safe to run on every ``manage.py`` invocation: it's wrapped in a
        try/except so it no-ops before the DB is migrated (during
        ``makemigrations``/first ``migrate``) or if the DB is unavailable.
        """
        try:
            from .management.commands.seed_incident_categories import INCIDENT_CATEGORIES
            from .models import IncidentCategory as Category

            for name, description in INCIDENT_CATEGORIES:
                Category.objects.get_or_create(
                    name=name, defaults={"description": description, "is_active": True}
                )
        except Exception:
            # Never crash startup because seeding failed (e.g. DB not migrated).
            pass
