$uri = "http://localhost:3999/api/v1/auth/me/"
$req = [System.Net.HttpWebRequest]::Create($uri)
$req.Method = "GET"; $req.AllowAutoRedirect = $false
$req.CookieContainer = New-Object System.Net.CookieContainer
try {
  $resp = $req.GetResponse()
  "status=$([int]$resp.StatusCode)"
} catch {
  if ($_.Exception.Response) {
    $r = $_.Exception.Response
    "status=$([int]$r.StatusCode)"
    foreach ($k in $r.Headers.AllKeys) { if ($k -eq "Location") { "Location=$($r.Headers[$k])" } }
  } else { "ERR $($_.Exception.Message)" }
}
