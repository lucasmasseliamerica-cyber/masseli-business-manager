# TEST-only launcher. Read-only recovery never installs browsers, rewrites ACLs or checkpoint bytes.
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ValidatedCodeSha,
    [switch]$ExclusiveWindowConfirmed,
    [Parameter(Mandatory=$true)][Guid]$FixtureProductId,
    [Parameter(Mandatory=$true)][Guid]$LocationId,
    [Parameter(Mandatory=$true)][string]$CatalogFile,
    [switch]$PreflightOnly,
    [string]$RecoveryFile,
    [switch]$ReadOnlyRecovery,
    [switch]$ValidateLauncherOnly
)
$ErrorActionPreference='Stop'
$previous=@{}; $exitCode=2; $locationPushed=$false; $lockTaken=$false; $mutex=$null
$stage='BOOTSTRAP'; $finalReport=$null; $checkpointHash=$null; $resolvedCheckpoint=$null
$nativePreference=Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
$previousNativePreference=if ($null -ne $nativePreference) { $nativePreference.Value } else { $null }
$bindings=@('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD',
    'QA_SALE_JOURNEY_AUTHORIZED','QA_SALE_EXCLUSIVE_WINDOW','QA_SALE_VALIDATED_CODE_SHA','QA_SALE_PRIVATE_DIR','QA_SALE_PRIVATE_DIRECTORY_ACL','QA_SALE_PRODUCT_ID','QA_SALE_LOCATION_ID','QA_SALE_CATALOG_FILE')
try {
    . (Join-Path $PSScriptRoot 'sale-launcher-core.ps1')
    if ($null -ne $nativePreference) { Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $false }
    Set-PSDebug -Off
    foreach ($name in $bindings) { $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Stop-QaSaleLauncher 'WINDOWS_PLATFORM_REQUIRED' }
    Push-Location (Split-Path $PSScriptRoot -Parent); $locationPushed=$true
    $stage='GIT'
    $native=Invoke-QaSaleNative git @('branch','--show-current')
    if ($native.ExitCode -ne 0 -or ($native.Output -join '') -ne 'automation/nexalvo-qa-actions') { Stop-QaSaleLauncher 'QA_BRANCH_REQUIRED' }
    $native=Invoke-QaSaleNative git @('status','--porcelain=v1','--untracked-files=normal')
    if ($native.ExitCode -ne 0 -or $native.Output.Count -ne 0) { Stop-QaSaleLauncher 'CLEAN_QA_WORKTREE_REQUIRED' }
    $native=Invoke-QaSaleNative git @('merge-base','--is-ancestor','ea19a2a','HEAD')
    if ($native.ExitCode -ne 0) { Stop-QaSaleLauncher 'APPROVED_PHOTO_BASELINE_REQUIRED' }
    $native=Invoke-QaSaleNative git @('merge-base','--is-ancestor',$ValidatedCodeSha,'HEAD')
    if ($native.ExitCode -ne 0) { Stop-QaSaleLauncher 'VALIDATED_CODE_NOT_IN_HISTORY' }
    $native=Invoke-QaSaleNative git @('diff','--name-only',"$ValidatedCodeSha..HEAD")
    if ($native.ExitCode -ne 0 -or @($native.Output | Where-Object { $_ -and -not $_.StartsWith('docs/') }).Count -gt 0) { Stop-QaSaleLauncher 'UNVALIDATED_CODE_CHANGES' }
    $stage='MODE'
    if (-not $ExclusiveWindowConfirmed) { Stop-QaSaleLauncher 'EXCLUSIVE_FIXTURE_WINDOW_REQUIRED' }
    if ($ReadOnlyRecovery -and -not $RecoveryFile) { Stop-QaSaleLauncher 'RECOVERY_FILE_REQUIRED' }
    if ($PreflightOnly -and $RecoveryFile) { Stop-QaSaleLauncher 'PREFLIGHT_RECOVERY_MODE_CONFLICT' }
    if ($ValidateLauncherOnly -and -not $ReadOnlyRecovery) { Stop-QaSaleLauncher 'READONLY_LAUNCHER_VALIDATION_REQUIRED' }
    $stage='CATALOG'
    $catalogPath=[IO.Path]::GetFullPath($CatalogFile)
    if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) { Stop-QaSaleLauncher 'READONLY_CATALOG_FILE_REQUIRED' }
    $stage='NODE'
    $native=Invoke-QaSaleNative node @('-p','parseInt(process.versions.node)')
    if ($native.ExitCode -ne 0 -or ($native.Output -join '') -notmatch '^\d+$' -or [int]($native.Output -join '') -lt 22) { Stop-QaSaleLauncher 'NODE_22_REQUIRED' }
    $stage='MUTEX'
    $mutex=[Threading.Mutex]::new($false,'Local\NEXALVOSaleJourneyTEST')
    try { $lockTaken=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $lockTaken=$true; Stop-QaSaleLauncher 'ABANDONED_RUN_REQUIRES_CHECKPOINT_REVIEW' }
    if (-not $lockTaken) { Stop-QaSaleLauncher 'SALE_JOURNEY_ALREADY_RUNNING' }
    $tempRoot=[IO.Path]::GetTempPath()
    $stage='CHECKPOINT_SCAN'
    if (-not $RecoveryFile) {
        foreach ($dir in @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'nexalvo-sale-*' -ErrorAction SilentlyContinue)) {
            $old=Join-Path $dir.FullName 'sale-recovery.json'
            if (Test-Path -LiteralPath $old) {
                $state=Get-Content -LiteralPath $old -Raw | ConvertFrom-Json
                if ($state.phase -ne 'RESTORED') { Stop-QaSaleLauncher 'UNFINISHED_SALE_CHECKPOINT_EXISTS' }
            }
        }
    }
    $stage='DEPENDENCIES'
    # Recovery/preflight return before Playwright in the Node runner. No browser or npm needed.
    if (-not $RecoveryFile -and -not $PreflightOnly) {
        $native=Invoke-QaSaleNative node @('--input-type=module','-') -InputText "await import('playwright')"
        if ($native.ExitCode -ne 0) {
            $native=Invoke-QaSaleNative npm @('install','--no-save','--package-lock=false','playwright@1.64.0')
            if ($native.ExitCode -ne 0) { Stop-QaSaleLauncher 'PLAYWRIGHT_INSTALL_FAILED' }
        }
        $native=Invoke-QaSaleNative node @('node_modules/playwright/cli.js','install','chromium')
        if ($native.ExitCode -ne 0) { Stop-QaSaleLauncher 'CHROMIUM_INSTALL_FAILED' }
        $native=Invoke-QaSaleNative git @('status','--porcelain=v1','--untracked-files=normal')
        if ($native.ExitCode -ne 0 -or $native.Output.Count -ne 0) { Stop-QaSaleLauncher 'DEPENDENCY_SETUP_CHANGED_TRACKED_FILES' }
    }
    $stage='PRIVATE_PATH'
    if ($RecoveryFile) {
        $privateDirectory=Resolve-QaSaleRecoveryDirectory -RecoveryFile $RecoveryFile -TempRoot $tempRoot
        $resolvedCheckpoint=Join-Path $privateDirectory 'sale-recovery.json'
    } else {
        $privateDirectory=Join-Path $tempRoot ('nexalvo-sale-'+[Guid]::NewGuid().ToString())
        if ([IO.Directory]::Exists($privateDirectory)) { Stop-QaSaleLauncher 'PRIVATE_DIRECTORY_CREATION_FAILED' }
        [void][IO.Directory]::CreateDirectory($privateDirectory)
    }
    $stage='PRIVATE_ACL'
    if ($RecoveryFile) { Assert-QaSalePrivateAcl -Directory $privateDirectory -Checkpoint $resolvedCheckpoint }
    else { Set-QaSaleNewPrivateAcl -Directory $privateDirectory }
    $stage='CHECKPOINT_HASH'
    if ($ReadOnlyRecovery) { $checkpointHash=(Get-FileHash -LiteralPath $resolvedCheckpoint -Algorithm SHA256).Hash }
    if ($ValidateLauncherOnly) {
        $finalReport=[pscustomobject]@{scope='B_JOURNEY_WINDOWS_LAUNCHER_VALIDATION';status='PASS';code='READONLY_LAUNCHER_READY';stage='READY_FOR_CREDENTIALS';browser_dependencies_required=$false;supabase_requests=0}
        $exitCode=0
    } else {
        $stage='CREDENTIALS'
        foreach ($name in $bindings[0..5]) {
            if ($name -eq 'QA_SUPABASE_URL') { [Environment]::SetEnvironmentVariable($name,'https://msinksoilkluooxenecy.supabase.co','Process'); continue }
            if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name,'Process'))) { continue }
            $secure=Read-Host "Enter $name (hidden; process only)" -AsSecureString
            $ptr=[IntPtr]::Zero
            try { $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); [Environment]::SetEnvironmentVariable($name,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr),'Process') }
            finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; $secure.Dispose() }
        }
        $stage='RUNNER_ENV'
        $values=@{QA_SALE_PRODUCT_ID=$FixtureProductId.ToString();QA_SALE_LOCATION_ID=$LocationId.ToString();QA_SALE_CATALOG_FILE=$catalogPath;
            QA_SALE_JOURNEY_AUTHORIZED='TEST_ONLY_EXPLICIT';QA_SALE_EXCLUSIVE_WINDOW='TEST_ONLY_EXCLUSIVE_WINDOW';QA_SALE_VALIDATED_CODE_SHA=$ValidatedCodeSha;
            QA_SALE_PRIVATE_DIR=$privateDirectory;QA_SALE_PRIVATE_DIRECTORY_ACL='CURRENT_USER_ONLY'}
        foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name,$values[$name],'Process') }
        $stage='RUNNER'
        $runnerArguments=@('qa/sale-journey.TEST.mjs')
        if ($PreflightOnly) { $runnerArguments+='--preflight' }
        elseif ($ReadOnlyRecovery) { $runnerArguments+=@('--reconcile-readonly',$resolvedCheckpoint) }
        elseif ($RecoveryFile) { $runnerArguments+=@('--recover',$resolvedCheckpoint) }
        $native=Invoke-QaSaleNative node $runnerArguments
        $stage='REPORT'
        if ($native.ExitCode -notin @(0,1,2)) { Stop-QaSaleLauncher 'RUNNER_EXIT_NOT_CLASSIFIED' }
        $serialized=$native.Output -join "`n"
        if ($serialized -match 'Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|[?&](?:access_token|token)=|sb_secret_|@|-----BEGIN') { Stop-QaSaleLauncher 'RUNNER_REPORT_INVALID' }
        $finalReport=$serialized | ConvertFrom-Json
        if ($finalReport.status -notin @('PASS','FAIL','BLOCKED') -or $finalReport.scope -notin @('B_JOURNEY_REAL_TEST_SALE','B_JOURNEY_READONLY_PREFLIGHT','B_JOURNEY_READONLY_RECOVERY')) { Stop-QaSaleLauncher 'RUNNER_REPORT_INVALID' }
        $exitCode=$native.ExitCode
    }
} catch {
    if (Get-Command ConvertTo-QaSaleLauncherFailure -CommandType Function -ErrorAction SilentlyContinue) { $finalReport=ConvertTo-QaSaleLauncherFailure -Exception $_.Exception -Stage $stage }
    else { $finalReport=[pscustomobject]@{scope='B_JOURNEY_WINDOWS_LAUNCHER';status='BLOCKED';code='WINDOWS_SALE_BOOTSTRAP_BLOCKED';stage='BOOTSTRAP'} }
    $exitCode=2
} finally {
    if ($ReadOnlyRecovery -and $null -ne $checkpointHash) {
        try {
            if ((Get-FileHash -LiteralPath $resolvedCheckpoint -Algorithm SHA256).Hash -ne $checkpointHash) { Stop-QaSaleLauncher 'RECOVERY_CHECKPOINT_CHANGED' }
            if ($ValidateLauncherOnly -and $finalReport.status -eq 'PASS') { $finalReport | Add-Member -NotePropertyName checkpoint_unchanged -NotePropertyValue $true }
        } catch { $finalReport=ConvertTo-QaSaleLauncherFailure -Exception $_.Exception -Stage 'CHECKPOINT_VERIFY'; $exitCode=2 }
    }
    $cleanupFailed=$false
    foreach ($name in $previous.Keys) { try { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') } catch { $cleanupFailed=$true } }
    $previous.Clear()
    try { if ($lockTaken) { $mutex.ReleaseMutex() } } catch { $cleanupFailed=$true }
    try { if ($null -ne $mutex) { $mutex.Dispose() } } catch { $cleanupFailed=$true }
    try { if ($locationPushed) { Pop-Location } } catch { $cleanupFailed=$true }
    try { if ($null -ne $nativePreference) { Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $previousNativePreference } } catch { $cleanupFailed=$true }
    if ($cleanupFailed) { $finalReport=ConvertTo-QaSaleLauncherFailure -Exception $null -Stage 'CLEANUP'; $exitCode=2 }
}
$finalReport | ConvertTo-Json -Depth 12 -Compress
exit $exitCode
