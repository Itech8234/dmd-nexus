"""
Y-COMPS Firebase Cloud Messaging (FCM) integration.

This is the *push* transport for notifications — i.e. "push the message
into the Android/iOS notification bar". The real-time, in-app messaging
and notification stream already runs over Django Channels WebSockets
(see ``chatops`` / ``notifications``); that is the authoritative
real-time channel while the client is open. FCM is layered on top to
reach users whose app is backgrounded or closed.

The Firebase Admin SDK is initialised lazily (and only when a service
account is configured), so environments without Firebase configured
(e.g. local SQLite dev) keep working unchanged.
"""
