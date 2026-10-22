# Native Windows, synthetic files only. No secrets, browser, Auth, stock writes or real checkpoints.
param([Parameter(Mandatory=$true)][string]$TapFile)
$ErrorActionPreference='Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) { $PSNativeCommandUseErrorActionPreference=$false }
. (Join-Path $PSScriptRoot 'stock-launcher-core.ps1')
$tap=[Collections.Generic.List[string]]::new();$tap.Add('TAP version 13');$script:failures=0;$script:number=0
$directory=Join-Path ([IO.Path]::GetTempPath()) ('nexalvo-stock-c1-synthetic-['+[Guid]::NewGuid().ToString()+']')
[void][IO.Directory]::CreateDirectory($directory)
Set-QaSaleNewPrivateAcl -Directory $directory
$checkpoint=Join-Path $directory 'stock-recovery.json';[IO.File]::WriteAllText($checkpoint,'{"synthetic":"SYNTHETIC_PRIVATE_VALUE"}')
$catalog=Join-Path $directory 'synthetic catalog.json';[IO.File]::WriteAllText($catalog,'{}')
$hash=(Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash
$sddl=(Get-Acl -LiteralPath $directory).Sddl;$fileSddl=(Get-Acl -LiteralPath $checkpoint).Sddl
$sha=(& git rev-parse HEAD).Trim()
$engine=if ($PSVersionTable.PSEdition -eq 'Desktop') { Join-Path $PSHOME 'powershell.exe' } else { Join-Path $PSHOME 'pwsh.exe' }
function Assert-C1 { param([bool]$Value) if (-not $Value) { throw [InvalidOperationException]::new('C1_SYNTHETIC_ASSERTION') } }
function Test-Case {
    param([string]$Name,[scriptblock]$Body)
    $script:number++
    try { & $Body;$tap.Add("ok $script:number - $Name") }
    catch { $script:failures++;$tap.Add("not ok $script:number - $Name");Write-Output "::error title=NEXALVO C1 Windows launcher::$Name" }
}
function Invoke-C1 {
    param([string[]]$Extra=@('-ValidateLauncherOnly'),[string]$CodeSha=$sha)
    $arguments=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Invoke-QaStockJourney.ps1'),'-ValidatedCodeSha',$CodeSha,'-CatalogFile',$catalog)+$Extra
    $r=Invoke-QaSaleNative $engine $arguments;$encoded=$r.Output -join "`n"
    Assert-C1 (-not ($encoded -match 'SYNTHETIC_PRIVATE_VALUE|Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|@|[A-Za-z]:\\'))
    [pscustomobject]@{ExitCode=$r.ExitCode;Report=($encoded | ConvertFrom-Json)}
}
try {
    Test-Case 'C1 native scripts parse without evaluation' {
        foreach ($name in @('stock-launcher-core.ps1','Invoke-QaStockJourney.ps1','Test-QaStockJourneyLauncher.ps1')) {
            $tokens=$null;$errors=$null
            [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors)
            Assert-C1 ($errors.Count -eq 0)
        }
    }
    Test-Case 'C1 single-backslash local mutex creates acquires and releases' {
        $mutex=[Threading.Mutex]::new($false,'Local\NEXALVOC1SyntheticMutex')
        try { Assert-C1 ($mutex.WaitOne(0));$mutex.ReleaseMutex();Assert-C1 ($mutex.WaitOne(0));$mutex.ReleaseMutex() }
        finally { $mutex.Dispose() }
    }
    Test-Case 'C1 local validation needs no window credentials browser or network' {
        $r=Invoke-C1
        Assert-C1 ($r.ExitCode -eq 0 -and $r.Report.code -eq 'C1_LOCAL_LAUNCHER_READY' -and $r.Report.supabase_requests -eq 0 -and $r.Report.full_homologation -eq $false)
    }
    Test-Case 'C1 readonly recovery accepts existing private literal path without changing checkpoint or ACL' {
        $r=Invoke-C1 -Extra @('-ValidateLauncherOnly','-ReadOnlyRecovery','-RecoveryFile',$checkpoint)
        Assert-C1 ($r.ExitCode -eq 0 -and $r.Report.code -eq 'C1_LOCAL_LAUNCHER_READY')
        Assert-C1 ((Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -eq $hash -and (Get-Acl -LiteralPath $directory).Sddl -eq $sddl -and (Get-Acl -LiteralPath $checkpoint).Sddl -eq $fileSddl)
    }
    Test-Case 'C1 recovery rejects another filename without leaking private paths' {
        $other=Join-Path $directory 'other.json';[IO.File]::WriteAllText($other,'SYNTHETIC_PRIVATE_VALUE')
        $r=Invoke-C1 -Extra @('-ValidateLauncherOnly','-ReadOnlyRecovery','-RecoveryFile',$other)
        Assert-C1 ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_WINDOWS_PRIVATE_PATH_BLOCKED')
    }
    Test-Case 'C1 recovery rejects a checkpoint ACL granting access to another identity' {
        $original=Get-Acl -LiteralPath $checkpoint
        $unsafe=[Security.AccessControl.FileSecurity]::new();$unsafe.SetSecurityDescriptorSddlForm($original.Sddl)
        $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
        [void]$unsafe.AddAccessRule($rule);Set-Acl -LiteralPath $checkpoint -AclObject $unsafe
        try {
            $r=Invoke-C1 -Extra @('-ValidateLauncherOnly','-ReadOnlyRecovery','-RecoveryFile',$checkpoint)
            Assert-C1 ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_WINDOWS_PRIVATE_PATH_BLOCKED')
        } finally { Set-Acl -LiteralPath $checkpoint -AclObject $original }
    }
    Test-Case 'C1 execute without operational window blocks before prompts and network' {
        $r=Invoke-C1 -Extra @()
        Assert-C1 ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_WINDOWS_MODE_BLOCKED')
    }
    Test-Case 'C1 conflicting recovery and preflight modes block before credentials' {
        $r=Invoke-C1 -Extra @('-PreflightOnly','-ReadOnlyRecovery','-RecoveryFile',$checkpoint)
        Assert-C1 ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_WINDOWS_MODE_BLOCKED')
    }
    Test-Case 'C1 unvalidated SHA blocks with a fixed Git code' {
        $r=Invoke-C1 -CodeSha ('0'*40)
        Assert-C1 ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_WINDOWS_GIT_BLOCKED')
    }
    Test-Case 'C1 normal readonly recovery rejects invalid catalog before credentials with no checkpoint writes' {
        $r=Invoke-C1 -Extra @('-ReadOnlyRecovery','-RecoveryFile',$checkpoint)
        Assert-C1 ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_WINDOWS_CATALOG_BLOCKED')
        Assert-C1 ((Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -eq $hash -and (Get-Acl -LiteralPath $directory).Sddl -eq $sddl)
    }
} finally { [IO.Directory]::Delete($directory,$true) }
$tap.Add("1..$script:number");$tap.Add("# tests $script:number");$tap.Add("# pass $($script:number-$script:failures)")
$tap.Add("# fail $script:failures");$tap.Add('# skipped 0')
[IO.File]::WriteAllText([IO.Path]::GetFullPath($TapFile),([string]::Join("`n",$tap)+"`n"),[Text.UTF8Encoding]::new($false))
$tap | Write-Output
if ($script:failures -gt 0) { exit 1 };exit 0
