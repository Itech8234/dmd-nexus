# The dashboard app now only contributes the JSON API (see ycomps/urls.py:
# /api/v1/dashboard/summary/ and /api/v1/analytics/) and /healthz/. The
# interactive frontend is served by the Next.js app, so there are no
# Django-served HTML routes here.
urlpatterns = []
