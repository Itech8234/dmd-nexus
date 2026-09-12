"""
Seed the platform's standard incident taxonomy.

Idempotent: existing categories are never duplicated — they are matched by
normalised name and only (re)activated. Run automatically via
``apps.py.ready()`` on ``migrate``/startup, or manually::

    python manage.py seed_incident_categories
"""

from django.core.management.base import BaseCommand

# The canonical Y-COMPS incident taxonomy. Each entry is (name, description).
# Grouped by domain so operators can edit/toggle groups from the admin panel.
INCIDENT_CATEGORIES = [
    # --- Security & Threats ---
    ("Security Threat", "Security risk or threat to personnel, assets or the election process."),
    ("Armed Attack", "Attack involving firearms or other weapons against people or property."),
    ("Terrorism-Related Incident", "Incident involving actors with a terrorist or violent-extremist intent."),
    ("Suspicious Activity", "Unusual behaviour or activity that may indicate a security risk."),
    ("Violence", "Physical violence between individuals or groups."),
    ("Civil Unrest", "Public disorder, protests or riots disrupting normal activity."),
    ("Communal Conflict", "Conflict between communities or communal groups."),
    ("Political Violence", "Violence connected to political actors, campaigns or activities."),
    # --- Election & Polling ---
    ("Election Violence", "Violence occurring in connection with the electoral process."),
    ("Voter Intimidation", "Threats or pressure aimed at influencing or deterring voters."),
    ("Vote Buying", "Offering money or incentives in exchange for votes."),
    ("Ballot Snatching", "Seizure or theft of ballot papers or ballot boxes."),
    ("Electoral Fraud", "Fraudulent activity intended to subvert the electoral process."),
    ("Polling Unit Disruption", "Actions that disrupt the operation of a polling unit."),
    ("Unauthorized Access", "Access to restricted polling or electoral areas without authority."),
    ("Electoral Material Issues", "Missing, damaged or incorrect electoral materials."),
    # --- Public Safety ---
    ("Fire Incident", "Fire affecting buildings, people or the electoral process."),
    ("Road Accident", "Road traffic accident causing injury, damage or disruption."),
    ("Crowd Control", "Crowd-related safety incident requiring management or intervention."),
    ("Missing Person", "A person reported missing."),
    ("Public Disturbance", "Disturbance affecting public order or safety."),
    ("Emergency Situation", "General emergency requiring immediate response."),
    # --- Infrastructure ---
    ("Road Blockage", "Road blocked by protests, debris, damage or other causes."),
    ("Power Failure", "Electricity supply failure affecting operations."),
    ("Communication Failure", "Failure of phone, radio or data communication links."),
    ("Infrastructure Damage", "Damage to public or electoral infrastructure."),
    ("Facility Damage", "Damage to buildings, facilities or equipment."),
    # --- Operational Issues ---
    ("System Failure", "Failure of an operational system or application."),
    ("Communication Issue", "Operational problem with communication channels."),
    ("Personnel Issue", "Staffing or personnel-related operational problem."),
    ("Logistics Issue", "Problem with transport, delivery or logistical arrangements."),
    ("Data Issue", "Problem with data quality, capture or transmission."),
    # --- Other ---
    ("Medical Emergency", "Medical emergency requiring urgent assistance."),
    ("Natural Disaster", "Flood, storm, drought or other natural disaster."),
    ("Environmental Incident", "Hazardous or environmental incident affecting people or operations."),
    ("Other Incident", "Any incident not covered by the categories above."),
]


class Command(BaseCommand):
    help = "Seed (idempotently) the standard incident category taxonomy."

    def handle(self, *args, **options):
        from incidents.models import IncidentCategory

        created = 0
        activated = 0
        for name, description in INCIDENT_CATEGORIES:
            obj, was_created = IncidentCategory.objects.get_or_create(
                name=name,
                defaults={"description": description, "is_active": True},
            )
            if was_created:
                created += 1
                continue
            # Re-activate a category an admin had turned off (the taxonomy is
            # canonical, but they can deactivate it again from the panel).
            if not obj.is_active:
                obj.is_active = True
                obj.save(update_fields=["is_active"])
                activated += 1
            if description and obj.description != description:
                obj.description = description
                obj.save(update_fields=["description"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Incident categories ready: {created} created, {activated} re-activated, "
                f"{IncidentCategory.objects.count()} total."
            )
        )