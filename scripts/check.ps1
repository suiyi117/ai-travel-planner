$ErrorActionPreference = "Stop"

Write-Host "== Python syntax check =="
python -m compileall server.py services

Write-Host ""
Write-Host "== Python tests =="
python -m unittest discover -s tests -v

Write-Host ""
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "== JavaScript syntax check =="
    Get-ChildItem static -Filter *.js | ForEach-Object {
        node --check $_.FullName
    }
} else {
    Write-Warning "Node.js not found; skipped static/*.js syntax check."
}

Write-Host ""
Write-Host "All available checks passed."
