# C-Jornada READ ONLY. No stock writes, fixture creation, dependency installation or checkpoint.
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ValidatedCodeSha,
    [Parameter(Mandatory=$true)][Guid]$FixtureItemId,
    [Parameter(Mandatory=$true)][Guid]$SourceLocationId,
    [Parameter(Mandatory=$true)][Guid]$TargetLocationId,
    [Parameter(Mandatory=$true)][string]$CatalogFile,
    [switch]$ValidateLauncherOnly
)
$ErrorActionPreference='Stop'
$stage='BOOTSTRAP'; $pushed=$false; $previous=@{}; $report=$null; $exitCode=2
$nativePreference=Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
$previousNative=if ($null -ne $nativePreference) { $nativePreference.Value } else { $null }
$bindings=@('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD',
    'QA_STOCK_ITEM_ID','QA_STOCK_SOURCE_LOCATION_ID','QA_STOCK_TARGET_LOCATION_ID','QA_STOCK_CATALOG_FILE')
try {
    Set-PSDebug -Off
    . (Join-Path $PSScriptRoot 'sale-launcher-core.ps1') # Reuse only the tested native-command helper.
    if ($null -ne $nativePreference) { $PSNativeCommandUseErrorActionPreference=$false }
    foreach ($name in $bindings) { $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw [InvalidOperationException]::new('C_PLATFORM') }
    Push-Location (Split-Path $PSScriptRoot -Parent); $pushed=$true
    $stage='GIT'
    $r=Invoke-QaSaleNative git @('branch','--show-current')
    if ($r.ExitCode -ne 0 -or ($r.Output -join '') -ne 'automation/nexalvo-qa-actions') { throw [InvalidOperationException]::new('C_GIT') }
    $r=Invoke-QaSaleNative git @('status','--porcelain=v1','--untracked-files=normal')
    if ($r.ExitCode -ne 0 -or $r.Output.Count -ne 0) { throw [InvalidOperationException]::new('C_GIT') }
    $r=Invoke-QaSaleNative git @('merge-base','--is-ancestor',$ValidatedCodeSha,'HEAD')
    if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C_GIT') }
    $r=Invoke-QaSaleNative git @('diff','--name-only',"$ValidatedCodeSha..HEAD")
    if ($r.ExitCode -ne 0 -or @($r.Output | Where-Object { $_ -and -not $_.StartsWith('docs/') }).Count -gt 0) { throw [InvalidOperationException]::new('C_GIT') }
    $stage='MODE'
    if ($FixtureItemId -eq [Guid]::Empty -or $SourceLocationId -eq [Guid]::Empty -or $TargetLocationId -eq [Guid]::Empty -or @($FixtureItemId,$SourceLocationId,$TargetLocationId | Select-Object -Unique).Count -ne 3) { throw [InvalidOperationException]::new('C_MODE') }
    $stage='CATALOG'; $catalog=[IO.Path]::GetFullPath($CatalogFile)
    if (-not (Test-Path -LiteralPath $catalog -PathType Leaf)) { throw [InvalidOperationException]::new('C_CATALOG') }
    $stage='NODE'; $r=Invoke-QaSaleNative node @('-p','parseInt(process.versions.node)')
    if ($r.ExitCode -ne 0 -or ($r.Output -join '') -notmatch '^\d+$' -or [int]($r.Output -join '') -lt 22) { throw [InvalidOperationException]::new('C_NODE') }
    if ($ValidateLauncherOnly) {
        $report=[pscustomobject]@{scope='C_WINDOWS_READONLY_LAUNCHER';status='PASS';code='C_LOCAL_LAUNCHER_READY';supabase_requests=0;persistent_authorized=$false}
        $exitCode=0
    } else {
        # Reject stale/drifted/invalid catalogs offline before requesting any credentials.
        $stage='CATALOG'
        $probe="import {readFileSync} from 'node:fs'; import {validateStockCatalog} from './qa/stock-journey-core.mjs'; validateStockCatalog(JSON.parse(readFileSync(process.argv[2],'utf8')));"
        $r=Invoke-QaSaleNative node @('--input-type=module','-',$catalog) -InputText $probe
        if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C_CATALOG') }
        $stage='CREDENTIALS'
        foreach ($name in $bindings[0..5]) {
            if ($name -eq 'QA_SUPABASE_URL') { [Environment]::SetEnvironmentVariable($name,'https://msinksoilkluooxenecy.supabase.co','Process'); continue }
            if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name,'Process'))) { continue }
            $secure=Read-Host "Enter $name (hidden; process only)" -AsSecureString; $ptr=[IntPtr]::Zero
            try { $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); [Environment]::SetEnvironmentVariable($name,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr),'Process') }
            finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; $secure.Dispose() }
        }
        [Environment]::SetEnvironmentVariable('QA_STOCK_ITEM_ID',$FixtureItemId.ToString(),'Process')
        [Environment]::SetEnvironmentVariable('QA_STOCK_SOURCE_LOCATION_ID',$SourceLocationId.ToString(),'Process')
        [Environment]::SetEnvironmentVariable('QA_STOCK_TARGET_LOCATION_ID',$TargetLocationId.ToString(),'Process')
        [Environment]::SetEnvironmentVariable('QA_STOCK_CATALOG_FILE',$catalog,'Process')
        $stage='RUNNER'; $r=Invoke-QaSaleNative node @('qa/stock-preflight-readonly.TEST.mjs')
        $stage='REPORT'; $encoded=$r.Output -join "`n"
        if ($r.ExitCode -notin @(0,2) -or $encoded -match 'Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|sb_secret_|@|-----BEGIN') { throw [InvalidOperationException]::new('C_REPORT') }
        $report=$encoded | ConvertFrom-Json
        if ($report.scope -ne 'C_JOURNEY_AUTHENTICATED_READONLY_PREFLIGHT' -or $report.status -notin @('PASS','BLOCKED') -or $report.persistent_authorized -ne $false) { throw [InvalidOperationException]::new('C_REPORT') }
        $exitCode=$r.ExitCode
    }
} catch {
    # Fixed stage allowlist. Never serialize exception text, paths, identities or environment.
    if ($stage -notin @('BOOTSTRAP','GIT','MODE','CATALOG','NODE','CREDENTIALS','RUNNER','REPORT')) { $stage='BOOTSTRAP' }
    $report=[pscustomobject]@{scope='C_WINDOWS_READONLY_LAUNCHER';status='BLOCKED';code=('C_WINDOWS_'+$stage+'_BLOCKED');stage=$stage;persistent_authorized=$false}; $exitCode=2
} finally {
    $cleanupFailed=$false
    foreach ($name in $previous.Keys) { try { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') } catch { $cleanupFailed=$true } }
    $previous.Clear()
    try { if ($pushed) { Pop-Location } } catch { $cleanupFailed=$true }
    try { if ($null -ne $nativePreference) { $PSNativeCommandUseErrorActionPreference=$previousNative } } catch { $cleanupFailed=$true }
    if ($cleanupFailed) { $report=[pscustomobject]@{scope='C_WINDOWS_READONLY_LAUNCHER';status='BLOCKED';code='C_WINDOWS_CLEANUP_BLOCKED';stage='CLEANUP';persistent_authorized=$false}; $exitCode=2 }
}
$report | ConvertTo-Json -Depth 8 -Compress
exit $exitCode
