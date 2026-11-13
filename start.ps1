$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path '.venv/Scripts/python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12+ is required.' }
    & '.venv/Scripts/python.exe' -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and retry.' }
$env:DB_PASSWORD = 'local-development-only'
& '.venv/Scripts/python.exe' -c "from db import connect; c=connect(False); q=c.cursor(); q.execute('SHOW DATABASES LIKE ''wikilens'''); print('Database connection ready')"
& '.venv/Scripts/python.exe' -c "from db import connect; c=connect(); q=c.cursor(); q.execute('SELECT value FROM metadata WHERE name=''dataset'''); assert q.fetchone()"
if ($LASTEXITCODE -ne 0) {
    & '.venv/Scripts/python.exe' ingest.py --limit 36
    if ($LASTEXITCODE -ne 0) { throw 'Import failed. Check the import output before retrying.' }
}
Write-Host 'Open http://127.0.0.1:8000 — keep this terminal open.'
& '.venv/Scripts/python.exe' server.py
