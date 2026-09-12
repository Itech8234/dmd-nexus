from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase

from accounts.models import Role
from officials.models import Assignment, Official
from reports.models import Report

from .models import LGA, PollingUnit, State, Ward
from .tasks import check_overdue_polling_units

import os

User = get_user_model()


class ImportPollingUnitsCommandTests(TestCase):
    """Nice-weather + failure-path coverage for `import_polling_units`."""

    CSV_HEADER = "State,LGA,Ward,PU_Code,PU_Name,Latitude,Longitude\n"

    def _write_csv(self, rows):
        import tempfile

        fd, path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(self.CSV_HEADER)
            fh.write(rows)
        return path

    def _cleanup(self, path):
        os.unlink(path)

    def test_import_creates_geography_and_dedupes_on_rerun(self):
        path = self._write_csv(
            "Yobe,Damaturu,Kaleri,YB-DTR-001,Kaleri PU 1,12.34,11.96\n"
            "Yobe,Damaturu,Nayinawa,YB/DTR/002,Nayinawa PU 1,12.35,11.97\n"
        )
        try:
            call_command("import_polling_units", path, "--dry-run")
            # Dry run writes nothing.
            self.assertEqual(PollingUnit.objects.count(), 0)
            self.assertEqual(LGA.objects.count(), 0)

            call_command("import_polling_units", path)
            self.assertEqual(PollingUnit.objects.count(), 2)
            pu = PollingUnit.objects.get(official_code="YBDTR001")  # normalised
            self.assertEqual(pu.name, "Kaleri PU 1")
            self.assertEqual(pu.ward.lga.name, "Damaturu")

            # Re-importing the same file must not duplicate and must not
            # clobber operational status set since import.
            pu.operational_status = "active_reporting"
            pu.save()
            call_command("import_polling_units", path)
            self.assertEqual(PollingUnit.objects.count(), 2)
            pu.refresh_from_db()
            self.assertEqual(pu.operational_status, "active_reporting")
        finally:
            self._cleanup(path)

    def test_missing_required_column_errors(self):
        import tempfile

        fd, path = tempfile.mkstemp(suffix=".csv")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write("State,LGA,Ward,PU_Name\nYobe,Damaturu,Kaleri,PU 1\n")
        try:
            from django.core.management.base import CommandError

            with self.assertRaises(CommandError):
                call_command("import_polling_units", path)
        finally:
            self._cleanup(path)


class ScopingSetupMixin:
    def _make_geography(self):
        state = State.objects.create(name="Yobe", code="YB")
        self.lga_a = LGA.objects.create(state=state, name="Damaturu")
        self.lga_b = LGA.objects.create(state=state, name="Potiskum")
        self.ward_a = Ward.objects.create(lga=self.lga_a, name="Kaleri")
        self.ward_b = Ward.objects.create(lga=self.lga_b, name="Nayinawa")
        self.pu_a = PollingUnit.objects.create(ward=self.ward_a, official_code="YB/DTR/001", name="PU A")
        self.pu_b = PollingUnit.objects.create(ward=self.ward_b, official_code="YB/PTK/001", name="PU B")


class FieldOfficialScopingTests(ScopingSetupMixin, APITestCase):
    """A field official must only see their own assigned polling unit, never the whole state."""

    def setUp(self):
        self._make_geography()
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu_a)
        self.client.force_authenticate(user=self.field_user)

    def test_field_official_sees_only_own_polling_unit(self):
        resp = self.client.get("/api/v1/polling-units/")
        self.assertEqual(resp.status_code, 200)
        codes = {pu["official_code"] for pu in resp.data["results"]}
        self.assertEqual(codes, {"YB/DTR/001"})

    def test_field_official_sees_only_own_assignment(self):
        resp = self.client.get("/api/v1/assignments/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(str(resp.data["results"][0]["official"]), str(self.official.id))


class CoordinatorScopingTests(ScopingSetupMixin, APITestCase):
    """An LGA coordinator should only see polling units within their LGA."""

    def setUp(self):
        self._make_geography()
        self.coordinator = User.objects.create_user(
            username="coord1", password="pass12345!", role=Role.LGA_COORDINATOR, scoped_lga=self.lga_a
        )
        self.client.force_authenticate(user=self.coordinator)

    def test_coordinator_sees_only_own_lga(self):
        resp = self.client.get("/api/v1/polling-units/")
        codes = {pu["official_code"] for pu in resp.data["results"]}
        self.assertEqual(codes, {"YB/DTR/001"})


class OverdueTaskTests(ScopingSetupMixin, TestCase):
    def setUp(self):
        self._make_geography()
        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.SUPER_ADMIN)
        self.field_user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official = Official.objects.create(user=self.field_user, official_reference="FO-001")
        Assignment.objects.create(official=self.official, polling_unit=self.pu_a, assigned_by=self.admin)

    def test_stale_reporting_polling_unit_is_flagged_overdue(self):
        from geography.models import OperationalStatus

        self.pu_a.operational_status = OperationalStatus.ACTIVE_REPORTING
        self.pu_a.save()
        Report.objects.create(
            client_generated_id="11111111-1111-1111-1111-111111111111",
            polling_unit=self.pu_a,
            official=self.official,
            operational_status="active_reporting",
            device_captured_at=timezone.now() - timedelta(hours=48),
        )

        result = check_overdue_polling_units()

        self.pu_a.refresh_from_db()
        self.assertEqual(self.pu_a.operational_status, OperationalStatus.REPORT_OVERDUE)
        self.assertEqual(result["flagged"], 1)

        from notifications.models import Notification

        self.assertTrue(Notification.objects.filter(recipient=self.admin, notification_type="report_overdue").exists())

    def test_recent_reporting_polling_unit_is_not_flagged(self):
        from geography.models import OperationalStatus

        self.pu_a.operational_status = OperationalStatus.ACTIVE_REPORTING
        self.pu_a.save()
        Report.objects.create(
            client_generated_id="22222222-2222-2222-2222-222222222222",
            polling_unit=self.pu_a,
            official=self.official,
            operational_status="active_reporting",
            device_captured_at=timezone.now() - timedelta(hours=1),
        )

        check_overdue_polling_units()

        self.pu_a.refresh_from_db()
        self.assertEqual(self.pu_a.operational_status, OperationalStatus.ACTIVE_REPORTING)
