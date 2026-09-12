from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Role

from .models import Conversation, ConversationMember, Message

User = get_user_model()


class DirectConversationTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.SUPER_ADMIN)
        self.coord = User.objects.create_user(username="coord1", password="pass12345!", role=Role.LGA_COORDINATOR)
        self.client.force_authenticate(user=self.admin)

    def test_direct_conversation_is_found_or_created_idempotently(self):
        first = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json")
        second = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(Conversation.objects.count(), 1)

    def test_message_send_and_list(self):
        conv = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json").data
        resp = self.client.post("/api/v1/messages/", {"conversation": conv["id"], "body": "hello"}, format="json")
        self.assertEqual(resp.status_code, 201)

        listing = self.client.get(f"/api/v1/messages/?conversation={conv['id']}")
        self.assertEqual(listing.data["count"], 1)
        self.assertEqual(listing.data["results"][0]["body"], "hello")

    def test_sending_a_message_notifies_the_other_member(self):
        from notifications.models import Notification

        conv = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json").data
        self.client.post("/api/v1/messages/", {"conversation": conv["id"], "body": "please review this incident"}, format="json")

        notif = Notification.objects.filter(recipient=self.coord, notification_type="message").first()
        self.assertIsNotNone(notif)
        self.assertIn("please review", notif.body)
        # The sender should not notify themselves.
        self.assertFalse(Notification.objects.filter(recipient=self.admin, notification_type="message").exists())

    def test_message_resubmit_same_client_id_does_not_duplicate(self):
        conv = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json").data
        client_id = "11111111-1111-1111-1111-111111111111"
        payload = {"conversation": conv["id"], "body": "retry-safe", "client_generated_id": client_id}
        self.client.post("/api/v1/messages/", payload, format="json")
        self.client.post("/api/v1/messages/", payload, format="json")
        self.assertEqual(Message.objects.filter(conversation_id=conv["id"]).count(), 1)

    def test_user_cannot_see_conversation_they_are_not_a_member_of(self):
        outsider = User.objects.create_user(username="outsider", password="pass12345!", role=Role.FIELD_OFFICIAL)
        conv = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json").data

        self.client.force_authenticate(user=outsider)
        resp = self.client.get("/api/v1/conversations/")
        self.assertEqual(resp.data["count"], 0)

    def test_non_member_cannot_post_to_a_conversation(self):
        outsider = User.objects.create_user(username="outsider", password="pass12345!", role=Role.FIELD_OFFICIAL)
        conv = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json").data

        self.client.force_authenticate(user=outsider)
        resp = self.client.post("/api/v1/messages/", {"conversation": conv["id"], "body": "spam"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_non_member_cannot_read_conversation_messages(self):
        outsider = User.objects.create_user(username="outsider", password="pass12345!", role=Role.FIELD_OFFICIAL)
        conv = self.client.post("/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json").data

        self.client.force_authenticate(user=outsider)
        resp = self.client.get(f"/api/v1/messages/?conversation={conv['id']}")
        self.assertEqual(resp.data["count"], 0)


class BroadcastGroupTests(APITestCase):
    """
    The admin-created "all officials in one group" broadcast channel
    (Conversation.MemberPolicy.AUTO_ALL) plus its member reconciliation
    endpoint.
    """

    def setUp(self):
        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.SUPER_ADMIN)
        self.coord = User.objects.create_user(username="coord1", password="pass12345!", role=Role.LGA_COORDINATOR)
        self.official = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.client.force_authenticate(user=self.admin)

    def _broadcast(self, title="All Officials"):
        return self.client.post("/api/v1/conversations/broadcast/", {"title": title}, format="json")

    def test_broadcast_group_contains_all_active_users(self):
        resp = self._broadcast()
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["is_group"])
        self.assertEqual(resp.data["member_policy"], "auto_all")

        member_ids = set(
            ConversationMember.objects.filter(conversation_id=resp.data["id"]).values_list("user_id", flat=True)
        )
        self.assertEqual(member_ids, set(User.objects.filter(is_active=True).values_list("id", flat=True)))

    def test_broadcast_is_idempotent_per_title(self):
        first = self._broadcast()
        second = self._broadcast()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(Conversation.objects.filter(is_group=True).count(), 1)

    def test_field_official_cannot_broadcast(self):
        self.client.force_authenticate(user=self.official)
        resp = self._broadcast()
        self.assertEqual(resp.status_code, 403)

    def test_sync_members_reconciles_active_users(self):
        conv_id = self._broadcast().data["id"]

        # A new staff member registers and an existing one is deactivated.
        newcomer = User.objects.create_user(username="new1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.official.is_active = False
        self.official.save(update_fields=["is_active"])

        resp = self.client.post(f"/api/v1/conversations/{conv_id}/sync_members/", format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["added"], 1)
        self.assertEqual(resp.data["removed"], 1)

        member_ids = set(
            ConversationMember.objects.filter(conversation_id=conv_id).values_list("user_id", flat=True)
        )
        self.assertIn(newcomer.id, member_ids)
        self.assertNotIn(self.official.id, member_ids)

    def test_sync_members_rejected_for_manual_conversation(self):
        conv = self.client.post(
            "/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json"
        ).data
        resp = self.client.post(f"/api/v1/conversations/{conv['id']}/sync_members/", format="json")
        self.assertEqual(resp.status_code, 400)


class ReadStateAndSummaryTests(APITestCase):
    """
    Unread badges (last_read_at), the mark_read endpoint (which also closes
    the related "New Message" notifications) and the cross-dashboard
    /conversations/summary/ counts.
    """

    def setUp(self):
        self.admin = User.objects.create_user(username="admin1", password="pass12345!", role=Role.SUPER_ADMIN)
        self.coord = User.objects.create_user(username="coord1", password="pass12345!", role=Role.LGA_COORDINATOR)
        self.official = User.objects.create_user(username="field1", password="pass12345!", role=Role.FIELD_OFFICIAL)
        self.client.force_authenticate(user=self.admin)
        self.conv = self.client.post(
            "/api/v1/conversations/direct/", {"user_id": str(self.coord.id)}, format="json"
        ).data

    def _admin_sends(self, body="hello there"):
        return self.client.post(
            "/api/v1/messages/", {"conversation": self.conv["id"], "body": body}, format="json"
        )

    def test_mark_read_updates_last_read_and_closes_message_notifications(self):
        from notifications.models import Notification

        self._admin_sends()
        self.client.force_authenticate(user=self.coord)

        summary_before = self.client.get("/api/v1/conversations/summary/")
        self.assertEqual(summary_before.data["unread_messages_total"], 1)
        self.assertEqual(summary_before.data["unread_by_conversation"][self.conv["id"]], 1)
        self.assertEqual(summary_before.data["unread_notifications"], 1)

        resp = self.client.post(f"/api/v1/conversations/{self.conv['id']}/mark_read/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["marked_read"])

        membership = self.coord.conversation_memberships.get(conversation_id=self.conv["id"])
        self.assertIsNotNone(membership.last_read_at)

        notif = Notification.objects.get(recipient=self.coord, notification_type="message")
        self.assertTrue(notif.is_read)

        summary_after = self.client.get("/api/v1/conversations/summary/")
        self.assertEqual(summary_after.data["unread_messages_total"], 0)
        self.assertEqual(summary_after.data["unread_notifications"], 0)

    def test_summary_excludes_own_messages(self):
        self.client.force_authenticate(user=self.coord)
        self.client.post(
            "/api/v1/messages/", {"conversation": self.conv["id"], "body": "my own words"}, format="json"
        )
        summary = self.client.get("/api/v1/conversations/summary/")
        self.assertEqual(summary.data["unread_messages_total"], 0)

    def test_contacts_exclude_self_and_inactive_users(self):
        User.objects.create_user(username="ghost", password="pass12345!", role=Role.FIELD_OFFICIAL, is_active=False)
        resp = self.client.get("/api/v1/conversations/contacts/")
        self.assertEqual(resp.status_code, 200)
        usernames = {u["username"] for u in resp.data}
        self.assertIn("coord1", usernames)
        self.assertIn("field1", usernames)
        self.assertNotIn("admin1", usernames)  # never yourself
        self.assertNotIn("ghost", usernames)  # inactive users are hidden
