import uuid

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Role
from geography.models import LGA, PollingUnit, State, Ward
from officials.models import Assignment, Official

User = get_user_model()


class IncidentFieldOfficialTests(APITestCase):
    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu1 = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="PU One")
        self.pu2 = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/002", name="PU Two")

        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu1)

        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.CAMPAIGN_ADMIN)

        self.client.force_authenticate(user=self.field_user)

    def _payload(self, client_id, polling_unit=None, reporter=None):
        return {
            "client_generated_id": client_id,
            "polling_unit": str(polling_unit.id if polling_unit else self.pu1.id),
            "reporter": str(reporter.id if reporter else self.official.id),
            "category": None,
            "severity": "high",
            "description": "vandalism",
        }

    def test_field_official_reporter_is_forced_to_own_official(self):
        other_user = User.objects.create_user(username="other", password="pass12345!", role=Role.FIELD_OFFICIAL)
        other_official = Official.objects.create(user=other_user, official_reference="FO-002")
        Assignment.objects.create(official=other_official, polling_unit=self.pu2)

        resp = self.client.post(
            "/api/v1/incidents/",
            self._payload(str(uuid.uuid4()), reporter=other_official),
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        from incidents.models import Incident

        incident = Incident.objects.get(id=resp.data["id"])
        self.assertEqual(incident.reporter_id, self.official.id)

    def test_field_official_cannot_report_unassigned_polling_unit(self):
        resp = self.client.post(
            "/api/v1/incidents/",
            self._payload(str(uuid.uuid4()), polling_unit=self.pu2),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_resubmit_same_client_id_is_idempotent(self):
        first = self.client.post("/api/v1/incidents/", self._payload(str(uuid.uuid4())), format="json")
        second = self.client.post("/api/v1/incidents/", self._payload(str(uuid.uuid4())), format="json")
        self.client.force_authenticate(user=self.field_user)
        # Same client id, resubmitted exactly:
        client_id = str(uuid.uuid4())
        a = self.client.post("/api/v1/incidents/", self._payload(client_id), format="json")
        b = self.client.post("/api/v1/incidents/", self._payload(client_id), format="json")
        self.assertEqual(a.data["id"], b.data["id"])

    def test_field_official_see_only_own_incidents(self):
        self.client.post("/api/v1/incidents/", self._payload(str(uuid.uuid4())), format="json")
        resp = self.client.get("/api/v1/incidents/")
        for incident in resp.data["results"]:
            self.assertEqual(str(incident["reporter"]), str(self.official.id))


class IncidentCoordinatorTests(APITestCase):
    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="PU One")

        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.CAMPAIGN_ADMIN)
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu)

        self.client.force_authenticate(user=self.field_user)
        resp = self.client.post(
            "/api/v1/incidents/",
            {
                "client_generated_id": str(uuid.uuid4()),
                "polling_unit": str(self.pu.id),
                "severity": "critical",
                "description": "fire",
            },
            format="json",
        )
        self.incident_id = resp.data["id"]
        self.client.force_authenticate(user=self.admin)

    def test_add_update_allowed_for_admin(self):
        resp = self.client.post(
            f"/api/v1/incidents/{self.incident_id}/add_update/",
            {"note": "sending team", "new_status": "investigating"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "investigating")

    def test_add_update_denied_for_field_official(self):
        self.client.force_authenticate(user=self.field_user)
        resp = self.client.post(
            f"/api/v1/incidents/{self.incident_id}/add_update/",
            {"note": "hijacked", "new_status": "resolved"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_destroy_denied_for_field_official(self):
        self.client.force_authenticate(user=self.field_user)
        resp = self.client.delete(f"/api/v1/incidents/{self.incident_id}/")
        self.assertEqual(resp.status_code in (403, 405), True)

    def test_new_incident_marks_polling_unit_incident_reported(self):
        self.pu.refresh_from_db()
        self.assertEqual(self.pu.operational_status, "incident_reported")
