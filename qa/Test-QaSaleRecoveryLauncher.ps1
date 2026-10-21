# Native Windows regression; synthetic TEMP files only, no credentials, browser or Supabase.
param([Parameter(Mandatory=$true)][string]$TapFile)
$ErrorActionPreference='Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) { $PSNativeCommandUseErrorActionPreference=$false }
. (Join-Path $PSScriptRoot 'sale-launcher-core.ps1')
$script:tap=[Collections.Generic.List[string]]::new(); $script:failed=0; $script:number=0; $script:lastCode='NOT_CALLED'
$script:tap.Add('TAP version 13')
function Assert-Test { param([bool]$Condition) if (-not $Condition) { throw [InvalidOperationException]::new('SYNTHETIC_ASSERTION_FAILED') } }
function Invoke-Case {
    param([string]$Name,[scriptblock]$Body)
    $script:number++; $script:lastCode='NOT_CALLED'
    try { & $Body; $script:tap.Add("ok $script:number - $Name") }
    catch {
        $script:failed++; $script:tap.Add("not ok $script:number - $Name"); $script:tap.Add("# launcher_code=$script:lastCode")
        Write-Output "::error title=NEXALVO Windows launcher::$Name - $script:lastCode"
    }
}
$suite=Join-Path ([IO.Path]::GetTempPath()) ('nexalvo-sale-launcher-suite-'+[Guid]::NewGuid().ToString())
$private=Join-Path $suite 'nexalvo-sale-existing [literal] spaces'
[void][IO.Directory]::CreateDirectory($private)
Set-QaSaleNewPrivateAcl -Directory $private
$checkpoint=Join-Path $private 'sale-recovery.json'
$catalog=Join-Path $suite 'synthetic-catalog.json'
[IO.File]::WriteAllText($checkpoint,'{"scope":"SYNTHETIC_CHECKPOINT_ONLY","phase":"REVERSAL_CONFIRMED"}',[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($catalog,'{}',[Text.UTF8Encoding]::new($false))
$originalHash=(Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash
$directoryAcl=(Get-Acl -LiteralPath $private).Sddl; $fileAcl=(Get-Acl -LiteralPath $checkpoint).Sddl
$engine=if ($PSVersionTable.PSEdition -eq 'Desktop') { Join-Path $PSHOME 'powershell.exe' } else { Join-Path $PSHOME 'pwsh.exe' }
$sha=(& git rev-parse HEAD).Trim()
function Invoke-Validation {
    $arguments=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Invoke-QaSaleJourney.ps1'),
        '-ValidatedCodeSha',$sha,'-FixtureProductId','11111111-1111-4111-8111-111111111111','-LocationId','22222222-2222-4222-8222-222222222222',
        '-CatalogFile',$catalog,'-RecoveryFile',$checkpoint,'-ReadOnlyRecovery','-ValidateLauncherOnly','-ExclusiveWindowConfirmed')
    $result=Invoke-QaSaleNative -FilePath $engine -Arguments $arguments
    $output=$result.Output -join "`n"
    Assert-Test (-not ($output -match 'Bearer\s|example\.invalid|SYNTHETIC_CHECKPOINT_ONLY|[A-Za-z]:\\'))
    $report=$output | ConvertFrom-Json; $script:lastCode=$report.code
    [pscustomobject]@{ExitCode=$result.ExitCode;Report=$report}
}
try {
    Invoke-Case 'PS parser accepts launcher and helpers' {
        foreach ($file in @('Invoke-QaSaleJourney.ps1','sale-launcher-core.ps1','Test-QaSaleRecoveryLauncher.ps1')) {
            $tokens=$null; $parseErrors=$null
            [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file),[ref]$tokens,[ref]$parseErrors)
            Assert-Test ($parseErrors.Count -eq 0)
        }
    }
    Invoke-Case 'unknown native exceptions and arbitrary error codes never disclose raw messages' {
        $exception=[Exception]::new('C:\private\person@example.invalid Bearer SYNTHETIC_SECRET')
        $exception.Data['QaSaleGuardCode']='SYNTHETIC_SECRET'
        $failure=ConvertTo-QaSaleLauncherFailure -Exception $exception -Stage PRIVATE_ACL
        Assert-Test ($failure.code -eq 'WINDOWS_SALE_PRIVATE_ACL_BLOCKED' -and $failure.stage -eq 'PRIVATE_ACL')
        Assert-Test (-not (($failure | ConvertTo-Json -Compress) -match 'C:\\private\\|example\.invalid|Bearer|SYNTHETIC_SECRET'))
    }
    Invoke-Case 'recovery path is literal normalized and constrained by a directory boundary' {
        Assert-Test ((Resolve-QaSaleRecoveryDirectory -RecoveryFile $checkpoint -TempRoot $suite) -eq $private)
        $sibling=Join-Path $suite 'root-escape'; [void][IO.Directory]::CreateDirectory($sibling)
        $root=Join-Path $suite 'root'; [void][IO.Directory]::CreateDirectory($root)
        $escaped=Join-Path $sibling 'nexalvo-sale-escape'; [void][IO.Directory]::CreateDirectory($escaped)
        $escapedFile=Join-Path $escaped 'sale-recovery.json'; [IO.File]::WriteAllText($escapedFile,'{}')
        $denied=$false
        try { [void](Resolve-QaSaleRecoveryDirectory -RecoveryFile $escapedFile -TempRoot $root) }
        catch { $denied=(ConvertTo-QaSaleLauncherFailure -Exception $_.Exception -Stage PRIVATE_PATH).code -eq 'RECOVERY_FILE_OUTSIDE_PRIVATE_TEMP' }
        Assert-Test $denied
    }
    Invoke-Case 'native stderr cannot terminate classification or leak under PS51' {
        $errorScript=Join-Path $suite 'synthetic-stderr.ps1'
        [IO.File]::WriteAllText($errorScript,"[Console]::Error.WriteLine('person@example.invalid Bearer SYNTHETIC_SECRET'); exit 7")
        $result=Invoke-QaSaleNative -FilePath $engine -Arguments @('-NoProfile','-NonInteractive','-File',$errorScript)
        Assert-Test ($result.ExitCode -eq 7 -and $result.Output.Count -eq 0)
    }
    Invoke-Case 'duplicate PATH applications resolve to one executable without raw errors' {
        $savedPath=$env:PATH
        try {
            $node=Get-Command node -CommandType Application | Select-Object -First 1
            $nodeDirectory=Split-Path $node.Source -Parent
            $env:PATH=$nodeDirectory+[IO.Path]::PathSeparator+$nodeDirectory+[IO.Path]::PathSeparator+$savedPath
            Assert-Test (@(Get-Command node -CommandType Application).Count -gt 1)
            $result=Invoke-QaSaleNative node @('-p','parseInt(process.versions.node)')
            Assert-Test ($result.ExitCode -eq 0 -and [int]($result.Output -join '') -ge 22)
        } finally { $env:PATH=$savedPath }
    }
    Invoke-Case 'existing private checkpoint validates without browser installation credentials or network' {
        $beforeDependencies=Test-Path -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'node_modules/playwright')
        $result=Invoke-Validation
        Assert-Test ($result.ExitCode -eq 0 -and $result.Report.code -eq 'READONLY_LAUNCHER_READY')
        Assert-Test ($result.Report.checkpoint_unchanged -eq $true -and $result.Report.supabase_requests -eq 0 -and $result.Report.browser_dependencies_required -eq $false)
        Assert-Test ((Test-Path -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'node_modules/playwright')) -eq $beforeDependencies)
    }
    Invoke-Case 'second validation releases mutex and preserves directory ACL file ACL and bytes' {
        $result=Invoke-Validation
        Assert-Test ($result.ExitCode -eq 0 -and $result.Report.code -eq 'READONLY_LAUNCHER_READY')
        Assert-Test ((Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -eq $originalHash)
        Assert-Test ((Get-Acl -LiteralPath $private).Sddl -eq $directoryAcl -and (Get-Acl -LiteralPath $checkpoint).Sddl -eq $fileAcl)
    }
    Invoke-Case 'unsafe existing directory ACL blocks without resetting it or prompting credentials' {
        $acl=Get-Acl -LiteralPath $private
        $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
        [void]$acl.AddAccessRule($rule); Set-Acl -LiteralPath $private -AclObject $acl
        $unsafeAcl=(Get-Acl -LiteralPath $private).Sddl
        $result=Invoke-Validation
        Assert-Test ($result.ExitCode -eq 2 -and $result.Report.code -eq 'PRIVATE_DIRECTORY_ACL_UNSAFE' -and $result.Report.stage -eq 'PRIVATE_ACL')
        Assert-Test ((Get-Acl -LiteralPath $private).Sddl -eq $unsafeAcl -and (Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -eq $originalHash)
        Set-QaSaleNewPrivateAcl -Directory $private
    }
    Invoke-Case 'unsafe existing checkpoint ACL blocks without changing bytes or permissions' {
        $acl=Get-Acl -LiteralPath $checkpoint
        $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
        [void]$acl.AddAccessRule($rule); Set-Acl -LiteralPath $checkpoint -AclObject $acl
        $unsafeAcl=(Get-Acl -LiteralPath $checkpoint).Sddl
        $result=Invoke-Validation
        Assert-Test ($result.ExitCode -eq 2 -and $result.Report.code -eq 'PRIVATE_CHECKPOINT_ACL_UNSAFE' -and $result.Report.stage -eq 'PRIVATE_ACL')
        Assert-Test ((Get-Acl -LiteralPath $checkpoint).Sddl -eq $unsafeAcl -and (Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -eq $originalHash)
        [void]$acl.RemoveAccessRuleSpecific($rule); Set-Acl -LiteralPath $checkpoint -AclObject $acl
    }
    Invoke-Case 'invalid checkpoint filename returns a fixed path code before credential prompts' {
        $savedCheckpoint=$checkpoint
        $checkpoint=Join-Path $private 'misnamed-checkpoint.json'
        [IO.File]::WriteAllText($checkpoint,'{}')
        try {
            $result=Invoke-Validation
            Assert-Test ($result.ExitCode -eq 2 -and $result.Report.code -eq 'RECOVERY_CHECKPOINT_REQUIRED' -and $result.Report.stage -eq 'PRIVATE_PATH')
        } finally { $checkpoint=$savedCheckpoint }
        Assert-Test ((Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -eq $originalHash)
    }
    Invoke-Case 'junction recovery directory is rejected without touching the target' {
        $junction=Join-Path $suite 'nexalvo-sale-junction'
        $target=Join-Path $suite 'nexalvo-sale-junction-target'
        [void][IO.Directory]::CreateDirectory($target)
        $targetFile=Join-Path $target 'sale-recovery.json'; [IO.File]::WriteAllText($targetFile,'{}')
        $targetHash=(Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
        $script:lastCode='JUNCTION_SETUP'
        [void](New-Item -ItemType Junction -Path $junction -Target $target)
        try {
            $denied=$false
            try { [void](Resolve-QaSaleRecoveryDirectory -RecoveryFile (Join-Path $junction 'sale-recovery.json') -TempRoot $suite) }
            catch { $script:lastCode=(ConvertTo-QaSaleLauncherFailure -Exception $_.Exception -Stage PRIVATE_PATH).code; $denied=$script:lastCode -eq 'PRIVATE_REPARSE_POINT_FORBIDDEN' }
            Assert-Test $denied
            Assert-Test ((Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash -eq $targetHash)
            Assert-Test ((Get-FileHash -LiteralPath $checkpoint -Algorithm SHA256).Hash -eq $originalHash)
        } finally { $script:lastCode='JUNCTION_CLEANUP'; [IO.Directory]::Delete($junction) }
    }
} finally { [IO.Directory]::Delete($suite,$true) }
$script:tap.Add("1..$script:number"); $script:tap.Add("# tests $script:number"); $script:tap.Add("# pass $($script:number-$script:failed)")
$script:tap.Add("# fail $script:failed"); $script:tap.Add('# skipped 0')
# The Linux aggregator consumes exact root TAP lines: always emit UTF-8/LF, including PS 5.1.
[IO.File]::WriteAllText([IO.Path]::GetFullPath($TapFile),([string]::Join("`n",$script:tap)+"`n"),[Text.UTF8Encoding]::new($false))
$script:tap | Write-Output
if ($script:failed -gt 0) { exit 1 }; exit 0
