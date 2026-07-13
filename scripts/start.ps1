# AeroTravel one-click local start.
# Prefer project .conda Python, start server.py if needed, open browser.

$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "server.py"))) {
    Write-Host "[ERROR] server.py not found. Run start.bat from the repo root." -ForegroundColor Red
    exit 1
}

Set-Location $Root

function Test-AeroTravelHealth {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Test-PortListening {
    param([int]$Port = 8000)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        return ($null -ne $conn)
    } catch {
        return $false
    }
}

$python = $null
$condaPython = Join-Path $Root ".conda\python.exe"
if (Test-Path $condaPython) {
    $python = $condaPython
} else {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        $python = $cmd.Source
    }
}

if (-not $python) {
    Write-Host "[ERROR] Python not found. Install Python 3.10+ or use project .conda env." -ForegroundColor Red
    Write-Host "Manual: pip install -r requirements.txt ; python server.py" -ForegroundColor Yellow
    exit 1
}

$alreadyUp = $false
if (Test-AeroTravelHealth) { $alreadyUp = $true }
elseif (Test-PortListening -Port 8000) { $alreadyUp = $true }

if ($alreadyUp) {
    Write-Host "[OK] Port 8000 already has a service. Opening browser..." -ForegroundColor Green
} else {
    Write-Host "Python: $python" -ForegroundColor Cyan
    Write-Host "Starting AeroTravel backend in a new window..." -ForegroundColor Cyan

    Start-Process -FilePath $python -ArgumentList "server.py" -WorkingDirectory $Root -WindowStyle Normal

    $deadline = (Get-Date).AddSeconds(20)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-AeroTravelHealth) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        Write-Host "[ERROR] Server not ready within 20s. Check the Python console window and .env." -ForegroundColor Red
        Write-Host "Manual check: http://localhost:8000/api/health" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "[OK] Server is ready." -ForegroundColor Green
}

Start-Process "http://localhost:8000"
Write-Host "[OK] Opened http://localhost:8000" -ForegroundColor Green
Write-Host "Close the backend console window to stop the server." -ForegroundColor DarkGray
exit 0