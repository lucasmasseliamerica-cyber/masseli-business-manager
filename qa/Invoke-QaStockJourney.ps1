# C1 fixture-specific opt-in. No C2, financial writes, admin key, fixture creation or automatic resume.
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ValidatedCodeSha,
    [Parameter(Mandatory=$true)][string]$CatalogFile,
    [switch]$PreflightOnly,
    [switch]$ExclusiveWindowConfirmed,
    [ValidateRange(1,30)][int]$ExclusiveWindowMinutes=20,
    [switch]$ReadOnlyRecovery,
    [string]$RecoveryFile,
    [switch]$ValidateLauncherOnly
)
$ErrorActionPreference='Stop'
$exclusiveAt=[DateTime]::UtcNow # Prompts/setup consume the confirmed window; never extend it afterwards.
$stage='BOOTSTRAP'; $report=$null; $exitCode=2; $pushed=$false; $locked=$false; $mutex=$null; $hash=$null; $checkpoint=$null
$previous=@{}; $nativePreference=Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
$previousNative=if ($null -ne $nativePreference) { $nativePreference.Value } else { $null }
$bindings=@('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD',
    'QA_STOCK_ITEM_ID','QA_STOCK_SOURCE_LOCATION_ID','QA_STOCK_TARGET_LOCATION_ID','QA_STOCK_CATALOG_FILE','QA_STOCK_VALIDATED_CODE_SHA',
    'QA_STOCK_C1_AUTHORIZED','QA_STOCK_EXCLUSIVE_WINDOW','QA_STOCK_EXCLUSIVE_AT','QA_STOCK_EXCLUSIVE_UNTIL','QA_STOCK_PRIVATE_DIR','QA_STOCK_PRIVATE_DIRECTORY_ACL')
try {
    Set-PSDebug -Off
    . (Join-Path $PSScriptRoot 'stock-launcher-core.ps1')
    if ($null -ne $nativePreference) { $PSNativeCommandUseErrorActionPreference=$false }
    foreach ($name in $bindings) { $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw [InvalidOperationException]::new('C1_PLATFORM') }
    Push-Location (Split-Path $PSScriptRoot -Parent); $pushed=$true
    $stage='GIT'
    $r=Invoke-QaSaleNative git @('branch','--show-current')
    if ($r.ExitCode -ne 0 -or ($r.Output -join '') -ne 'automation/nexalvo-qa-actions') { throw [InvalidOperationException]::new('C1_GIT') }
    $r=Invoke-QaSaleNative git @('status','--porcelain=v1','--untracked-files=normal')
    if ($r.ExitCode -ne 0 -or $r.Output.Count -ne 0) { throw [InvalidOperationException]::new('C1_GIT') }
    $r=Invoke-QaSaleNative git @('merge-base','--is-ancestor',$ValidatedCodeSha,'HEAD')
    if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C1_GIT') }
    $r=Invoke-QaSaleNative git @('diff','--name-only',"$ValidatedCodeSha..HEAD")
    if ($r.ExitCode -ne 0 -or @($r.Output | Where-Object { $_ -and -not $_.StartsWith('docs/') }).Count -gt 0) { throw [InvalidOperationException]::new('C1_GIT') }
    $stage='MODE'
    if (($ReadOnlyRecovery -and -not $RecoveryFile) -or ($RecoveryFile -and -not $ReadOnlyRecovery) -or ($PreflightOnly -and $ReadOnlyRecovery)) { throw [InvalidOperationException]::new('C1_MODE') }
    if (-not $ValidateLauncherOnly -and -not $PreflightOnly -and -not $ReadOnlyRecovery -and -not $ExclusiveWindowConfirmed) { throw [InvalidOperationException]::new('C1_WINDOW') }
    $stage='CATALOG'; $catalog=[IO.Path]::GetFullPath($CatalogFile)
    if (-not (Test-Path -LiteralPath $catalog -PathType Leaf)) { throw [InvalidOperationException]::new('C1_CATALOG') }
    $stage='NODE'; $r=Invoke-QaSaleNative node @('-p','parseInt(process.versions.node)')
    if ($r.ExitCode -ne 0 -or ($r.Output -join '') -notmatch '^\d+$' -or [int]($r.Output -join '') -lt 22) { throw [InvalidOperationException]::new('C1_NODE') }
    $stage='MUTEX'; $mutex=[Threading.Mutex]::new($false,'Local\NEXALVOStockC1JourneyTEST')
    try { $locked=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked=$true; throw [InvalidOperationException]::new('C1_ABANDONED') }
    if (-not $locked) { throw [InvalidOperationException]::new('C1_LOCKED') }
    if ($ReadOnlyRecovery) {
        $stage='PRIVATE_PATH'; $checkpoint=Resolve-QaStockRecovery -RecoveryFile $RecoveryFile
        $privateDirectory=Split-Path $checkpoint -Parent
        $stage='CHECKPOINT_HASH'; $hash=(Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash
    }
    if ($ValidateLauncherOnly) {
        $report=[pscustomobject]@{scope='C1_WINDOWS_LAUNCHER';status='PASS';code='C1_LOCAL_LAUNCHER_READY';supabase_requests=0;stock_requests_forwarded=0;full_homologation=$false}
        $exitCode=0
    } else {
        $stage='CATALOG'
        $probe="import {readFileSync} from 'node:fs'; import {validateStockCatalog} from './qa/stock-journey-core.mjs'; import {c1Precision,c1AuditContract} from './qa/stock-c1-protocol.mjs'; const c=validateStockCatalog(JSON.parse(readFileSync(process.argv[2],'utf8'))); c1Precision(c); c1AuditContract(c);"
        $r=Invoke-QaSaleNative node @('--input-type=module','-',$catalog) -InputText $probe
        if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C1_CATALOG') }
        if (-not $PreflightOnly -and -not $ReadOnlyRecovery) {
            $stage='CHECKPOINT_SCAN'
            foreach ($dir in @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'nexalvo-stock-c1-*' -ErrorAction Stop)) {
                if (Test-Path -LiteralPath (Join-Path $dir.FullName 'stock-recovery.json')) { throw [InvalidOperationException]::new('C1_PREVIOUS_CHECKPOINT') }
            }
            $stage='DEPENDENCIES'
            $r=Invoke-QaSaleNative node @('--input-type=module','-') -InputText "import {existsSync} from 'node:fs'; import {chromium} from 'playwright'; if(!existsSync(process.env.NEXALVO_QA_CHROMIUM_PATH||chromium.executablePath()))process.exit(2);"
            if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C1_BROWSER_DEPENDENCIES') }
            $stage='PRIVATE_PATH'; $privateDirectory=Join-Path ([IO.Path]::GetTempPath()) ('nexalvo-stock-c1-'+[Guid]::NewGuid().ToString())
            if (Test-Path -LiteralPath $privateDirectory) { throw [InvalidOperationException]::new('C1_DIRECTORY_EXISTS') }
            [void][IO.Directory]::CreateDirectory($privateDirectory)
            $stage='PRIVATE_ACL'; Set-QaSaleNewPrivateAcl -Directory $privateDirectory
            $checkpoint=Join-Path $privateDirectory 'stock-recovery.json'
        }
        $stage='CREDENTIALS'
        foreach ($name in $bindings[0..5]) {
            if ($name -eq 'QA_SUPABASE_URL') { [Environment]::SetEnvironmentVariable($name,'https://msinksoilkluooxenecy.supabase.co','Process'); continue }
            if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name,'Process'))) { continue }
            $secure=Read-Host "Enter $name (hidden; process only)" -AsSecureString; $ptr=[IntPtr]::Zero
            try { $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); [Environment]::SetEnvironmentVariable($name,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr),'Process') }
            finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; $secure.Dispose() }
        }
        $stage='RUNNER_ENV'
        $values=@{QA_STOCK_ITEM_ID='6ebfef52-f6c2-4561-b2ac-b3d4bfca1c5f'; QA_STOCK_SOURCE_LOCATION_ID='f06c0bdd-8c55-4dc2-93b3-5ffcc085206f'; QA_STOCK_TARGET_LOCATION_ID='d524ae32-48b8-497c-a2ab-9b4777c44f6d';
            QA_STOCK_CATALOG_FILE=$catalog;QA_STOCK_VALIDATED_CODE_SHA=$ValidatedCodeSha;QA_STOCK_PRIVATE_DIR=$privateDirectory;QA_STOCK_PRIVATE_DIRECTORY_ACL='CURRENT_USER_ONLY';
            QA_STOCK_C1_AUTHORIZED='';QA_STOCK_EXCLUSIVE_WINDOW='';QA_STOCK_EXCLUSIVE_AT='';QA_STOCK_EXCLUSIVE_UNTIL=''}
        if (-not $PreflightOnly -and -not $ReadOnlyRecovery) {
            # The switch is the operator's explicit attestation, never inferred from CI/preflight.
            $at=$exclusiveAt
            $values.QA_STOCK_C1_AUTHORIZED='TEST_ONLY_EXPLICIT_C1_20261022';$values.QA_STOCK_EXCLUSIVE_WINDOW='TEST_ONLY_C1_EXCLUSIVE_WINDOW'
            $values.QA_STOCK_EXCLUSIVE_AT=$at.ToString('o');$values.QA_STOCK_EXCLUSIVE_UNTIL=$at.AddMinutes($ExclusiveWindowMinutes).ToString('o')
        }
        foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name,$values[$name],'Process') }
        $arguments=@('qa/stock-journey.TEST.mjs')
        if ($ReadOnlyRecovery) { $arguments+=@('--reconcile-readonly',$checkpoint) } elseif ($PreflightOnly) { $arguments+='--preflight' } else { $arguments+='--execute' }
        $stage='RUNNER'; $r=Invoke-QaSaleNative node $arguments
        $stage='REPORT'; $encoded=$r.Output -join "`n"
        if ($r.ExitCode -notin @(0,2) -or $encoded -match 'Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|sb_secret_|@|-----BEGIN|[A-Za-z]:\\') { throw [InvalidOperationException]::new('C1_REPORT') }
        $report=$encoded | ConvertFrom-Json
        if ($report.status -notin @('PASS','BLOCKED') -or $report.scope -notin @('C1_REAL_TEST_STOCK','C1_READONLY_PREFLIGHT','C1_READONLY_RECOVERY')) { throw [InvalidOperationException]::new('C1_REPORT') }
        $exitCode=$r.ExitCode
    }
} catch {
    if (Get-Command Get-QaStockLauncherFailure -CommandType Function -ErrorAction SilentlyContinue) { $report=Get-QaStockLauncherFailure -Stage $stage }
    else { $report=[pscustomobject]@{scope='C1_WINDOWS_LAUNCHER';status='BLOCKED';code='C1_WINDOWS_BOOTSTRAP_BLOCKED';stage='BOOTSTRAP';full_homologation=$false} }
    $exitCode=2
}
finally {
    if ($null -ne $hash -and $checkpoint) {
        try { if ((Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -ne $hash) { throw [InvalidOperationException]::new('C1_CHANGED') } }
        catch { $report=Get-QaStockLauncherFailure -Stage 'CHECKPOINT_VERIFY';$exitCode=2 }
    }
    foreach ($name in $bindings) { if ($previous.ContainsKey($name)) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') } }
    if ($null -ne $nativePreference) { $PSNativeCommandUseErrorActionPreference=$previousNative }
    if ($locked) { try { $mutex.ReleaseMutex() } catch { $report=Get-QaStockLauncherFailure -Stage 'CLEANUP';$exitCode=2 } }
    if ($null -ne $mutex) { $mutex.Dispose() }
    if ($pushed) { Pop-Location }
}
$report | ConvertTo-Json -Depth 12
exit $exitCode
