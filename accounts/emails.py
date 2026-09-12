"""
Credential delivery email - sends new-account credentials (username + a
one-time password) to the newly created user's registered email address
in a modern branded HTML template. Best-effort: never blocks account
creation if email is misconfigured.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger('accounts.email')


def role_label(role):
    from .models import Role
    return dict(Role.choices).get(role, role.replace('_', ' ').title())


def _context_for(user, password):
    return {
        'full_name': user.get_full_name() or user.username,
        'username': user.username,
        'password': password,
        'email': user.email,
        'role': role_label(user.role),
        'login_url': f"{settings.FRONTEND_BASE_URL.rstrip('/')}/login",
        'support_email': settings.DEFAULT_FROM_EMAIL,
        'year': 2026,
    }


def send_credentials_email(user, password, is_password_reset=False):
    """Email platform login credentials to user.email. Returns bool."""
    if not user.email:
        logger.warning('User %s has no email address; not emailed.', user.username)
        return False
    if not password:
        logger.warning('User %s created without a password; nothing to email.', user.username)
        return False
    subject = ('Your DMD Y-COMPS password has been reset' if is_password_reset
               else 'Your DMD Y-COMPS account credentials')
    context = _context_for(user, password)
    try:
        html = render_to_string('emails/credentials.html', context)
        text = render_to_string('emails/credentials.txt', context)
        msg = EmailMultiAlternatives(subject=subject, body=text,
                                     from_email=settings.DEFAULT_FROM_EMAIL,
                                     to=[user.email])
        msg.attach_alternative(html, 'text/html')
        msg.send(fail_silently=False)
        logger.info('Credentials email dispatched to %s (%s).', user.email, user.username)
        return True
    except Exception:
        logger.exception('Failed to send credentials email to %s.', user.email)
        return False


def send_password_reset_email(user, password):
    """Administrator-triggered password reset - email the new password."""
    return send_credentials_email(user, password, is_password_reset=True)
