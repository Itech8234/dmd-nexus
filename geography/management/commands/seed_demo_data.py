"""
Loads a small demo dataset (one LGA, wards, polling units) so the API
and admin can be explored immediately. Real deployments should replace
this with an import of the authoritative INEC RA/PU list (see README).
"""

from django.core.management.base import BaseCommand

from geography.models import LGA, PollingUnit, State, Ward


class Command(BaseCommand):
    help = "Seed a small demo electoral geography dataset for Yobe State"

    def handle(self, *args, **options):
        state, _ = State.objects.get_or_create(name="Yobe", code="YB")
        lga, _ = LGA.objects.get_or_create(state=state, name="Damaturu", code="DTR")

        ward_names = ["Damaturu Kaleri", "Damaturu Nayinawa", "Damaturu Waziri Ibrahim"]
        pu_counter = 1
        for ward_name in ward_names:
            ward, _ = Ward.objects.get_or_create(lga=lga, name=ward_name)
            for i in range(1, 4):
                code = f"YB/DTR/{pu_counter:03d}"
                PollingUnit.objects.get_or_create(
                    ward=ward,
                    official_code=code,
                    defaults={
                        "name": f"{ward_name} Polling Unit {i}",
                        "source_note": "Demo seed data — replace with authoritative INEC list",
                    },
                )
                pu_counter += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {State.objects.count()} state, {LGA.objects.count()} LGA, "
            f"{Ward.objects.count()} wards, {PollingUnit.objects.count()} polling units."
        ))
