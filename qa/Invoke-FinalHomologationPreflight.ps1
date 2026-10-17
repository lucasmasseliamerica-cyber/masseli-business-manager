# Safe local/read-only entrypoint for the final NEXALVO TEST homologation package.
# It never applies SQL, deploys functions, resets passwords or enables persistent purchase tests.
[CmdletBinding()]
param(
    [string]$CatalogExportPath = '',
    [switch]$ConfirmTestProject,
    [switch]$AuthenticatedOwners
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$locationPushed = $false
try {
    Push-Location $repo
    $locationPushed = $true
    $branch = & git branch --show-current
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'automation/nexalvo-qa-actions') {
        throw 'The isolated QA branch is required.'
    }

    if ($CatalogExportPath) {
        $resolved = Resolve-Path -LiteralPath $CatalogExportPath
        if ($ConfirmTestProject) {
            & node qa/final-homologation-manifest.mjs --catalog $resolved.Path --assert-test-project
        } else {
            & node qa/final-homologation-manifest.mjs --catalog $resolved.Path
        }
    } else {
        & node qa/final-homologation-manifest.mjs
    }
    if ($LASTEXITCODE -ne 0 -and !($LASTEXITCODE -eq 2 -and -not $CatalogExportPath)) {
        throw "Final package preflight failed with exit code $LASTEXITCODE."
    }

    if ($AuthenticatedOwners) {
        & "$PSScriptRoot/Invoke-QaPreflight.ps1"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    if ($CatalogExportPath) {
        Write-Host 'PASS: local package and supplied TEST catalog passed the automated contract checks.'
    } else {
        Write-Host 'PASS: local package verified. Database catalog remains BLOCKED until a read-only export is supplied.'
    }
} finally {
    if ($locationPushed) { Pop-Location }
}
