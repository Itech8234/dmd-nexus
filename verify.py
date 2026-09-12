import json, urllib.request
BASE = "http://localhost:8000/api/v1"
def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    payload = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, payload, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
# login
s, tok = call("POST", "/auth/token/", body={"username":"dmdadmin","password":"YCompsAdmin#2026"})
print("LOGIN", s)
if s != 200:
    print(tok)
    raise SystemExit
access = tok["access"]
# me
s, me = call("GET", "/auth/me/", access)
print("ME", s, me.get("username"), me.get("role"))
# list users (the page the button lives on)
s, users = call("GET", "/users/?page_size=200", access)
print("LIST_USERS", s, "count=", users.get("count") if isinstance(users, dict) else users)
# create user (what "New user"->Create does)
s, created = call("POST", "/users/", access, {"username":"field_fix","password":"FieldPass#2026","first_name":"Field","last_name":"Fix","role":"field_official"})
print("CREATE_USER", s, created if s!=201 else {"id": created.get("id"), "username": created.get("username"), "role": created.get("role")})
