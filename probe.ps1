$log = "probe.txt"
$lines = @()
foreach ($p in @(8000,8001)) {
  try { $r = Invoke-WebRequest -Uri "http://localhost:$p/healthz/" -UseBasicParsing -TimeoutSec 5; $lines += "port $p healthz: HTTP " + $r.StatusCode } catch { $lines += "port $p healthz: ERR " + $_.Exception.Message }
  try { $r = Invoke-WebRequest -Uri "http://localhost:$p/admin/login/" -UseBasicParsing -TimeoutSec 5; $lines += "port $p admin: HTTP " + $r.StatusCode } catch { $lines += "port $p admin: ERR " + $_.Exception.Message }
}
$lines | Set-Content -Path $log -Encoding utf8
