import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ycomps.settings")

import django  # noqa: E402

django.setup()

from geography.models import State, LGA, Ward, PollingUnit  # noqa: E402

print("State:", State.objects.count())
print("LGAs:", LGA.objects.count())
print("Wards:", Ward.objects.count())
print("PUs:", PollingUnit.objects.count())
pu = PollingUnit.objects.first()
print(pu.official_code, pu.name, pu.ward.lga.name, "| coord:", pu.latitude, pu.longitude)