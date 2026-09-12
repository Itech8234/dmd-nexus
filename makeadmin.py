import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ycomps.settings")
django.setup()
from accounts.models import User
u, created = User.objects.get_or_create(
    username="dmdadmin",
    defaults={"role": "super_admin", "first_name": "DMD", "last_name": "Admin", "is_staff": True, "is_superuser": True},
)
u.role = "super_admin"
u.is_staff = True
u.is_superuser = True
u.set_password("YCompsAdmin#2026")
u.save()
print("ADMIN_OK", u.id, u.username, u.role)
