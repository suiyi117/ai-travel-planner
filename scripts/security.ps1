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

Write-Host "== Secret scan =="
if (Get-Command detect-secrets -ErrorAction SilentlyContinue) {
    $secretReport = detect-secrets scan --exclude-files '(^|/)(docs/assets/.*)$' --exclude-lines 'integrity="sha256-' | ConvertFrom-Json
    $findings = @($secretReport.results.PSObject.Properties)
    if ($findings.Count -gt 0) {
        $secretReport.results | ConvertTo-Json -Depth 10
        throw "Potential secrets found. Review findings before merging."
    }
    Write-Host "No potential secrets found."
} else {
    Write-Warning "detect-secrets not found; install dev dependencies with: pip install -r requirements-dev.txt"
}

Write-Host ""
Write-Host "== Python dependency audit =="
if (Get-Command pip-audit -ErrorAction SilentlyContinue) {
    Invoke-Checked pip-audit -r requirements.txt
} else {
    Write-Warning "pip-audit not found; install dev dependencies with: pip install -r requirements-dev.txt"
}

Write-Host ""
Write-Host "Security checks completed."
