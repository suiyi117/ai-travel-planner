$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory=$true)]
        [string] $Command,
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]] $Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
}

Write-Host "== Python syntax check =="
Invoke-Checked python -m compileall server.py clients core planner routers schemas services

Write-Host ""
if (Get-Command ruff -ErrorAction SilentlyContinue) {
    Write-Host "== Python lint =="
    Invoke-Checked ruff check .
    Write-Host ""
} else {
    Write-Warning "ruff not found; skipped Python lint. Install dev dependencies with: pip install -r requirements-dev.txt"
}

if (Get-Command mypy -ErrorAction SilentlyContinue) {
    Write-Host "== Python type check =="
    Invoke-Checked mypy server.py clients core planner routers schemas services
    Write-Host ""
} else {
    Write-Warning "mypy not found; skipped Python type check. Install dev dependencies with: pip install -r requirements-dev.txt"
}

Write-Host "== Python tests =="
if (Get-Command coverage -ErrorAction SilentlyContinue) {
    Invoke-Checked coverage run -m unittest discover -s tests -v
    Invoke-Checked coverage report
} else {
    Invoke-Checked python -m unittest discover -s tests -v
}

Write-Host ""
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "== JavaScript syntax check =="
    Get-ChildItem static -Filter *.js -Recurse -File | ForEach-Object {
        Invoke-Checked node --check $_.FullName
    }

    $frontendTests = Get-ChildItem tests/frontend -Filter *.test.js -ErrorAction SilentlyContinue
    if ($frontendTests) {
        Write-Host "== Frontend unit tests =="
        $frontendTestArgs = @("--test") + @($frontendTests.FullName)
        Invoke-Checked node @frontendTestArgs
    }
} else {
    Write-Warning "Node.js not found; skipped static/*.js syntax check."
}

Write-Host ""
Write-Host "All available checks passed."
