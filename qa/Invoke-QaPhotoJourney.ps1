# A-Jornada real TEST only. Credentials are prompted hidden and live in this process only.
# No transcript, Tee-Object, Start-Transcript, credential files or browser traces are created.
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ValidatedCodeSha,
    [switch]$ExclusiveWindowConfirmed,
    [string]$RecoveryFile,
    [switch]$ReadOnlyRecovery
)
$ErrorActionPreference = 'Stop'
$previous = @{}
$exitCode = 2
$locationPushed = $false
$lockTaken = $false
$mutex = $null
$nativePreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
$previousNativePreference = if ($null -ne $nativePreference) { $nativePreference.Value } else { $null }
$bindings = @('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD',
    'QA_PHOTO_JOURNEY_AUTHORIZED','QA_PHOTO_EXCLUSIVE_WINDOW','QA_PHOTO_VALIDATED_CODE_SHA','QA_PHOTO_PRIVATE_DIR','QA_PHOTO_PRIVATE_DIRECTORY_ACL')
try {
    if ($null -ne $nativePreference) { Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $false }
    Set-PSDebug -Off
    foreach ($name in $bindings) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    Push-Location (Split-Path $PSScriptRoot -Parent)
    $locationPushed = $true
    if ((& git branch --show-current) -ne 'automation/nexalvo-qa-actions' -or $LASTEXITCODE -ne 0) { throw 'QA_BRANCH_REQUIRED' }
    if (@(& git status --porcelain=v1 --untracked-files=normal).Count -ne 0 -or $LASTEXITCODE -ne 0) { throw 'CLEAN_QA_WORKTREE_REQUIRED' }
    & git merge-base --is-ancestor 9b381e8 HEAD
    if ($LASTEXITCODE -ne 0) { throw 'SOURCE_COMMIT_9B381E8_REQUIRED' }
    & git merge-base --is-ancestor $ValidatedCodeSha HEAD
    if ($LASTEXITCODE -ne 0) { throw 'VALIDATED_CODE_NOT_IN_HISTORY' }
    $differences = @(& git diff --name-only "$ValidatedCodeSha..HEAD")
    if ($LASTEXITCODE -ne 0 -or @($differences | Where-Object { $_ -and -not $_.StartsWith('docs/') }).Count -gt 0) { throw 'UNVALIDATED_CODE_CHANGES' }
    if (-not $ExclusiveWindowConfirmed) { throw 'EXCLUSIVE_FIXTURE_WINDOW_REQUIRED' }
    if ($ReadOnlyRecovery -and -not $RecoveryFile) { throw 'RECOVERY_FILE_REQUIRED' }
    $nodeMajor = & node -p 'parseInt(process.versions.node)'
    if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 22) { throw 'NODE_22_REQUIRED' }
    # Protect this notebook from overlapping executors; the operator must also reserve the QA
    # fixture against other devices. This mutex is not a database lock or global lease.
    $mutex = New-Object System.Threading.Mutex($false, 'Local\NEXALVOPhotoJourneyTEST')
    try { $lockTaken = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $lockTaken = $true; throw 'ABANDONED_RUN_REQUIRES_CHECKPOINT_REVIEW' }
    if (-not $lockTaken) { throw 'PHOTO_JOURNEY_ALREADY_RUNNING' }
    $tempRoot = [IO.Path]::GetTempPath()
    if (-not $RecoveryFile) {
        foreach ($dir in @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'nexalvo-photo-*' -ErrorAction SilentlyContinue)) {
            $old = Join-Path $dir.FullName 'photo-recovery.json'
            if (Test-Path -LiteralPath $old) {
                $state = Get-Content -LiteralPath $old -Raw | ConvertFrom-Json
                if ($state.phase -ne 'RESTORED') { throw 'UNFINISHED_PHOTO_CHECKPOINT_EXISTS' }
            }
        }
    }
    # Dependencies are prepared before secret prompts. No package.json/lockfile changes.
    & node --input-type=module -e "await import('playwright')" 2>$null
    if ($LASTEXITCODE -ne 0) {
        & npm install --no-save --package-lock=false playwright@1.64.0
        if ($LASTEXITCODE -ne 0) { throw 'PLAYWRIGHT_INSTALL_FAILED' }
    }
    & node node_modules/playwright/cli.js install chromium
    if ($LASTEXITCODE -ne 0) { throw 'CHROMIUM_INSTALL_FAILED' }
    if (@(& git status --porcelain=v1 --untracked-files=normal).Count -ne 0 -or $LASTEXITCODE -ne 0) { throw 'DEPENDENCY_SETUP_CHANGED_TRACKED_FILES' }
    $privateDirectory = if ($RecoveryFile) { Split-Path ([IO.Path]::GetFullPath($RecoveryFile)) -Parent } else {
        $path = Join-Path $tempRoot ('nexalvo-photo-' + [Guid]::NewGuid().ToString())
        [void](New-Item -ItemType Directory -Path $path)
        $path
    }
    if (-not $privateDirectory.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'RECOVERY_FILE_OUTSIDE_PRIVATE_TEMP' }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($identity.User)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity.User, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $privateDirectory -AclObject $acl
    foreach ($name in $bindings[0..5]) {
        if ($name -eq 'QA_SUPABASE_URL') {
            [Environment]::SetEnvironmentVariable($name, 'https://msinksoilkluooxenecy.supabase.co', 'Process')
            continue
        }
        $existing = [Environment]::GetEnvironmentVariable($name, 'Process')
        if (-not [string]::IsNullOrEmpty($existing)) { continue }
        $secure = Read-Host "Enter $name (hidden; process only)" -AsSecureString
        $ptr = [IntPtr]::Zero
        try {
            $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process')
        } finally {
            if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
            $secure.Dispose()
        }
    }
    [Environment]::SetEnvironmentVariable('QA_PHOTO_JOURNEY_AUTHORIZED', 'TEST_ONLY_EXPLICIT', 'Process')
    [Environment]::SetEnvironmentVariable('QA_PHOTO_EXCLUSIVE_WINDOW', 'TEST_ONLY_EXCLUSIVE_WINDOW', 'Process')
    [Environment]::SetEnvironmentVariable('QA_PHOTO_VALIDATED_CODE_SHA', $ValidatedCodeSha, 'Process')
    [Environment]::SetEnvironmentVariable('QA_PHOTO_PRIVATE_DIR', $privateDirectory, 'Process')
    [Environment]::SetEnvironmentVariable('QA_PHOTO_PRIVATE_DIRECTORY_ACL', 'CURRENT_USER_ONLY', 'Process')
    if ($ReadOnlyRecovery) { & node qa/photo-journey.TEST.mjs --reconcile-readonly $RecoveryFile }
    elseif ($RecoveryFile) { & node qa/photo-journey.TEST.mjs --recover $RecoveryFile }
    else { & node qa/photo-journey.TEST.mjs }
    $exitCode = $LASTEXITCODE
    Write-Host "Private recovery snapshot retained in: $privateDirectory"
} catch {
    # Only whitelisted fixed codes, never exception text which could embed a URL or secret.
    $code = if ($_.Exception.Message -match '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'WINDOWS_PHOTO_RUNNER_BLOCKED' }
    Write-Host ('{"scope":"A_JORNADA_REAL_TEST_PHOTOS","status":"BLOCKED","code":"' + $code + '"}')
    $exitCode = 2
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $previous.Clear()
    if ($lockTaken) { $mutex.ReleaseMutex() }
    if ($null -ne $mutex) { $mutex.Dispose() }
    if ($locationPushed) { Pop-Location }
    if ($null -ne $nativePreference) { Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $previousNativePreference }
}
exit $exitCode
