# Dedicated C1 child launcher. The normal C1 launcher and immutable parent are never changed.
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ValidatedCodeSha,
    [Parameter(Mandatory=$true)][string]$ParentCheckpoint,
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ParentSha256,
    [Parameter(Mandatory=$true)][string]$CatalogFile,
    [Parameter(Mandatory=$true)][string]$SecurityFile,
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ReviewedSecuritySha256,
    [switch]$PreflightOnly,
    [switch]$ReadOnlyRecovery,
    [string]$ChildCheckpoint,
    [switch]$ExecuteAuthorized,
    [switch]$ExclusiveWindowConfirmed,
    [ValidateRange(1,30)][int]$ExclusiveWindowMinutes=20,
    [switch]$ValidateLauncherOnly
)
$ErrorActionPreference='Stop'
$exclusiveAt=[DateTime]::UtcNow # Configuration and hidden prompts consume this window.
$stage='BOOTSTRAP';$report=$null;$exitCode=2;$pushed=$false;$locked=$false;$mutex=$null
$parent=$null;$parentBefore=$null;$parentDirectoryAcl=$null;$parentFileAcl=$null;$child=$null;$childBefore=$null;$childAclBefore=$null;$reservationBefore=$null;$reservationAclBefore=$null;$registryAclBefore=$null;$registryCreated=$false
$previous=@{};$nativePreference=Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
$previousNative=if ($null -ne $nativePreference) { $nativePreference.Value } else { $null }
$bindings=@('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD',
    'QA_STOCK_ITEM_ID','QA_STOCK_SOURCE_LOCATION_ID','QA_STOCK_TARGET_LOCATION_ID','QA_STOCK_CATALOG_FILE','QA_STOCK_VALIDATED_CODE_SHA',
    'QA_STOCK_PRIVATE_DIR','QA_STOCK_PRIVATE_DIRECTORY_ACL','QA_C1_PARENT_FILE','QA_C1_PARENT_SHA256','QA_C1_SECURITY_FILE','QA_C1_REVIEWED_SECURITY_SHA256',
    'QA_C1_CHILD_REGISTRY_ACL','QA_C1_CHILD_EXECUTION_AUTHORIZED','QA_C1_CHILD_AUTHORIZED_CODE_SHA','QA_C1_CHILD_AUTHORIZED_PARENT_SHA256','QA_C1_CHILD_EXCLUSIVE_AT','QA_C1_CHILD_EXCLUSIVE_UNTIL','QA_C1_CHILD_EXCLUSIVE_WINDOW',
    'QA_STOCK_C1_AUTHORIZED','QA_STOCK_EXCLUSIVE_WINDOW','QA_STOCK_EXCLUSIVE_AT','QA_STOCK_EXCLUSIVE_UNTIL')
function Get-QaC1ChildFailure {
    param([string]$Stage)
    $safe=@('BOOTSTRAP','GIT','MODE','AUTHORIZATION','CATALOG','SECURITY','NODE','MUTEX','PARENT_PATH','PARENT_HASH',
        'REGISTRY_PATH','REGISTRY_ACL','REGISTRY_CREATE','RESERVATION','CHILD_PATH','CHILD_HASH','ARTIFACTS','DEPENDENCIES',
        'CREDENTIALS','RUNNER_ENV','RUNNER','REPORT','PARENT_VERIFY','CHILD_VERIFY','CLEANUP')
    if ($Stage -notin $safe) { $Stage='BOOTSTRAP' }
    # Fixed codes only: never serialize exceptions, private paths, identities or checkpoint content.
    $unknown=$ExecuteAuthorized -and $Stage -in @('RUNNER','REPORT','PARENT_VERIFY','CHILD_VERIFY','CLEANUP')
    [pscustomobject]@{scope='C1_CHILD_WINDOWS_LAUNCHER';status='BLOCKED';code="C1_CHILD_WINDOWS_${Stage}_BLOCKED";
        stage=$Stage;stock_requests_forwarded=$(if ($unknown) { $null } else { 0 });audit_requests_forwarded=$(if ($unknown) { $null } else { 0 });
        negative_requests_forwarded=0;execution_result_unconfirmed=[bool]$unknown;full_homologation=$false}
}
function Assert-QaC1ChildRegistryPath {
    param([string]$Directory)
    $item=Get-Item -LiteralPath $Directory -Force
    if (-not $item.PSIsContainer -or $item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw [InvalidOperationException]::new('C1_CHILD_REGISTRY') }
    $ancestor=$item
    while ($null -ne $ancestor) {
        if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw [InvalidOperationException]::new('C1_CHILD_REGISTRY') }
        $ancestor=$ancestor.Parent
    }
}
try {
    Set-PSDebug -Off
    . (Join-Path $PSScriptRoot 'stock-launcher-core.ps1')
    if ($null -ne $nativePreference) { $PSNativeCommandUseErrorActionPreference=$false }
    foreach ($name in $bindings) { $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw [InvalidOperationException]::new('C1_CHILD_PLATFORM') }
    Push-Location (Split-Path $PSScriptRoot -Parent);$pushed=$true
    $stage='GIT'
    $r=Invoke-QaSaleNative git @('branch','--show-current')
    if ($r.ExitCode -ne 0 -or ($r.Output -join '') -ne 'automation/nexalvo-qa-actions') { throw [InvalidOperationException]::new('C1_CHILD_GIT') }
    $r=Invoke-QaSaleNative git @('status','--porcelain=v1','--untracked-files=normal')
    if ($r.ExitCode -ne 0 -or $r.Output.Count -ne 0) { throw [InvalidOperationException]::new('C1_CHILD_GIT') }
    $r=Invoke-QaSaleNative git @('merge-base','--is-ancestor',$ValidatedCodeSha,'HEAD')
    if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C1_CHILD_GIT') }
    $r=Invoke-QaSaleNative git @('diff','--name-only',"$ValidatedCodeSha..HEAD")
    if ($r.ExitCode -ne 0 -or @($r.Output | Where-Object { $_ -and -not $_.StartsWith('docs/') }).Count -gt 0) { throw [InvalidOperationException]::new('C1_CHILD_GIT') }
    $stage='MODE'
    if (([int][bool]$PreflightOnly+[int][bool]$ReadOnlyRecovery+[int][bool]$ExecuteAuthorized) -ne 1 -or
        ($ReadOnlyRecovery -and -not $ChildCheckpoint) -or ($ChildCheckpoint -and -not $ReadOnlyRecovery) -or
        ($ExclusiveWindowConfirmed -and -not $ExecuteAuthorized)) { throw [InvalidOperationException]::new('C1_CHILD_MODE') }
    $executionAuthorization=$null;$authorizedCodeSha=$null;$authorizedParentSha=$null
    if ($ExecuteAuthorized) {
        $stage='AUTHORIZATION'
        $executionAuthorization=[Environment]::GetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED','Process')
        $authorizedCodeSha=[Environment]::GetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_CODE_SHA','Process')
        $authorizedParentSha=[Environment]::GetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_PARENT_SHA256','Process')
        if ($executionAuthorization -cne 'TEST_ONLY_EXPLICIT_C1_CHILD_20261023' -or -not $ExclusiveWindowConfirmed -or
            $authorizedCodeSha -cne $ValidatedCodeSha -or $authorizedParentSha -cne $ParentSha256.ToLowerInvariant()) { throw [InvalidOperationException]::new('C1_CHILD_AUTHORIZATION') }
    }
    $stage='CATALOG';$catalog=[IO.Path]::GetFullPath($CatalogFile)
    if (-not (Test-Path -LiteralPath $catalog -PathType Leaf)) { throw [InvalidOperationException]::new('C1_CHILD_CATALOG') }
    $stage='SECURITY';$security=[IO.Path]::GetFullPath($SecurityFile)
    if (-not (Test-Path -LiteralPath $security -PathType Leaf)) { throw [InvalidOperationException]::new('C1_CHILD_SECURITY') }
    $stage='NODE';$r=Invoke-QaSaleNative node @('-p','parseInt(process.versions.node)')
    if ($r.ExitCode -ne 0 -or ($r.Output -join '') -notmatch '^\d+$' -or [int]($r.Output -join '') -lt 22) { throw [InvalidOperationException]::new('C1_CHILD_NODE') }
    $stage='MUTEX';$mutex=[Threading.Mutex]::new($false,'Local\NEXALVOStockC1ChildTEST')
    try { $locked=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked=$true;throw [InvalidOperationException]::new('C1_CHILD_ABANDONED') }
    if (-not $locked) { throw [InvalidOperationException]::new('C1_CHILD_LOCKED') }
    $stage='PARENT_PATH';$parent=Resolve-QaStockRecovery -RecoveryFile $ParentCheckpoint
    $stage='PARENT_HASH';$parentBefore=(Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash
    if ($parentBefore -ine $ParentSha256) { throw [InvalidOperationException]::new('C1_CHILD_PARENT_HASH') }
    $parentDirectoryAcl=(Get-Acl -LiteralPath (Split-Path $parent -Parent)).Sddl;$parentFileAcl=(Get-Acl -LiteralPath $parent).Sddl
    $parentHash=$ParentSha256.ToLowerInvariant()
    $registry=Join-Path ([IO.Path]::GetTempPath()) 'nexalvo-stock-c1-child-registry'
    $reservation=Join-Path $registry ($parentHash+'.reservation.json')
    $expectedChild=Join-Path $registry ($parentHash+'.child.json')
    if (Test-Path -LiteralPath $registry) {
        $stage='REGISTRY_PATH';Assert-QaC1ChildRegistryPath -Directory $registry
        $stage='REGISTRY_ACL';Assert-QaSalePrivateAcl -Directory $registry -Checkpoint $registry
    }
    if ($ReadOnlyRecovery) {
        $stage='CHILD_PATH';$child=[IO.Path]::GetFullPath($ChildCheckpoint)
        if (-not [string]::Equals($child,[IO.Path]::GetFullPath($expectedChild),[StringComparison]::OrdinalIgnoreCase)) { throw [InvalidOperationException]::new('C1_CHILD_PATH') }
        $item=Get-Item -LiteralPath $child -Force
        if ($item.PSIsContainer -or $item.Name -cne ($parentHash+'.child.json') -or $item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw [InvalidOperationException]::new('C1_CHILD_PATH') }
        Assert-QaSalePrivateAcl -Directory $registry -Checkpoint $child
        if (-not (Test-Path -LiteralPath $reservation -PathType Leaf)) { throw [InvalidOperationException]::new('C1_CHILD_RESERVATION_REQUIRED') }
        $reservedItem=Get-Item -LiteralPath $reservation -Force
        if ($reservedItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw [InvalidOperationException]::new('C1_CHILD_RESERVATION_LINK') }
        Assert-QaSalePrivateAcl -Directory $registry -Checkpoint $reservation
        $stage='CHILD_HASH';$childBefore=(Get-FileHash -LiteralPath $child -Algorithm SHA256).Hash
        $childAclBefore=(Get-Acl -LiteralPath $child).Sddl;$registryAclBefore=(Get-Acl -LiteralPath $registry).Sddl
        $reservationBefore=(Get-FileHash -LiteralPath $reservation -Algorithm SHA256).Hash;$reservationAclBefore=(Get-Acl -LiteralPath $reservation).Sddl
    } else {
        $stage='RESERVATION'
        if ((Test-Path -LiteralPath $reservation) -or (Test-Path -LiteralPath $expectedChild)) { throw [InvalidOperationException]::new('C1_CHILD_ALREADY_RESERVED') }
    }
    if ($ValidateLauncherOnly) {
        $report=[pscustomobject]@{scope='C1_CHILD_WINDOWS_LAUNCHER';status='PASS';code='C1_CHILD_LOCAL_LAUNCHER_READY';
            supabase_requests=0;stock_requests_forwarded=0;audit_requests_forwarded=0;negative_requests_forwarded=0;
            checkpoints_modified=0;parent_checkpoint_unchanged=$true;registry_created=$false;browser_dependencies_required=$false;full_homologation=$false}
        $exitCode=0
    } else {
        $stage='ARTIFACTS'
        $probe="import {readFileSync} from 'node:fs'; import {validateStockCatalog} from './qa/stock-journey-core.mjs'; import {c1Precision,c1AuditContract} from './qa/stock-c1-protocol.mjs'; import {validateC1ChildSecurity} from './qa/stock-c1-child-security.mjs'; const c=validateStockCatalog(JSON.parse(readFileSync(process.argv[2],'utf8'))); c1Precision(c); c1AuditContract(c); validateC1ChildSecurity(JSON.parse(readFileSync(process.argv[3],'utf8')),process.argv[4]);"
        $r=Invoke-QaSaleNative node @('--input-type=module','-',$catalog,$security,$ReviewedSecuritySha256.ToLowerInvariant()) -InputText $probe
        if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C1_CHILD_ARTIFACTS') }
        if ($ExecuteAuthorized) {
            $stage='DEPENDENCIES'
            $r=Invoke-QaSaleNative node @('--input-type=module','-') -InputText "import {chromium} from 'playwright'; import {resolveC1ChromiumExecutable} from './qa/stock-c1-browser-runtime.mjs'; resolveC1ChromiumExecutable(chromium,process.env);"
            if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C1_CHILD_DEPENDENCIES') }
            if (-not (Test-Path -LiteralPath $registry)) {
                # mkdir is exclusive: never reset ACLs on a directory created by a competing process.
                $stage='REGISTRY_CREATE';$directoryJson=$registry | ConvertTo-Json -Compress
                $r=Invoke-QaSaleNative node @('--input-type=module','-') -InputText "import {mkdirSync} from 'node:fs'; try {mkdirSync($directoryJson,{mode:0o700});}catch{process.exit(2)}"
                if ($r.ExitCode -ne 0) { throw [InvalidOperationException]::new('C1_CHILD_REGISTRY_CREATE') }
                $registryCreated=$true
                $stage='REGISTRY_PATH';Assert-QaC1ChildRegistryPath -Directory $registry
                $stage='REGISTRY_ACL';Set-QaSaleNewPrivateAcl -Directory $registry
                Assert-QaSalePrivateAcl -Directory $registry -Checkpoint $registry
            }
        }
        $stage='CREDENTIALS'
        foreach ($name in $bindings[0..5]) {
            if ($name -eq 'QA_SUPABASE_URL') { [Environment]::SetEnvironmentVariable($name,'https://msinksoilkluooxenecy.supabase.co','Process');continue }
            if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name,'Process'))) { continue }
            $secure=Read-Host "Enter $name (hidden; process only)" -AsSecureString;$ptr=[IntPtr]::Zero
            try { $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);[Environment]::SetEnvironmentVariable($name,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr),'Process') }
            finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) };$secure.Dispose() }
        }
        $stage='RUNNER_ENV'
        $values=@{QA_STOCK_ITEM_ID='6ebfef52-f6c2-4561-b2ac-b3d4bfca1c5f';QA_STOCK_SOURCE_LOCATION_ID='f06c0bdd-8c55-4dc2-93b3-5ffcc085206f';QA_STOCK_TARGET_LOCATION_ID='d524ae32-48b8-497c-a2ab-9b4777c44f6d';
            QA_STOCK_CATALOG_FILE=$catalog;QA_STOCK_VALIDATED_CODE_SHA=$ValidatedCodeSha;QA_STOCK_PRIVATE_DIR=(Split-Path $parent -Parent);QA_STOCK_PRIVATE_DIRECTORY_ACL='CURRENT_USER_ONLY';
            QA_C1_PARENT_FILE=$parent;QA_C1_PARENT_SHA256=$parentHash;QA_C1_SECURITY_FILE=$security;QA_C1_REVIEWED_SECURITY_SHA256=$ReviewedSecuritySha256.ToLowerInvariant();
            QA_C1_CHILD_REGISTRY_ACL='CURRENT_USER_ONLY';QA_C1_CHILD_EXECUTION_AUTHORIZED='';QA_C1_CHILD_AUTHORIZED_CODE_SHA='';QA_C1_CHILD_AUTHORIZED_PARENT_SHA256='';QA_C1_CHILD_EXCLUSIVE_AT='';QA_C1_CHILD_EXCLUSIVE_UNTIL='';QA_C1_CHILD_EXCLUSIVE_WINDOW='';
            QA_STOCK_C1_AUTHORIZED='';QA_STOCK_EXCLUSIVE_WINDOW='';QA_STOCK_EXCLUSIVE_AT='';QA_STOCK_EXCLUSIVE_UNTIL=''}
        if ($ExecuteAuthorized) {
            # Preserve the separately provided authorization; never manufacture or upgrade an old token.
            $values.QA_C1_CHILD_EXECUTION_AUTHORIZED=$executionAuthorization
            $values.QA_C1_CHILD_AUTHORIZED_CODE_SHA=$authorizedCodeSha
            $values.QA_C1_CHILD_AUTHORIZED_PARENT_SHA256=$authorizedParentSha
            $values.QA_C1_CHILD_EXCLUSIVE_AT=$exclusiveAt.ToString('o')
            $values.QA_C1_CHILD_EXCLUSIVE_UNTIL=$exclusiveAt.AddMinutes($ExclusiveWindowMinutes).ToString('o')
            $values.QA_C1_CHILD_EXCLUSIVE_WINDOW='TEST_ONLY_C1_CHILD_EXCLUSIVE_WINDOW'
        }
        foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name,$values[$name],'Process') }
        $arguments=@('qa/stock-c1-child.TEST.mjs')
        if ($ReadOnlyRecovery) { $arguments+=@('--recover-readonly',$child) } elseif ($PreflightOnly) { $arguments+='--preflight' } else { $arguments+='--execute' }
        $stage='RUNNER';$r=Invoke-QaSaleNative node $arguments
        $stage='REPORT';$encoded=$r.Output -join "`n"
        if ($r.ExitCode -notin @(0,2) -or $encoded -match 'Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|sb_secret_|@|-----BEGIN|[A-Za-z]:\\') { throw [InvalidOperationException]::new('C1_CHILD_REPORT') }
        $report=$encoded | ConvertFrom-Json
        if ($report.status -notin @('PASS','BLOCKED') -or $report.scope -notin @('C1_CHILD_READONLY_PREFLIGHT','C1_CHILD_REAL_TEST_STOCK','C1_CHILD_READONLY_RECOVERY') -or $report.code -cnotmatch '^[A-Z0-9_]+$') { throw [InvalidOperationException]::new('C1_CHILD_REPORT') }
        $exitCode=$r.ExitCode
    }
} catch { $report=Get-QaC1ChildFailure -Stage $stage;$exitCode=2 }
finally {
    if ($null -ne $parentBefore -and $parent) {
        try {
            [void](Resolve-QaStockRecovery -RecoveryFile $parent)
            if ((Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash -ne $parentBefore) { throw [InvalidOperationException]::new('C1_CHILD_PARENT_CHANGED') }
            if ($null -ne $parentDirectoryAcl -and ((Get-Acl -LiteralPath (Split-Path $parent -Parent)).Sddl -ne $parentDirectoryAcl -or
                (Get-Acl -LiteralPath $parent).Sddl -ne $parentFileAcl)) { throw [InvalidOperationException]::new('C1_CHILD_PARENT_ACL_CHANGED') }
        }
        catch { $report=Get-QaC1ChildFailure -Stage 'PARENT_VERIFY';$exitCode=2 }
    }
    if ($null -ne $childBefore -and $child) {
        try {
            if (((Get-Item -LiteralPath $child -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                ((Get-Item -LiteralPath $reservation -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                (Get-FileHash -LiteralPath $child -Algorithm SHA256).Hash -ne $childBefore -or
                (Get-Acl -LiteralPath $child).Sddl -ne $childAclBefore -or
                (Get-Acl -LiteralPath $registry).Sddl -ne $registryAclBefore -or
                (Get-FileHash -LiteralPath $reservation -Algorithm SHA256).Hash -ne $reservationBefore -or
                (Get-Acl -LiteralPath $reservation).Sddl -ne $reservationAclBefore) { throw [InvalidOperationException]::new('C1_CHILD_RECOVERY_CHANGED') }
        }
        catch { $report=Get-QaC1ChildFailure -Stage 'CHILD_VERIFY';$exitCode=2 }
    }
    foreach ($name in $bindings) { if ($previous.ContainsKey($name)) { [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process') } }
    if ($null -ne $nativePreference) { $PSNativeCommandUseErrorActionPreference=$previousNative }
    if ($locked) { try { $mutex.ReleaseMutex() } catch { $report=Get-QaC1ChildFailure -Stage 'CLEANUP';$exitCode=2 } }
    if ($null -ne $mutex) { $mutex.Dispose() }
    if ($pushed) { Pop-Location }
}
$report | ConvertTo-Json -Depth 16
exit $exitCode
