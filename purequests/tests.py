from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from auditlog.models import AuditLog
from geography.models import LGA, OperationalStatus, PollingUnit, State, Ward
from notifications.models import Notification, NotificationType

from .models import PollingUnitRequest, RequestStatus

User = get_user_model()


class RequestSetupMixin:
    def _make_geography(self):
        state = State.objects.create(name="Yobe", code="YB")
        self.lga_a = LGA.objects.create(state=state, name="Damaturu")
        self.lga_b = LGA.objects.create(state=state, name="Potiskum")
        self.ward_a = Ward.objects.create(lga=self.lga_a, name="Kaleri")
        self.ward_b = Ward.objects.create(lga=self.lga_b, name="Nayinawa")

    def _payload(self, ward=None, code="YB/DTR/900"):
        return {
            "ward": str((ward or self.ward_a).id),
            "official_code": code,
            "name": "New Kaleri PU",
            "location_description": "Beside the primary school",
            "latitude": "12.345678",
            "longitude": "11.123456",
            "source_note": "Field survey",
        }


class PURequestCreateTests(RequestSetupMixin, APITestCase):
    def setUp(self):
        self._make_geography()
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.client.force_authenticate(user=self.field_user)

    def test_field_official_creates_pending_request(self):
        resp = self.client.post("/api/v1/pu-requests/", self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], RequestStatus.PENDING)
        req = PollingUnitRequest.objects.get()
        self.assertEqual(req.submitted_by, self.field_user)

    def test_duplicate_code_against_registry_rejected(self):
        PollingUnit.objects.create(ward=self.ward_a, official_code="YB/DTR/900", name="Existing")
        resp = self.client.post("/api/v1/pu-requests/", self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_pending_request_rejected(self):
        self.client.post("/api/v1/pu-requests/", self._payload(), format="json")
        resp = self.client.post("/api/v1/pu-requests/", self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_gps_rejected(self):
        payload = self._payload()
        payload.pop("latitude")
        resp = self.client.post("/api/v1/pu-requests/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_field_official_sees_only_own_requests(self):
        self.client.post("/api/v1/pu-requests/", self._payload(), format="json")
        other = User.objects.create_user(username="field2", password="pass12345!", role=Role.FIELD_OFFICIAL)
        PollingUnitRequest.objects.create(ward=self.ward_a, official_code="YB/DTR/901", name="Other's", submitted_by=other)
        resp = self.client.get("/api/v1/pu-requests/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)


class CoordinatorScopeTests(RequestSetupMixin, APITestCase):
    def setUp(self):
        self._make_geography()
        self.coordinator = User.objects.create_user(
            username="coord1", password="pass12345!", role=Role.LGA_COORDINATOR, scoped_lga=self.lga_a
        )
        self.client.force_authenticate(user=self.coordinator)

    def test_coordinator_can_propose_within_lga(self):
        resp = self.client.post("/api/v1/pu-requests/", self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_coordinator_cannot_propose_outside_lga(self):
        resp = self.client.post("/api/v1/pu-requests/", self._payload(ward=self.ward_b), format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_coordinator_sees_only_own_lga_requests(self):
        PollingUnitRequest.objects.create(ward=self.ward_a, official_code="YB/DTR/901", name="In LGA")
        PollingUnitRequest.objects.create(ward=self.ward_b, official_code="YB/PTK/901", name="Out of LGA")
        resp = self.client.get("/api/v1/pu-requests/")
        codes = {r["official_code"] for r in resp.data["results"]}
        self.assertEqual(codes, {"YB/DTR/901"})


class ReviewWorkflowTests(RequestSetupMixin, APITestCase):
    def setUp(self):
        self._make_geography()
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.SUPER_ADMIN)
        self.client.force_authenticate(user=self.field_user)
        resp = self.client.post("/api/v1/pu-requests/", self._payload(), format="json")
        self.request_obj = PollingUnitRequest.objects.get(pk=resp.data["id"])
        self.client.force_authenticate(user=self.admin)

    def test_field_user_cannot_approve(self):
        self.client.force_authenticate(user=self.field_user)
        resp = self.client.post(f"/api/v1/pu-requests/{self.request_obj.id}/approve/", {})
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED))

    def test_approve_materialises_polling_unit(self):
        resp = self.client.post(f"/api/v1/pu-requests/{self.request_obj.id}/approve/", {})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], RequestStatus.APPROVED)

        pu = PollingUnit.objects.get(official_code="YB/DTR/900")
        self.assertEqual(pu.operational_status, OperationalStatus.AWAITING_ASSIGNMENT)
        self.request_obj.refresh_from_db()
        self.assertEqual(self.request_obj.created_polling_unit, pu)
        self.assertEqual(self.request_obj.reviewed_by, self.admin)

        # Audit + submitter notification.
        self.assertTrue(AuditLog.objects.filter(action="pu_request_approved", object_id=str(self.request_obj.id)).exists())
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.field_user, notification_type=NotificationType.PU_REQUEST_DECIDED
            ).exists()
        )

    def test_approve_twice_rejected(self):
        self.client.post(f"/api/v1/pu-requests/{self.request_obj.id}/approve/", {})
        resp = self.client.post(f"/api/v1/pu-requests/{self.request_obj.id}/approve/", {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PollingUnit.objects.filter(official_code="YB/DTR/900").count(), 1)

    def test_reject_requires_note(self):
        resp = self.client.post(f"/api/v1/pu-requests/{self.request_obj.id}/reject/", {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        resp = self.client.post(f"/api/v1/pu-requests/{self.request_obj.id}/reject/", {"note": "Duplicate of existing unit"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], RequestStatus.REJECTED)
        self.assertEqual(PollingUnit.objects.filter(official_code="YB/DTR/900").count(), 0)

    def test_reviewer_cannot_review_own_submission(self):
        submission = PollingUnitRequest.objects.create(
            ward=self.ward_a, official_code="YB/DTR/902", name="Admin's own", submitted_by=self.admin
        )
        resp = self.client.post(f"/api/v1/pu-requests/{submission.id}/approve/", {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class WithdrawTests(RequestSetupMixin, APITestCase):
    def setUp(self):
        self._make_geography()
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.other = User.objects.create_user(username="field2", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.req = PollingUnitRequest.objects.create(
            ward=self.ward_a, official_code="YB/DTR/903", name="Mine", submitted_by=self.field_user
        )

    def _as(self, user):
        self.client.force_authenticate(user=user)

    def test_owner_can_withdraw_pending(self):
        self._as(self.field_user)
        resp = self.client.delete(f"/api/v1/pu-requests/{self.req.id}/")
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT))
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, RequestStatus.WITHDRAWN)

    def test_non_owner_cannot_withdraw(self):
        self._as(self.other)
        resp = self.client.delete(f"/api/v1/pu-requests/{self.req.id}/")
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, RequestStatus.PENDING)

    def test_cannot_withdraw_reviewed_request(self):
        self.req.status = RequestStatus.APPROVED
        self.req.save(update_fields=["status"])
        self._as(self.field_user)
        resp = self.client.delete(f"/api/v1/pu-requests/{self.req.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class PURequestMapTests(RequestSetupMixin, APITestCase):
    def setUp(self):
        self._make_geography()
        self.user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.client.force_authenticate(user=self.user)
        PollingUnitRequest.objects.create(
            ward=self.ward_a, official_code="YB/DTR/904", name="Pending geo",
            latitude="12.1", longitude="11.1", submitted_by=self.user,
        )
        PollingUnitRequest.objects.create(
            ward=self.ward_a, official_code="YB/DTR/905", name="Approved",
            latitude="12.2", longitude="11.2", submitted_by=self.user, status=RequestStatus.APPROVED,
        )
        PollingUnitRequest.objects.create(
            ward=self.ward_a, official_code="YB/DTR/906", name="No GPS", submitted_by=self.user,
        )

    def test_map_returns_only_pending_with_coords(self):
        resp = self.client.get("/api/v1/pu-requests/map/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        codes = {item["official_code"] for item in resp.data["results"]}
        self.assertEqual(codes, {"YB/DTR/904"})