import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ycomps.settings')
import django
django.setup()
from django.template.loader import render_to_string
from accounts.emails import send_credentials_email
ctx = {'full_name': 'Test User', 'username': 'test.user', 'password': 'A1b2C3d4E5!', 'role': 'Field Official', 'login_url': 'http://localhost:3000/login', 'support_email': 'no-reply@ycomps.local', 'email': 't@t.co', 'year': 2026}
html = render_to_string('emails/credentials.html', ctx)
print('HTML len:', len(html))
print('has gradient:', 'linear-gradient' in html)
print('template ok')
