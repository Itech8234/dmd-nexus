from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from accounts.models import Role
from geography.models import LGA, PollingUnit, State, Ward
from officials.models import Assignment, Official

from .models import ParseResult, PendingSmsSubmission
from .parsing import normalize_phone, parse_sms

User = get_user_model()


class SmsParsingTests(TestCase):
    def test_parses_valid_report_command(self):
        result = parse_sms("REPORT YB/DTR/001 ACTIVE materials distributed")
        self.assertEqual(result["type"], "report")
        self.assertEqual(result["polling_unit_code"], "YB/DTR/001")
        self.assertEqual(result["operational_status"], "active_reporting")
        self.assertEqual(result["narrative"], "materials distributed")

    def test_parses_valid_incident_command_case_insensitively(self):
        result = parse_sms("incident yb/dtr/001 high thugs at the gate")
        self.assertEqual(result["type"], "incident")
        self.assertEqual(result["severity"], "high")

    def test_rejects_unknown_command(self):
        self.assertIsNone(parse_sms("hello is anyone there"))

    def test_rejects_unknown_status_code(self):
        self.assertIsNone(parse_sms("REPORT YB/DTR/001 BANANAS notes"))

    def test_normalizes_local_nigerian_number(self):
        self.assertEqual(normalize_phone("08012345678"), "+2348012345678")

    def test_normalizes_number_already_with_country_code(self):
        self.assertEqual(normalize_phone("2348012345678"), "+2348012345678")


@override_settings(SMS_WEBHOOK_SECRET="testsecret")
class SmsWebhookTests(APITestCase):
    def setUp(self):
        state = State.objects.create(name="Yobe", code="YB")
        lga = LGA.objects.create(state=state, name="Damaturu")
        ward = Ward.objects.create(lga=lga, name="Kaleri")
        self.pu = PollingUnit.objects.create(ward=ward, official_code="YB/DTR/001", name="PU")

        self.field_user = User.objects.create_user(
            username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL, phone_number="+2348012345678"
        )
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu)

        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.SUPER_ADMIN)

    def test_wrong_secret_is_rejected(self):
        resp = self.client.post(
            "/api/v1/sms/inbound/",
            {"from": "08012345678", "text": "REPORT YB/DTR/001 ACTIVE ok"},
            format="json",
            HTTP_X_YCOMPS_SMS_SECRET="wrong",
        )
        self.assertEqual(resp.status_code, 403)

    def test_unknown_sender_is_logged_but_creates_no_submission(self):
        resp = self.client.post(
            "/api/v1/sms/inbound/",
            {"from": "+2340000000000", "text": "REPORT YB/DTR/001 ACTIVE ok"},
            format="json",
            HTTP_X_YCOMPS_SMS_SECRET="testsecret",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["parse_result"], ParseResult.UNKNOWN_SENDER)
        self.assertIsNone(resp.data["pending_submission_id"])
        self.assertEqual(PendingSmsSubmission.objects.count(), 0)

    def test_valid_report_creates_pending_submission_not_a_real_report(self):
        resp = self.client.post(
            "/api/v1/sms/inbound/",
            {"from": "08012345678", "text": "REPORT YB/DTR/001 ACTIVE materials distributed"},
            format="json",
            HTTP_X_YCOMPS_SMS_SECRET="testsecret",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["parse_result"], ParseResult.PARSED)
        self.assertIsNotNone(resp.data["pending_submission_id"])

        from reports.models import Report

        self.assertEqual(Report.objects.count(), 0)  # not auto-published
        self.assertEqual(PendingSmsSubmission.objects.filter(status="pending").count(), 1)

    def test_admin_approve_creates_real_report(self):
        resp = self.client.post(
            "/api/v1/sms/inbound/",
            {"from": "08012345678", "text": "REPORT YB/DTR/001 ACTIVE materials distributed"},
            format="json",
            HTTP_X_YCOMPS_SMS_SECRET="testsecret",
        )
        pending_id = resp.data["pending_submission_id"]

        self.client.force_authenticate(user=self.admin)
        approve = self.client.post(f"/api/v1/sms-pending/{pending_id}/approve/", {}, format="json")
        self.assertEqual(approve.status_code, 200)
        self.assertEqual(approve.data["status"], "approved")

        from reports.models import Report

        self.assertEqual(Report.objects.count(), 1)

    def test_double_approve_is_rejected(self):
        resp = self.client.post(
            "/api/v1/sms/inbound/",
            {"from": "08012345678", "text": "REPORT YB/DTR/001 ACTIVE materials distributed"},
            format="json",
            HTTP_X_YCOMPS_SMS_SECRET="testsecret",
        )
        pending_id = resp.data["pending_submission_id"]
        self.client.force_authenticate(user=self.admin)
        self.client.post(f"/api/v1/sms-pending/{pending_id}/approve/", {}, format="json")
        second = self.client.post(f"/api/v1/sms-pending/{pending_id}/approve/", {}, format="json")
        self.assertEqual(second.status_code, 400)

    def test_assignment_mismatch_is_flagged(self):
        other_ward = Ward.objects.create(lga=self.pu.ward.lga, name="Other Ward")
        other_pu = PollingUnit.objects.create(ward=other_ward, official_code="YB/DTR/099", name="Other PU")

        resp = self.client.post(
            "/api/v1/sms/inbound/",
            {"from": "08012345678", "text": "REPORT YB/DTR/099 ACTIVE not my unit"},
            format="json",
            HTTP_X_YCOMPS_SMS_SECRET="testsecret",
        )
        pending = PendingSmsSubmission.objects.get(id=resp.data["pending_submission_id"])
        self.assertTrue(pending.assignment_mismatch)
