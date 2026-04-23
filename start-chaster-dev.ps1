param(
  [string]$ApiHost = "127.0.0.1",
  [int]$ApiPort = 8010,
  [int]$DashboardPort = 5174
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $root "chaster-brain\scripts\dev_stack.py"

if (-not (Test-Path $launcher)) {
  Write-Error "Launcher not found: $launcher"
  exit 1
}

python $launcher --api-host $ApiHost --api-port $ApiPort --dashboard-port $DashboardPort
