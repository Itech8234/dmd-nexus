from django.http import JsonResponse


def healthz(request):
    """
    Liveness/readiness probe used by load balancers and container healthchecks.
    Confirms the database is reachable and the app can serve requests. The
    frontend (Next.js) and any monitoring tooling call this endpoint.
    """
    from django.db import connection

    db_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        db_ok = False

    return JsonResponse({"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "unreachable"})
