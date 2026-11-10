# Interactive local-only reset of test employee accounts.
# Run on your Windows development PC, never on a production server.
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
$data = Join-Path $HOME ".meta-minds-portal"
$dbPath = Join-Path $data "portal.sqlite"
if (-not (Test-Path -LiteralPath $dbPath -PathType Leaf)) {
  throw "No local MetaMinds SQLite database found at $dbPath. No data was changed."
}
if ($env:CI -eq "true") {
  throw "Refusing to run employee cleanup in CI."
}
Write-Host ""
Write-Host "MetaMinds LOCAL development account reset" -ForegroundColor Cyan
Write-Host "Database: $dbPath"
Write-Host "The current CEO demo account and its credentials will be preserved."
Write-Host "Do NOT use this tool if this database contains real employee records."
$oldMode = $env:NODE_ENV
$oldData = $env:DATA_DIR
try {
  $env:NODE_ENV = "development"
  $env:DATA_DIR = $data
  Push-Location $project
  try {
    node scripts/cleanup-employee-accounts.mjs
    if ($LASTEXITCODE -ne 0) { throw "Preview failed. Nothing was deleted." }
    $confirm = Read-Host "To delete the previewed LOCAL TEST employees, type RESET TEST EMPLOYEES"
    if ($confirm -cne "RESET TEST EMPLOYEES") {
      Write-Host "Cancelled. No records were deleted."
      exit 0
    }
    node scripts/cleanup-employee-accounts.mjs --execute --confirm-disposable-data
    if ($LASTEXITCODE -ne 0) { throw "Cleanup failed. Review errors and backup before retrying." }
    Write-Host "Local test employee cleanup finished. Verify the CEO account and employee directory." -ForegroundColor Green
  } finally { Pop-Location }
} finally {
  $env:NODE_ENV = $oldMode
  $env:DATA_DIR = $oldData
}
