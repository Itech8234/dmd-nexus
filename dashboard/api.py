"""
Dashboard analytics + KPI endpoints. All figures are computed from real
application state (reports, incidents, polling units, assignments,
sync records) with the requesting user's geographic scope applied — nothing
is fabricated for display.
"""

from collections import Counter, OrderedDict

from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import IsCoordinatorOrAbove, scope_queryset_to_user
from geography.models import OperationalStatus, PollingUnit
from incidents.models import Incident
from reports.models import Report
from syncengine.models import SyncRecord


class DashboardSummaryView(APIView):
    """
    One aggregate for the command-centre KPI tiles (spec §17):
    Total Polling Units, Assigned Officials, Reports Received, Pending
    (unsynced) Reports, Overdue, Open/Critical Incidents, Reporting coverage.
    """
    permission_classes = [IsCoordinatorOrAbove]

    def get(self, request):
        user = request.user
        pus = scope_queryset_to_user(user, PollingUnit.objects.all(), lga_field="ward__lga", ward_field="ward")
        if user.role == Role.FIELD_OFFICIAL:
            reports = Report.objects.filter(official__user=user)
            incidents = Incident.objects.filter(reporter__user=user)
        else:
            reports = scope_queryset_to_user(
                user, Report.objects.all(), lga_field="polling_unit__ward__lga", ward_field="polling_unit__ward"
            )
            incidents = scope_queryset_to_user(
                user, Incident.objects.all(), lga_field="polling_unit__ward__lga", ward_field="polling_unit__ward"
            )

        total_pus = pus.count()
        assigned_count = pus.filter(assignments__status="active").distinct().count()

        from officials.models import Assignment
        assignments_qs = scope_queryset_to_user(
            user, Assignment.objects.filter(status="active"),
            lga_field="polling_unit__ward__lga",
            ward_field="polling_unit__ward",
        )
        active_officials = assignments_qs.values("official").distinct().count()

        reports_received = reports.count()
        pending_reports = reports.filter(sync_status__in=["saved_offline", "synchronizing"]).count()
        overdue = reports.filter(
            polling_unit__operational_status=OperationalStatus.REPORT_OVERDUE
        ).count()
        overdue_pus = pus.filter(operational_status=OperationalStatus.REPORT_OVERDUE).count()

        open_incidents = incidents.exclude(status__in=["resolved", "closed"]).count()
        critical_incidents = incidents.filter(severity="critical").exclude(status__in=["resolved", "closed"]).count()

        coverage = round((assigned_count / total_pus) * 100, 1) if total_pus else 0.0

        # Cross-dashboard comms visibility: unread chat + notification
        # counters so every dashboard surface shows messaging state.
        from chatops.models import Conversation, Message as ChatMessage
        from django.db.models import Count, F, Q
        from notifications.models import Notification

        chat_unread_rows = (
            ChatMessage.objects.filter(
                Q(conversation__members__user=user)
                & (
                    Q(conversation__members__last_read_at__isnull=True)
                    | Q(created_at__gt=F("conversation__members__last_read_at"))
                )
            )
            .exclude(sender=user)
            .values("conversation_id")
            .annotate(unread=Count("id"))
        )
        unread_by_conversation = {str(r["conversation_id"]): r["unread"] for r in chat_unread_rows}

        return Response({
            "total_polling_units": total_pus,
            "assigned_officials": assigned_count,
            "active_officials": active_officials,
            "reports_received": reports_received,
            "pending_reports": pending_reports,
            "overdue_reports": overdue_pus,
            "open_incidents": open_incidents,
            "critical_incidents": critical_incidents,
            "reporting_coverage": coverage,
            "reporting_coverage_pu_count": assigned_count,
            # Messaging / comms widget state (all dashboards).
            "unread_messages_total": sum(unread_by_conversation.values()),
            "unread_by_conversation": unread_by_conversation,
            "unread_notifications": Notification.objects.filter(recipient=user, is_read=False).count(),
            "total_conversations": Conversation.objects.filter(members__user=user).count(),
        })


class AnalyticsView(APIView):
    """
    Real-data analytics (spec §31): reports over time, reports by LGA,
    incidents by severity/status, sync performance. Geographic scope applied.
    """
    permission_classes = [IsCoordinatorOrAbove]

    def get(self, request):
        user = request.user
        if user.role == Role.FIELD_OFFICIAL:
            reports = Report.objects.filter(official__user=user)
            incidents = Incident.objects.filter(reporter__user=user)
            pus = PollingUnit.objects.filter(assignments__official__user=user, assignments__status="active")
        else:
            reports = scope_queryset_to_user(
                user, Report.objects.all(), lga_field="polling_unit__ward__lga", ward_field="polling_unit__ward"
            )
            incidents = scope_queryset_to_user(
                user, Incident.objects.all(), lga_field="polling_unit__ward__lga", ward_field="polling_unit__ward"
            )
            pus = scope_queryset_to_user(user, PollingUnit.objects.all(), lga_field="ward__lga", ward_field="ward")

        # Reports over time (last 14 days).
        from django.utils import timezone
        import datetime
        today = timezone.localdate()
        per_day = OrderedDict()
        for offset in reversed(range(14)):
            day = today - datetime.timedelta(days=offset)
            per_day[day.isoformat()] = 0
        for created in reports.values_list("device_captured_at", flat=True):
            if created:
                d = timezone.localtime(created).date()
                if d.isoformat() in per_day:
                    per_day[d.isoformat()] += 1

        # Reports by LGA.
        by_lga = Counter()
        for lga_name in reports.values_list("polling_unit__ward__lga__name", flat=True):
            if lga_name:
                by_lga[lga_name] += 1

        # Incidents by severity / status.
        by_severity = Counter()
        for s in incidents.values_list("severity", flat=True):
            by_severity[s] += 1
        by_status = Counter()
        for s in incidents.values_list("status", flat=True):
            by_status[s] += 1

        # LGA summary: total PUs, assigned, reports, coverage, open incidents.
        lga_summary = []
        for lga in pus.order_by("ward__lga__name").values_list("ward__lga__name", flat=True).distinct():
            lga_pus = pus.filter(ward__lga__name=lga)
            lga_total = lga_pus.count()
            lga_assigned = lga_pus.filter(assignments__status="active").distinct().count()
            lga_reports = reports.filter(polling_unit__ward__lga__name=lga).count()
            lga_open = incidents.filter(polling_unit__ward__lga__name=lga).exclude(status__in=["resolved", "closed"]).count()
            lga_summary.append({
                "lga": lga,
                "total_polling_units": lga_total,
                "assigned_polling_units": lga_assigned,
                "reports": lga_reports,
                "open_incidents": lga_open,
                "coverage": round((lga_assigned / lga_total) * 100, 1) if lga_total else 0.0,
            })
        lga_summary.sort(key=lambda x: x["lga"])

        # Sync performance (privileged-wide; devices aren't geographically scoped).
        sync_stats = None
        if user.is_privileged:
            succeeded = SyncRecord.objects.filter(status="succeeded").count()
            total = SyncRecord.objects.count()
            failed = SyncRecord.objects.filter(status="failed").count()
            duplicate = SyncRecord.objects.filter(status="duplicate").count()
            sync_stats = {
                "total": total,
                "succeeded": succeeded,
                "failed": failed,
                "duplicate": duplicate,
                "success_rate": round((succeeded / total) * 100, 1) if total else 0.0,
            }

        return Response({
            "reports_per_day": per_day,
            "reports_by_lga": dict(by_lga),
            "incidents_by_severity": dict(by_severity),
            "incidents_by_status": dict(by_status),
            "lga_summary": lga_summary,
            "sync": sync_stats,
            "total_polling_units": pus.count(),
        })
