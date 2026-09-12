import uuid

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Role
from geography.models import LGA, PollingUnit, State, Ward
from officials.models import Assignment, Official

User = get_user_model()


class ReportIdempotencyTests(APITestCase):
    """
    Covers the core offline-first guarantee: resubmitting a report with the
    same client_generated_id (as a retry after a dropped connection would)
    must never create a duplicate.
    """

    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="Test PU")

        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu)

        self.client.force_authenticate(user=self.field_user)

    def _payload(self, client_id):
        return {
            "client_generated_id": client_id,
            "polling_unit": str(self.pu.id),
            "official": str(self.official.id),
            "operational_status": "active_reporting",
            "narrative": "test",
            "device_captured_at": timezone.now().isoformat(),
        }

    def test_resubmit_same_client_id_does_not_duplicate(self):
        client_id = str(uuid.uuid4())
        first = self.client.post("/api/v1/reports/", self._payload(client_id), format="json")
        second = self.client.post("/api/v1/reports/", self._payload(client_id), format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.data["id"], second.data["id"])

        from reports.models import Report

        self.assertEqual(Report.objects.filter(official=self.official).count(), 1)

    def test_different_client_ids_create_separate_reports(self):
        self.client.post("/api/v1/reports/", self._payload(str(uuid.uuid4())), format="json")
        self.client.post("/api/v1/reports/", self._payload(str(uuid.uuid4())), format="json")

        from reports.models import Report

        self.assertEqual(Report.objects.filter(official=self.official).count(), 2)

    def test_submitting_a_report_updates_polling_unit_status(self):
        self.pu.operational_status = "awaiting_assignment"
        self.pu.save()
        self.client.post("/api/v1/reports/", self._payload(str(uuid.uuid4())), format="json")
        self.pu.refresh_from_db()
        self.assertEqual(self.pu.operational_status, "recently_reported")


class ReportAttachmentTests(APITestCase):
    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="Test PU")

        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu)
        self.client.force_authenticate(user=self.field_user)

        report = self.client.post(
            "/api/v1/reports/",
            {
                "client_generated_id": str(uuid.uuid4()),
                "polling_unit": str(self.pu.id),
                "official": str(self.official.id),
                "operational_status": "active_reporting",
                "narrative": "test",
                "device_captured_at": timezone.now().isoformat(),
            },
            format="json",
        ).data
        self.report_id = report["id"]

    def test_uploaded_attachment_is_marked_submitted_not_saved_offline(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        photo = SimpleUploadedFile("photo.jpg", b"\xff\xd8\xff\xe0" + b"0" * 200, content_type="image/jpeg")
        resp = self.client.post(
            "/api/v1/report-attachments/",
            {"report": self.report_id, "file": photo, "priority": 2},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["sync_status"], "submitted")

    def test_attachment_appears_on_report_detail(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        photo = SimpleUploadedFile("photo.jpg", b"\xff\xd8\xff\xe0" + b"0" * 200, content_type="image/jpeg")
        self.client.post(
            "/api/v1/report-attachments/",
            {"report": self.report_id, "file": photo, "priority": 2},
            format="multipart",
        )
        detail = self.client.get(f"/api/v1/reports/{self.report_id}/")
        self.assertEqual(len(detail.data["attachments"]), 1)
