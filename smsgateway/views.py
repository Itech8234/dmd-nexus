import hmac

from django.conf import settings
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPrivileged

from .models import InboundSmsMessage, PendingSmsSubmission
from .serializers import InboundSmsMessageSerializer, PendingSmsSubmissionSerializer
from .services import approve_pending_submission, handle_inbound_sms, reject_pending_submission, send_outbound_sms


class SmsTestSendView(APIView):
    """
    Admin self-test for the configured outbound SMS backend. Sends a short
    test message to the requesting admin's own phone (or any number they
    provide). Makes the "SMS must be complete" story verifiable end-to-end.
    """

    permission_classes = [IsPrivileged]

    def post(self, request):
        phone = (request.data.get("phone") or "").strip() or getattr(request.user, "phone_number", "")
        if not phone:
            return Response(
                {"detail": "Provide a recipient phone number or set one on your account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        message = (request.data.get("message") or "").strip() or "DMD Y-COMPS test message — SMS gateway is working."
        try:
            result = send_outbound_sms(phone, message)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"detail": f"SMS send failed: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"sent": True, "to": phone, "result": result})


class SmsInboundWebhookView(APIView):
    """
    Gateway-agnostic inbound webhook. Not JWT-authenticated (SMS gateways
    can't hold a user session) — instead protected by a shared secret
    header, since this endpoint can create pending field submissions and
    must not be open to the public internet unauthenticated.

    Accepts a generic {"from": "...", "text": "...", "message_id": "..."}
    body; adapt the field names here if your chosen gateway's webhook
    shape differs (Africa's Talking, Termii, Twilio, etc. all vary).
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = request.headers.get("X-YCOMPS-SMS-SECRET", "").encode("utf-8")
        expected = settings.SMS_WEBHOOK_SECRET.encode("utf-8")
        if not expected or not hmac.compare_digest(secret, expected):
            return Response({"detail": "Invalid or missing webhook secret."}, status=status.HTTP_403_FORBIDDEN)

        sender = request.data.get("from") or request.data.get("sender") or ""
        body = request.data.get("text") or request.data.get("message") or ""
        gateway_message_id = str(request.data.get("message_id") or request.data.get("id") or "")

        if not sender or not body:
            return Response({"detail": "Missing 'from'/'text' fields."}, status=status.HTTP_400_BAD_REQUEST)

        message, pending = handle_inbound_sms(sender, body, gateway_message_id=gateway_message_id)

        # Always 200 back to the gateway once logged, regardless of parse
        # outcome — the gateway shouldn't retry-storm us over a message we
        # simply couldn't understand; that's a human follow-up, not a
        # delivery failure.
        return Response(
            {
                "received": True,
                "parse_result": message.parse_result,
                "pending_submission_id": str(pending.id) if pending else None,
            },
            status=status.HTTP_200_OK,
        )


class InboundSmsMessageViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = InboundSmsMessage.objects.select_related("matched_official__user").all()
    serializer_class = InboundSmsMessageSerializer
    permission_classes = [IsPrivileged]
    filterset_fields = ["parse_result", "sender_phone"]


class PendingSmsSubmissionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = PendingSmsSubmission.objects.select_related("official__user", "polling_unit__ward__lga", "source_message").all()
    serializer_class = PendingSmsSubmissionSerializer
    permission_classes = [IsPrivileged]
    filterset_fields = ["status", "submission_type", "assignment_mismatch"]

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        pending = self.get_object()
        if pending.status != "pending":
            return Response({"detail": "Already reviewed."}, status=status.HTTP_400_BAD_REQUEST)
        approve_pending_submission(pending, request.user, note=request.data.get("note", ""))
        return Response(PendingSmsSubmissionSerializer(pending).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        pending = self.get_object()
        if pending.status != "pending":
            return Response({"detail": "Already reviewed."}, status=status.HTTP_400_BAD_REQUEST)
        reject_pending_submission(pending, request.user, note=request.data.get("note", ""))
        return Response(PendingSmsSubmissionSerializer(pending).data)
