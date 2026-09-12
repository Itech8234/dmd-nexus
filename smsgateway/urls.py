from django.urls import path

from .views import SmsInboundWebhookView, SmsTestSendView

urlpatterns = [
    path("inbound/", SmsInboundWebhookView.as_view(), name="sms-inbound-webhook"),
    path("test-send/", SmsTestSendView.as_view(), name="sms-test-send"),
]
