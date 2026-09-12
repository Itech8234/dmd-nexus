from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import Role
from geography.models import LGA, PollingUnit, State, Ward

from .models import Assignment, Official

User = get_user_model()


class AssignmentConstraintTests(TestCase):
    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="PU")

        user_a = User.objects.create_user(username="field_a", password="pass12345!", role=Role.FIELD_OFFICIAL)
        user_b = User.objects.create_user(username="field_b", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official_a = Official.objects.create(user=user_a, official_reference="FO-A")
        self.official_b = Official.objects.create(user=user_b, official_reference="FO-B")

    def test_only_one_active_official_per_polling_unit(self):
        Assignment.objects.create(official=self.official_a, polling_unit=self.pu, status="active")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Assignment.objects.create(official=self.official_b, polling_unit=self.pu, status="active")

    def test_ended_assignment_frees_the_polling_unit(self):
        first = Assignment.objects.create(official=self.official_a, polling_unit=self.pu, status="active")
        first.status = "ended"
        first.save()

        # Should not raise now that the only active assignment has ended.
        Assignment.objects.create(official=self.official_b, polling_unit=self.pu, status="active")
        self.assertEqual(Assignment.objects.filter(polling_unit=self.pu, status="active").count(), 1)


class AssignmentApiTests(APITestCase):
    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="PU")

        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.CAMPAIGN_ADMIN)
        user_a = User.objects.create_user(username="field_a", password="pass12345!", role=Role.FIELD_OFFICIAL)
        user_b = User.objects.create_user(username="field_b", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official_a = Official.objects.create(user=user_a, official_reference="FO-A")
        self.official_b = Official.objects.create(user=user_b, official_reference="FO-B")

        self.client.force_authenticate(user=self.admin)

    def _payload(self, official):
        return {
            "official": str(official.id),
            "polling_unit": str(self.pu.id),
            "status": "active",
        }

    def test_duplicate_active_assignment_returns_409(self):
        first = self.client.post("/api/v1/assignments/", self._payload(self.official_a), format="json")
        self.assertEqual(first.status_code, 201)
        second = self.client.post("/api/v1/assignments/", self._payload(self.official_b), format="json")
        self.assertEqual(second.status_code, 409)

    def test_field_official_cannot_create_assignment(self):
        self.client.force_authenticate(user=self.official_a.user)
        resp = self.client.post("/api/v1/assignments/", self._payload(self.official_b), format="json")
        self.assertIn(resp.status_code, (403, 405))

    def test_new_assignment_notifies_the_official(self):
        from notifications.models import Notification

        self.client.post("/api/v1/assignments/", self._payload(self.official_a), format="json")
        self.assertTrue(
            Notification.objects.filter(recipient=self.official_a.user, notification_type="assignment_changed").exists()
        )

    def test_assignment_options_lists_candidates_and_active_assignment(self):
        self.client.post("/api/v1/assignments/", self._payload(self.official_a), format="json")

        resp = self.client.get("/api/v1/assignments/assignment_options/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()

        official_ids = {o["id"] for o in body["officials"]}
        self.assertIn(str(self.official_a.id), official_ids)
        self.assertIn(str(self.official_b.id), official_ids)

        self.assertEqual([pu["official_code"] for pu in body["polling_units"]], ["YB/DTR/001"])
        active = body["polling_units"][0]["assigned_official"]
        self.assertIsNotNone(active)
        self.assertEqual(active["id"], str(self.official_a.id))

    def test_field_official_cannot_read_assignment_options(self):
        self.client.force_authenticate(user=self.official_a.user)
        resp = self.client.get("/api/v1/assignments/assignment_options/")
        self.assertIn(resp.status_code, (403, 405))
