$base = "http://localhost:3999/api/v1"
# 1) GET to me/ through proxy
foreach ($m in @("GET","OPTIONS")) {
  try {
    $resp = Invoke-WebRequest -Uri "$base/auth/me/" -Method $m -UseBasicParsing -TimeoutSec 15
    "$m : HTTP $($resp.StatusCode) len=$($resp.RawContentLength)"
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "ERR" }
    "$m : $code $($_.Exception.Message)"
  }
}
# 2) POST token through proxy, follow redirects
$body = '{"username":"dmdadmin","password":"YCompsAdmin#2026"}'
try {
  $req = [System.Net.HttpWebRequest]::Create("$base/auth/token/")
  $req.Method = "POST"; $req.ContentType = "application/json"; $req.AllowAutoRedirect = $true
  $bytes = [Text.Encoding]::UTF8.GetBytes($body); $req.ContentLength = $bytes.Length
  $s = $req.GetRequestStream(); $s.Write($bytes,0,$bytes.Length); $s.Close()
  $resp = $req.GetResponse()
  $sr = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
  "POST follow: HTTP $([int]$resp.StatusCode) body=$($sr.Substring(0,[Math]::Min(60,$sr.Length)))"
} catch {
  if ($_.Exception.Response) { "POST follow: HTTP $([int]$_.Exception.Response.StatusCode)" } else { "POST follow: ERR $($_.Exception.Message)" }
}
