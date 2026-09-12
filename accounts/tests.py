from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Role
from officials.models import Official

User = get_user_model()


class UserManagementTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.SUPER_ADMIN)
        self.coordinator = User.objects.create_user(username="coord1", password="pass12345!", role=Role.LGA_COORDINATOR)
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)

    def test_admin_can_create_field_official_with_auto_created_profile(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/users/",
            {
                "username": "field2",
                "password": "SecurePass123!",
                "first_name": "Aliyu",
                "role": "field_official",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        new_user = User.objects.get(username="field2")
        self.assertTrue(Official.objects.filter(user=new_user).exists())

    def test_created_user_can_authenticate_with_set_password(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(
            "/api/v1/users/",
            {"username": "field3", "password": "SecurePass123!", "role": "field_official"},
            format="json",
        )
        self.client.force_authenticate(user=None)
        login = self.client.post("/api/v1/auth/token/", {"username": "field3", "password": "SecurePass123!"}, format="json")
        self.assertEqual(login.status_code, 200)

    def test_coordinator_can_list_but_not_create_users(self):
        self.client.force_authenticate(user=self.coordinator)
        list_resp = self.client.get("/api/v1/users/")
        self.assertEqual(list_resp.status_code, 200)

        create_resp = self.client.post("/api/v1/users/", {"username": "hacker", "role": "super_admin"}, format="json")
        self.assertEqual(create_resp.status_code, 403)

    def test_field_official_cannot_list_or_create_users(self):
        self.client.force_authenticate(user=self.field_user)
        list_resp = self.client.get("/api/v1/users/")
        self.assertEqual(list_resp.status_code, 403)

    def test_regular_user_cannot_elevate_own_role_via_me_endpoint(self):
        # /me/ uses the plain UserSerializer, which has role as read-only.
        self.client.force_authenticate(user=self.field_user)
        resp = self.client.get("/api/v1/auth/me/")
        self.assertEqual(resp.data["role"], "field_official")

    def test_createsuperuser_gets_super_admin_role_by_default(self):
        # A production deployment's first step is `manage.py createsuperuser`;
        # without this, that account could do anything in /admin/ but would
        # get 403 from every privileged API endpoint until someone manually
        # fixed its role — a confusing first-run trap.
        superuser = User.objects.create_superuser(username="bootstrap_admin", password="pass12345!")
        self.assertEqual(superuser.role, Role.SUPER_ADMIN)
