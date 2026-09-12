$h = "-H Origin:http://localhost:3999 -H X-YCOMPS-Device-ID:e2e-test"
# 1) login
Set-Content token.json ("-sX POST http://localhost:8000/api/v1/auth/token/ $h -H ""Content-Type: application/json"" -d """"{""username":""dmdadmin"",""password":""YCompsAdmin#2026""}"""" -D token_hdr.txt")
$r = (curl.exe -sX POST http://localhost:8000/api/v1/auth/token/ -H "Origin: http://localhost:3999" -H "Content-Type: application/json" -H "X-YCOMPS-Device-ID: e2e-test" -d '{"username":"dmdadmin","password":"YCompsAdmin#2026"}')
$tok = ($r | Select-String -Pattern "\"access\":\"([^\"]+)\"" -AllMatches)
$access = $tok.MatchData[0][1]
Write-Output ("LOGIN_TOKEN_OBTAINED=" + ($access.Length -gt 10))
# 2) create user as the browser would (Origin header set), capture status + CORS header
Set-Content e2e_resp.txt (curl.exe -s -i -X POST http://localhost:8000/api/v1/users/ -H "Origin: http://localhost:3999" -H "Authorization: Bearer $access" -H "Content-Type: application/json" -H "X-YCOMPS-Device-ID: e2e-test" -d '{"username":"e2e_field","password":"E2EPass#2026","first_name":"E2E","last_name":"Field","role":"field_official"}')
