# Windows launcher helpers. No network, checkpoint content parsing or credential output.
function Stop-QaSaleLauncher {
    param([string]$Code)
    $failure = [InvalidOperationException]::new('QA_SALE_LAUNCHER_GUARD')
    $failure.Data['QaSaleGuardCode'] = $Code
    throw $failure
}
function ConvertTo-QaSaleLauncherFailure {
    param([Exception]$Exception, [string]$Stage)
    $stages = @{
        BOOTSTRAP='WINDOWS_SALE_BOOTSTRAP_BLOCKED'; GIT='WINDOWS_SALE_GIT_BLOCKED'
        MODE='WINDOWS_SALE_MODE_BLOCKED'; CATALOG='WINDOWS_SALE_CATALOG_BLOCKED'
        NODE='WINDOWS_SALE_NODE_BLOCKED'; MUTEX='WINDOWS_SALE_MUTEX_BLOCKED'
        CHECKPOINT_SCAN='WINDOWS_SALE_CHECKPOINT_SCAN_BLOCKED'; DEPENDENCIES='WINDOWS_SALE_DEPENDENCIES_BLOCKED'
        PRIVATE_PATH='WINDOWS_SALE_PRIVATE_PATH_BLOCKED'; PRIVATE_ACL='WINDOWS_SALE_PRIVATE_ACL_BLOCKED'
        CHECKPOINT_HASH='WINDOWS_SALE_CHECKPOINT_HASH_BLOCKED'; CREDENTIALS='WINDOWS_SALE_CREDENTIALS_BLOCKED'
        RUNNER_ENV='WINDOWS_SALE_RUNNER_ENV_BLOCKED'; RUNNER='WINDOWS_SALE_RUNNER_START_BLOCKED'
        REPORT='WINDOWS_SALE_REPORT_BLOCKED'; CHECKPOINT_VERIFY='WINDOWS_SALE_CHECKPOINT_VERIFY_BLOCKED'
        CLEANUP='WINDOWS_SALE_CLEANUP_BLOCKED'
    }
    $guards = @('QA_BRANCH_REQUIRED','CLEAN_QA_WORKTREE_REQUIRED','APPROVED_PHOTO_BASELINE_REQUIRED',
        'VALIDATED_CODE_NOT_IN_HISTORY','UNVALIDATED_CODE_CHANGES','EXCLUSIVE_FIXTURE_WINDOW_REQUIRED',
        'RECOVERY_FILE_REQUIRED','PREFLIGHT_RECOVERY_MODE_CONFLICT','READONLY_LAUNCHER_VALIDATION_REQUIRED',
        'READONLY_CATALOG_FILE_REQUIRED','NODE_22_REQUIRED','WINDOWS_PLATFORM_REQUIRED',
        'ABANDONED_RUN_REQUIRES_CHECKPOINT_REVIEW','SALE_JOURNEY_ALREADY_RUNNING','UNFINISHED_SALE_CHECKPOINT_EXISTS',
        'PLAYWRIGHT_INSTALL_FAILED','CHROMIUM_INSTALL_FAILED','DEPENDENCY_SETUP_CHANGED_TRACKED_FILES',
        'RECOVERY_FILE_OUTSIDE_PRIVATE_TEMP','RECOVERY_CHECKPOINT_REQUIRED','PRIVATE_REPARSE_POINT_FORBIDDEN',
        'PRIVATE_DIRECTORY_ACL_UNSAFE','PRIVATE_CHECKPOINT_ACL_UNSAFE','PRIVATE_DIRECTORY_CREATION_FAILED',
        'RECOVERY_CHECKPOINT_CHANGED','RUNNER_REPORT_INVALID','RUNNER_EXIT_NOT_CLASSIFIED')
    $safeStage = if ($stages.ContainsKey($Stage)) { $Stage } else { 'BOOTSTRAP' }
    $code = $stages[$safeStage]
    if ($null -ne $Exception -and $guards -ccontains [string]$Exception.Data['QaSaleGuardCode']) { $code = [string]$Exception.Data['QaSaleGuardCode'] }
    # Never inspect/serialize Exception.Message, ErrorRecord, paths, identities or checkpoint data.
    [pscustomobject]@{ scope='B_JOURNEY_WINDOWS_LAUNCHER'; status='BLOCKED'; code=$code; stage=$safeStage }
}
function Invoke-QaSaleNative {
    param([string]$FilePath, [string[]]$Arguments, [AllowNull()][string]$InputText)
    $application = Get-Command -Name $FilePath -CommandType Application -ErrorAction Stop
    $savedPreference = $ErrorActionPreference
    try {
        # PS 5.1 converts native stderr to NativeCommandError; discard it and classify exit codes.
        $ErrorActionPreference = 'Continue'
        if ($PSBoundParameters.ContainsKey('InputText')) { $captured = @($InputText | & $application.Source @Arguments 2>$null) }
        else { $captured = @(& $application.Source @Arguments 2>$null) }
        $nativeExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    [pscustomobject]@{ ExitCode=[int]$nativeExit; Output=[string[]]$captured }
}
function Resolve-QaSaleRecoveryDirectory {
    param([string]$RecoveryFile, [string]$TempRoot)
    $root = (Get-Item -LiteralPath ([IO.Path]::GetFullPath($TempRoot)) -Force -ErrorAction Stop).FullName.TrimEnd('\','/')
    $file = Get-Item -LiteralPath ([IO.Path]::GetFullPath($RecoveryFile)) -Force -ErrorAction Stop
    if ($file.PSIsContainer -or $file.Name -ine 'sale-recovery.json') { Stop-QaSaleLauncher 'RECOVERY_CHECKPOINT_REQUIRED' }
    $directory = $file.Directory
    $prefix = $root + [IO.Path]::DirectorySeparatorChar
    if (-not $directory.FullName.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not $directory.Name.StartsWith('nexalvo-sale-',[StringComparison]::Ordinal)) { Stop-QaSaleLauncher 'RECOVERY_FILE_OUTSIDE_PRIVATE_TEMP' }
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { Stop-QaSaleLauncher 'PRIVATE_REPARSE_POINT_FORBIDDEN' }
    $ancestor = $directory
    while ($null -ne $ancestor) {
        if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { Stop-QaSaleLauncher 'PRIVATE_REPARSE_POINT_FORBIDDEN' }
        if ([string]::Equals($ancestor.FullName.TrimEnd('\','/'),$root,[StringComparison]::OrdinalIgnoreCase)) { break }
        $ancestor = $ancestor.Parent
    }
    [string]$directory.FullName
}
function Set-QaSaleNewPrivateAcl {
    param([string]$Directory)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true,$false)
    $acl.SetOwner($identity.User)
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity.User,[Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
    [void]$acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Directory -AclObject $acl -ErrorAction Stop
}
function Assert-QaSalePrivateAcl {
    param([string]$Directory, [string]$Checkpoint)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    foreach ($path in @($Directory,$Checkpoint)) {
        $isDirectory = $path -eq $Directory
        $code = if ($isDirectory) { 'PRIVATE_DIRECTORY_ACL_UNSAFE' } else { 'PRIVATE_CHECKPOINT_ACL_UNSAFE' }
        $acl = Get-Acl -LiteralPath $path -ErrorAction Stop
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.User.Value -or ($isDirectory -and -not $acl.AreAccessRulesProtected)) { Stop-QaSaleLauncher $code }
        $fullControl = $false
        foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $rule.IdentityReference.Value -ne $identity.User.Value) { Stop-QaSaleLauncher $code }
            if (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl -and ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0) { $fullControl=$true }
        }
        if (-not $fullControl) { Stop-QaSaleLauncher $code }
    }
}
