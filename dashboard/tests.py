import uuid

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Role
from geography.models import LGA, PollingUnit, State, Ward
from officials.models import Assignment, Official

User = get_user_model()


class DashboardSummaryTests(APITestCase):
    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="PU")

        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.CAMPAIGN_ADMIN)
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu)

        # Create a real report so the KPI reflects real data.
        self.client.force_authenticate(user=self.field_user)
        self.client.post(
            "/api/v1/reports/",
            {
                "client_generated_id": str(uuid.uuid4()),
                "polling_unit": str(self.pu.id),
                "official": str(self.official.id),
                "operational_status": "active_reporting",
                "narrative": "all clear",
                "device_captured_at": timezone.now().isoformat(),
            },
            format="json",
        )
        self.client.force_authenticate(user=self.admin)

    def test_summary_exposes_real_kpis(self):
        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_polling_units"], 1)
        self.assertEqual(resp.data["reports_received"], 1)

    def test_analytics_returns_real_report_counts(self):
        resp = self.client.get("/api/v1/analytics/")
        self.assertEqual(resp.status_code, 200)
        today = timezone.localdate().isoformat()
        self.assertEqual(resp.data["reports_per_day"][today], 1)

    def test_field_official_forbidden_from_dashboard_summary(self):
        self.client.force_authenticate(user=self.field_user)
        resp = self.client.get("/api/v1/dashboard/summary/")
        self.assertIn(resp.status_code, (403, 405))
