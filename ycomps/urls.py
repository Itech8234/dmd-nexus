from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from geography.views import LGAViewSet, PollingUnitViewSet, StateViewSet, WardViewSet
from purequests.views import PollingUnitRequestViewSet
from officials.views import AssignmentViewSet, OfficialViewSet
from reports.views import ReportAttachmentViewSet, ReportCategoryViewSet, ReportViewSet
from incidents.views import IncidentCategoryViewSet, IncidentViewSet
from notifications.views import NotificationDeviceViewSet, NotificationViewSet
from auditlog.views import AuditLogViewSet
from smsgateway.views import InboundSmsMessageViewSet, PendingSmsSubmissionViewSet
from chatops.views import ConversationViewSet, MessageViewSet
from accounts.views import UserViewSet
from dashboard.api import AnalyticsView, DashboardSummaryView
from dashboard.views import healthz

router = DefaultRouter()
router.register("states", StateViewSet)
router.register("lgas", LGAViewSet)
router.register("wards", WardViewSet)
router.register("polling-units", PollingUnitViewSet, basename="pollingunit")
router.register("officials", OfficialViewSet)
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("report-categories", ReportCategoryViewSet)
router.register("reports", ReportViewSet, basename="report")
router.register("report-attachments", ReportAttachmentViewSet, basename="reportattachment")
router.register("incident-categories", IncidentCategoryViewSet, basename="incidentcategory")
router.register("incidents", IncidentViewSet, basename="incident")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("notification-devices", NotificationDeviceViewSet, basename="notification-device")
router.register("audit-logs", AuditLogViewSet, basename="auditlog")
router.register("sms-messages", InboundSmsMessageViewSet, basename="sms-message")
router.register("sms-pending", PendingSmsSubmissionViewSet, basename="sms-pending")
router.register("conversations", ConversationViewSet, basename="conversation")
router.register("messages", MessageViewSet, basename="message")
router.register("users", UserViewSet, basename="user")
router.register("pu-requests", PollingUnitRequestViewSet, basename="purequest")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/", include(router.urls)),
    path("api/v1/sms/", include("smsgateway.urls")),
    path("api/v1/dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("api/v1/analytics/", AnalyticsView.as_view(), name="dashboard-analytics"),
    path("healthz/", healthz, name="healthz"),
]
