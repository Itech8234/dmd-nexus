from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Role

from .models import AuditLog

User = get_user_model()


class AuditLogApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.CAMPAIGN_ADMIN)
        self.field = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)

    def _seed(self, user=None, action="CREATE"):
        return AuditLog.objects.create(
            actor=user or self.admin,
            action=action,
            object_type="report",
            object_id="123",
            detail="created a report",
            result="success",
            ip_address="127.0.0.1",
        )

    def test_privileged_user_can_list_audit_logs(self):
        self._seed()
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/v1/audit-logs/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["actor_name"], "admin1")

    def test_field_official_cannot_read_audit_logs(self):
        self._seed()
        self.client.force_authenticate(user=self.field)
        resp = self.client.get("/api/v1/audit-logs/")
        self.assertEqual(resp.status_code, 403)

    def test_audit_logs_are_read_only(self):
        self._seed()
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/v1/audit-logs/", {"action": "CREATE"}, format="json")
        self.assertIn(resp.status_code, (403, 405))
