from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Role

from .models import Notification, NotificationDevice

User = get_user_model()


class NotificationDeviceTests(APITestCase):
    """
    FCM token registration: the transport layer for tray notifications when
    the app is backgrounded. Tokens are upserted (a rotated token never
    duplicates a device row) and users can only ever see their own devices.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.other = User.objects.create_user(username="other1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.client.force_authenticate(user=self.user)

    def test_register_token(self):
        resp = self.client.post(
            "/api/v1/notification-devices/register/",
            {"fcm_token": "token-abc", "platform": "android", "device_id": "pixel-7"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        device = NotificationDevice.objects.get(fcm_token="token-abc")
        self.assertEqual(device.user, self.user)
        self.assertEqual(device.platform, "android")
        self.assertTrue(device.is_active)

    def test_reregistering_same_token_upserts_instead_of_duplicating(self):
        payload = {"fcm_token": "token-abc", "platform": "android"}
        self.client.post("/api/v1/notification-devices/register/", payload, format="json")
        self.client.post("/api/v1/notification-devices/register/", {**payload, "platform": "web"}, format="json")

        self.assertEqual(NotificationDevice.objects.count(), 1)
        self.assertEqual(NotificationDevice.objects.get().platform, "web")

    def test_list_only_own_devices(self):
        NotificationDevice.objects.create(user=self.user, fcm_token="mine")
        NotificationDevice.objects.create(user=self.other, fcm_token="theirs")

        resp = self.client.get("/api/v1/notification-devices/")
        self.assertEqual(resp.status_code, 200)
        tokens = {d["fcm_token"] for d in resp.data}
        self.assertEqual(tokens, {"mine"})

    def test_delete_token(self):
        NotificationDevice.objects.create(user=self.user, fcm_token="token-abc")

        resp = self.client.post(
            "/api/v1/notification-devices/delete-token/", {"fcm_token": "token-abc"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["deleted"], 1)
        self.assertFalse(NotificationDevice.objects.filter(fcm_token="token-abc").exists())

    def test_delete_token_requires_token(self):
        resp = self.client.post("/api/v1/notification-devices/delete-token/", {}, format="json")
        self.assertEqual(resp.status_code, 400)


class MarkReadFlowTests(APITestCase):
    """Reading a single notification shrinks the bell (badge_update push)."""

    def setUp(self):
        self.user = User.objects.create_user(username="coord1", password="pass12345!", role=Role.LGA_COORDINATOR)
        self.client.force_authenticate(user=self.user)

    def test_mark_read_flips_flag(self):
        notif = Notification.objects.create(
            recipient=self.user, notification_type="system_alert", title="Test alert"
        )
        resp = self.client.post(f"/api/v1/notifications/{notif.id}/mark_read/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["is_read"])
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

    def test_mark_all_read(self):
        Notification.objects.create(recipient=self.user, notification_type="system_alert", title="A")
        Notification.objects.create(recipient=self.user, notification_type="system_alert", title="B")
        resp = self.client.post("/api/v1/notifications/mark_all_read/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["marked_read"], 2)
        self.assertFalse(Notification.objects.filter(recipient=self.user, is_read=False).exists())
