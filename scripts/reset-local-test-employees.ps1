# One-command local development fresh-start reset. Use only on a disposable test database.
# The Node runner refuses remote/prod environments, backs up SQLite + encryption key,
# retains the CEO demo identity, and verifies that employee, application and feed data are empty.
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Push-Location $project
try {
  npm run reset:employees
  if ($LASTEXITCODE -ne 0) { throw "Employee reset failed. Check the message above; no success is claimed." }
  Write-Host "MetaMinds employee reset verified. CEO account retained." -ForegroundColor Green
} finally {
  Pop-Location
}
