# Native Windows regression. Only synthetic private TEMP files; never calls Auth or TEST.
param([Parameter(Mandatory=$true)][string]$TapFile)
$ErrorActionPreference='Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) { $PSNativeCommandUseErrorActionPreference=$false }
. (Join-Path $PSScriptRoot 'stock-launcher-core.ps1')
$tap=[Collections.Generic.List[string]]::new();$tap.Add('TAP version 13');$script:failures=0;$script:number=0;$script:lastCode='NOT_CALLED'
$directory=Join-Path ([IO.Path]::GetTempPath()) ('nexalvo-stock-c1-child-launcher-synthetic-['+[Guid]::NewGuid().ToString()+']')
[void][IO.Directory]::CreateDirectory($directory);Set-QaSaleNewPrivateAcl -Directory $directory
$parent=Join-Path $directory 'stock-recovery.json'
[IO.File]::WriteAllText($parent,('{"scope":"SYNTHETIC_PRIVATE_VALUE","nonce":"'+[Guid]::NewGuid().ToString()+'"}'),[Text.UTF8Encoding]::new($false))
$parentHash=(Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash.ToLowerInvariant()
$directoryAcl=(Get-Acl -LiteralPath $directory).Sddl;$parentAcl=(Get-Acl -LiteralPath $parent).Sddl
$catalog=Join-Path $directory 'synthetic [literal] catalog.json';[IO.File]::WriteAllText($catalog,'{}')
$security=Join-Path $directory 'synthetic [literal] security.json';[IO.File]::WriteAllText($security,'{}')
$registry=Join-Path ([IO.Path]::GetTempPath()) 'nexalvo-stock-c1-child-registry'
$reservation=Join-Path $registry ($parentHash+'.reservation.json');$child=Join-Path $registry ($parentHash+'.child.json')
$registryCreated=$false;$ownRegistryFiles=[Collections.Generic.List[string]]::new()
$sha=(& git rev-parse HEAD).Trim()
$engine=if ($PSVersionTable.PSEdition -eq 'Desktop') { Join-Path $PSHOME 'powershell.exe' } else { Join-Path $PSHOME 'pwsh.exe' }
$authNames=@('QA_C1_CHILD_EXECUTION_AUTHORIZED','QA_C1_CHILD_AUTHORIZED_CODE_SHA','QA_C1_CHILD_AUTHORIZED_PARENT_SHA256')
$authBefore=@{};foreach ($name in $authNames) { $authBefore[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$null,'Process') }
function Assert-Child { param([bool]$Value) if (-not $Value) { throw [InvalidOperationException]::new('C1_CHILD_SYNTHETIC_ASSERTION') } }
function Test-Case {
    param([string]$Name,[scriptblock]$Body)
    $script:number++;$script:lastCode='NOT_CALLED'
    try { & $Body;$tap.Add("ok $script:number - $Name") }
    catch {
        $script:failures++;$tap.Add("not ok $script:number - $Name");$tap.Add("# launcher_code=$script:lastCode")
        Write-Output "::error title=NEXALVO C1 child Windows launcher::$Name - $script:lastCode"
    }
}
function Invoke-Child {
    param([string[]]$Extra=@('-PreflightOnly','-ValidateLauncherOnly'),[string]$CodeSha=$sha,
        [string]$InputParent=$parent,[string]$InputHash=$parentHash)
    $arguments=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Invoke-QaStockC1Child.ps1'),
        '-ValidatedCodeSha',$CodeSha,'-ParentCheckpoint',$InputParent,'-ParentSha256',$InputHash,
        '-CatalogFile',$catalog,'-SecurityFile',$security,'-ReviewedSecuritySha256',('a'*64))+$Extra
    $r=Invoke-QaSaleNative $engine $arguments;$encoded=$r.Output -join "`n"
    Assert-Child (-not ($encoded -match 'SYNTHETIC_PRIVATE_VALUE|Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|@|[A-Za-z]:\\'))
    $decoded=$encoded | ConvertFrom-Json
    Assert-Child ($decoded.code -cmatch '^[A-Z0-9_]+$')
    $script:lastCode=$decoded.code
    [pscustomobject]@{ExitCode=$r.ExitCode;Report=$decoded}
}
function Ensure-SyntheticRegistry {
    if (-not (Test-Path -LiteralPath $registry)) {
        # This test only creates a new directory; it never rewrites an existing registry ACL.
        $directoryJson=$registry | ConvertTo-Json -Compress
        $created=Invoke-QaSaleNative node @('--input-type=module','-') -InputText "import {mkdirSync} from 'node:fs';try{mkdirSync($directoryJson,{mode:0o700});}catch{process.exit(2)}"
        Assert-Child ($created.ExitCode -eq 0)
        $script:registryCreated=$true;Set-QaSaleNewPrivateAcl -Directory $registry
    }
    Assert-QaSalePrivateAcl -Directory $registry -Checkpoint $registry
}
function Create-SyntheticRecovery {
    Ensure-SyntheticRegistry
    foreach ($path in @($reservation,$child)) {
        Assert-Child (-not (Test-Path -LiteralPath $path))
        $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $bytes=[Text.Encoding]::UTF8.GetBytes('{"scope":"SYNTHETIC_PRIVATE_VALUE"}');$stream.Write($bytes,0,$bytes.Length) }
        finally { $stream.Dispose() }
        $ownRegistryFiles.Add($path)
    }
}
try {
    Test-Case 'C1 child native scripts parse without evaluating the executor' {
        foreach ($name in @('Invoke-QaStockC1Child.ps1','Test-QaStockC1ChildLauncher.ps1')) {
            $tokens=$null;$errors=$null
            [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors)
            Assert-Child ($errors.Count -eq 0)
        }
    }
    Test-Case 'C1 child single-backslash mutex creates acquires releases and reacquires' {
        $mutex=[Threading.Mutex]::new($false,'Local\NEXALVOC1ChildSyntheticMutex')
        try { Assert-Child ($mutex.WaitOne(0));$mutex.ReleaseMutex();Assert-Child ($mutex.WaitOne(0));$mutex.ReleaseMutex() }
        finally { $mutex.Dispose() }
    }
    Test-Case 'C1 child has no implicit execution mode even for local launcher validation' {
        $r=Invoke-Child -Extra @('-ValidateLauncherOnly')
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_MODE_BLOCKED')
    }
    Test-Case 'C1 child rejects conflicting preflight and recovery modes before prompts' {
        $r=Invoke-Child -Extra @('-PreflightOnly','-ReadOnlyRecovery','-ChildCheckpoint',$child,'-ValidateLauncherOnly')
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_MODE_BLOCKED')
    }
    Test-Case 'C1 child rejects execution without the new authorization before private registry creation' {
        $wasPresent=Test-Path -LiteralPath $registry
        $r=Invoke-Child -Extra @('-ExecuteAuthorized','-ExclusiveWindowConfirmed','-ValidateLauncherOnly')
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_AUTHORIZATION_BLOCKED')
        Assert-Child ((Test-Path -LiteralPath $registry) -eq $wasPresent)
    }
    Test-Case 'C1 child never upgrades the old C1 authorization into the new child authorization' {
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED','TEST_ONLY_EXPLICIT_C1_20261022','Process')
        try {
            $r=Invoke-Child -Extra @('-ExecuteAuthorized','-ExclusiveWindowConfirmed','-ValidateLauncherOnly')
            Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_AUTHORIZATION_BLOCKED')
        } finally { [Environment]::SetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED',$null,'Process') }
    }
    Test-Case 'C1 child rejects a valid token without its explicitly authorized code and parent bindings' {
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED','TEST_ONLY_EXPLICIT_C1_CHILD_20261023','Process')
        try {
            $r=Invoke-Child -Extra @('-ExecuteAuthorized','-ExclusiveWindowConfirmed','-ValidateLauncherOnly')
            Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_AUTHORIZATION_BLOCKED')
        } finally { [Environment]::SetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED',$null,'Process') }
    }
    Test-Case 'C1 child rejects an authorization bound to another parent or code without normalizing it' {
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED','TEST_ONLY_EXPLICIT_C1_CHILD_20261023','Process')
        try {
            foreach ($binding in @(@{Code=('0'*40);Parent=$parentHash},@{Code=$sha;Parent=('0'*64)})) {
                [Environment]::SetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_CODE_SHA',$binding.Code,'Process')
                [Environment]::SetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_PARENT_SHA256',$binding.Parent,'Process')
                $r=Invoke-Child -Extra @('-ExecuteAuthorized','-ExclusiveWindowConfirmed','-ValidateLauncherOnly')
                Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_AUTHORIZATION_BLOCKED')
            }
        } finally { foreach ($name in $authNames) { [Environment]::SetEnvironmentVariable($name,$null,'Process') } }
    }
    Test-Case 'C1 child local execution validation still needs the independent exclusive window' {
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED','TEST_ONLY_EXPLICIT_C1_CHILD_20261023','Process')
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_CODE_SHA',$sha,'Process')
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_PARENT_SHA256',$parentHash,'Process')
        try {
            $r=Invoke-Child -Extra @('-ExecuteAuthorized','-ValidateLauncherOnly')
            Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_AUTHORIZATION_BLOCKED')
        } finally { foreach ($name in $authNames) { [Environment]::SetEnvironmentVariable($name,$null,'Process') } }
    }
    Test-Case 'C1 child local preflight validates the existing parent without credentials browser or registry writes' {
        $wasPresent=Test-Path -LiteralPath $registry
        $r=Invoke-Child
        Assert-Child ($r.ExitCode -eq 0 -and $r.Report.code -eq 'C1_CHILD_LOCAL_LAUNCHER_READY')
        Assert-Child ($r.Report.parent_checkpoint_unchanged -eq $true -and $r.Report.registry_created -eq $false -and $r.Report.browser_dependencies_required -eq $false)
        Assert-Child ($r.Report.supabase_requests -eq 0 -and $r.Report.stock_requests_forwarded -eq 0 -and $r.Report.checkpoints_modified -eq 0 -and $r.Report.full_homologation -eq $false)
        Assert-Child ((Test-Path -LiteralPath $registry) -eq $wasPresent)
        Assert-Child ((Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash -ieq $parentHash)
    }
    Test-Case 'C1 child second local validation releases mutex and preserves both parent ACLs' {
        $r=Invoke-Child
        Assert-Child ($r.ExitCode -eq 0 -and $r.Report.code -eq 'C1_CHILD_LOCAL_LAUNCHER_READY')
        Assert-Child ((Get-Acl -LiteralPath $directory).Sddl -eq $directoryAcl -and (Get-Acl -LiteralPath $parent).Sddl -eq $parentAcl)
    }
    Test-Case 'C1 child rejects a parent whose content does not match the original expected hash' {
        $r=Invoke-Child -InputHash ('0'*64)
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_PARENT_HASH_BLOCKED')
        Assert-Child ((Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash -ieq $parentHash)
    }
    Test-Case 'C1 child rejects an unvalidated Git SHA before touching checkpoint or credentials' {
        $r=Invoke-Child -CodeSha ('0'*40)
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_GIT_BLOCKED')
    }
    Test-Case 'C1 child rejects another parent filename without exposing its private literal path' {
        $other=Join-Path $directory 'other.json';[IO.File]::WriteAllText($other,'SYNTHETIC_PRIVATE_VALUE')
        $r=Invoke-Child -InputParent $other
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_PARENT_PATH_BLOCKED')
    }
    Test-Case 'C1 child rejects unsafe existing parent file ACL without resetting it' {
        $original=Get-Acl -LiteralPath $parent
        $unsafe=[Security.AccessControl.FileSecurity]::new();$unsafe.SetSecurityDescriptorSddlForm($original.Sddl)
        $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
        [void]$unsafe.AddAccessRule($rule);Set-Acl -LiteralPath $parent -AclObject $unsafe
        try {
            $before=(Get-Acl -LiteralPath $parent).Sddl;$r=Invoke-Child
            Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_PARENT_PATH_BLOCKED')
            Assert-Child ((Get-Acl -LiteralPath $parent).Sddl -eq $before)
        } finally { Set-Acl -LiteralPath $parent -AclObject $original }
    }
    Test-Case 'C1 child rejects unsafe existing parent directory ACL without resetting it' {
        $original=Get-Acl -LiteralPath $directory
        $unsafe=[Security.AccessControl.DirectorySecurity]::new();$unsafe.SetSecurityDescriptorSddlForm($original.Sddl)
        $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
        [void]$unsafe.AddAccessRule($rule);Set-Acl -LiteralPath $directory -AclObject $unsafe
        try {
            $before=(Get-Acl -LiteralPath $directory).Sddl;$r=Invoke-Child
            Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_PARENT_PATH_BLOCKED')
            Assert-Child ((Get-Acl -LiteralPath $directory).Sddl -eq $before)
        } finally { Set-Acl -LiteralPath $directory -AclObject $original }
    }
    Test-Case 'C1 child normal preflight rejects invalid artifacts before credential prompts' {
        $wasPresent=Test-Path -LiteralPath $registry
        $r=Invoke-Child -Extra @('-PreflightOnly')
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_ARTIFACTS_BLOCKED')
        Assert-Child ((Test-Path -LiteralPath $registry) -eq $wasPresent)
    }
    Test-Case 'C1 child execution launcher validation does not create registry or upgrade authorization bindings' {
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_EXECUTION_AUTHORIZED','TEST_ONLY_EXPLICIT_C1_CHILD_20261023','Process')
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_CODE_SHA',$sha,'Process')
        [Environment]::SetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_PARENT_SHA256',$parentHash,'Process')
        try {
            $wasPresent=Test-Path -LiteralPath $registry
            $r=Invoke-Child -Extra @('-ExecuteAuthorized','-ExclusiveWindowConfirmed','-ValidateLauncherOnly')
            Assert-Child ($r.ExitCode -eq 0 -and $r.Report.code -eq 'C1_CHILD_LOCAL_LAUNCHER_READY')
            Assert-Child ((Test-Path -LiteralPath $registry) -eq $wasPresent)
            Assert-Child ([Environment]::GetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_CODE_SHA','Process') -ceq $sha)
            Assert-Child ([Environment]::GetEnvironmentVariable('QA_C1_CHILD_AUTHORIZED_PARENT_SHA256','Process') -ceq $parentHash)
        } finally { foreach ($name in $authNames) { [Environment]::SetEnvironmentVariable($name,$null,'Process') } }
    }
    Test-Case 'C1 child Node store reserves saves and reloads on native Windows without touching the parent or calling a backend' {
        Ensure-SyntheticRegistry
        $nodeParentDirectory=Join-Path $directory ('nexalvo-stock-c1-node-store-['+[Guid]::NewGuid().ToString()+']')
        [void][IO.Directory]::CreateDirectory($nodeParentDirectory);Set-QaSaleNewPrivateAcl -Directory $nodeParentDirectory
        $nodeParent=Join-Path $nodeParentDirectory 'stock-recovery.json'
        $nodeDirectoryAcl=(Get-Acl -LiteralPath $nodeParentDirectory).Sddl
        $program=@'
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {openC1ChildStore,C1_CHILD_AUTHORIZATION} from './qa/stock-c1-child-store.mjs';
import {C1_FIXTURE,C1_CHECKS,makeC1State,sealC1Checkpoint} from './qa/stock-c1-protocol.mjs';
import {STOCK_ACTORS} from './qa/stock-journey-core.mjs';
let localStage='SETUP';
try {
  globalThis.fetch=async()=>{throw Error('LOCAL_BACKEND_FORBIDDEN')};
  const fixture={item:{id:C1_FIXTURE.item,business_id:STOCK_ACTORS.A.business,name:C1_FIXTURE.name,
    active:true,supplier_id:null,unit:'unit',notes:'LOCAL_NODE_STORE_SYNTHETIC'},
    locations:[[C1_FIXTURE.source,C1_FIXTURE.sourceName],[C1_FIXTURE.target,C1_FIXTURE.targetName]].map(([id,name])=>
      ({id,name,business_id:STOCK_ACTORS.A.business,active:true})),
    stocks:[C1_FIXTURE.source,C1_FIXTURE.target].map(location_id=>({id:randomUUID(),inventory_item_id:C1_FIXTURE.item,
      location_id,qty:2,avg_cost_per_unit:0.1})),transactions:[],recipes:[],purchaseLines:[],waste:[]};
  const window={at:Date.now()-1000,until:Date.now()+60000};
  const parent=makeC1State(fixture,[],'a'.repeat(40),'b'.repeat(64),window);
  parent.phase='PROBES_CONFIRMED';parent.probes=[{actor:'B',status:'DENIED'},{actor:'anon',status:'DENIED'}];
  for(const name of C1_CHECKS.slice(0,8))parent.checks[name]='PASS';
  const parentBytes=Buffer.from(sealC1Checkpoint(parent));
  localStage='PARENT_WRITE';writeFileSync(process.argv[2],parentBytes,{flag:'wx',mode:0o600});
  const parentHash=createHash('sha256').update(parentBytes).digest('hex');
  const localEnv={QA_STOCK_PRIVATE_DIRECTORY_ACL:'CURRENT_USER_ONLY',QA_C1_CHILD_REGISTRY_ACL:'CURRENT_USER_ONLY',
    QA_C1_CHILD_EXECUTION_AUTHORIZED:C1_CHILD_AUTHORIZATION};
  const options={parentFile:process.argv[2],parentSha256:parentHash,env:localEnv};
  localStage='STORE_OPEN';const store=openC1ChildStore(options);
  const child=makeC1State(structuredClone(fixture),[],'a'.repeat(40),'b'.repeat(64),window);
  for(const name of C1_CHECKS.slice(0,8))child.checks[name]='PASS';
  localStage='RESERVE';store.reserve(child,'c'.repeat(64));localStage='SAVE';store.save('CHILD_RESERVED');
  const before=readFileSync(store.childFile);
  const readEnv={QA_STOCK_PRIVATE_DIRECTORY_ACL:'CURRENT_USER_ONLY',QA_C1_CHILD_REGISTRY_ACL:'CURRENT_USER_ONLY'};
  localStage='LOAD';const readonly=openC1ChildStore({...options,env:readEnv});
  // Use PowerShell's spelling too, not just the Node-generated path.
  const loaded=readonly.load(join(process.argv[3],parentHash+'.child.json'));
  if(loaded.state.phase!=='CHILD_RESERVED'||loaded.state.confirmed!==0||loaded.state.pending!==null||loaded.state.probes.length!==0||
    loaded.lineage.parent_hash!==parentHash||loaded.state.runId===parent.runId||!readFileSync(store.childFile).equals(before))throw Error('LOCAL_STATE');
  localStage='SECOND_CHILD';let denied=false;
  try{openC1ChildStore(options).reserve(makeC1State(structuredClone(fixture),[],'a'.repeat(40),'b'.repeat(64),window),'c'.repeat(64))}
  catch(error){denied=error.code==='C1_CHILD_ALREADY_RESERVED_NO_REPLAY'}
  localStage='INTEGRITY';if(!denied||!readFileSync(process.argv[2]).equals(parentBytes))throw Error('LOCAL_INTEGRITY');
  readonly.close();store.close();
  console.log('C1_CHILD_SYNTHETIC_NODE_STORE_PASS');
}catch(error){
  // Fixed diagnostic codes only. Never disclose exception messages, paths or contents.
  const safe=new Set(['C1_CHILD_ORIGINAL_HASH_REQUIRED','C1_CHILD_ORIGINAL_PATH_REQUIRED',
    'C1_CHILD_PRIVATE_TEMP_REQUIRED','C1_CHILD_LINK_FORBIDDEN','C1_CHILD_PRIVATE_TYPE_REQUIRED',
    'C1_CHILD_HARDLINK_FORBIDDEN','C1_CHILD_PARENT_ACL_REQUIRED','C1_CHILD_ORIGINAL_HASH_MISMATCH',
    'C1_CHILD_SECRET_FORBIDDEN','C1_CHILD_PARENT_TIME_REQUIRED','C1_CHILD_ZERO_OPERATION_PARENT_REQUIRED',
    'C1_CHILD_PARENT_GATES_REQUIRED','C1_CHILD_REGISTRY_PATH_REQUIRED','C1_CHILD_STORE_OPEN_REJECTED']);
  console.log(safe.has(error.code)?error.code:'C1_CHILD_SYNTHETIC_NODE_STORE_'+localStage+'_BLOCKED');process.exitCode=2
}
'@
        try {
            $r=Invoke-QaSaleNative node @('--input-type=module','-',$nodeParent,$registry) -InputText $program
            $marker=$r.Output -join ''
            $safeMarkers=@('C1_CHILD_SYNTHETIC_NODE_STORE_PASS','C1_CHILD_ORIGINAL_HASH_REQUIRED','C1_CHILD_ORIGINAL_PATH_REQUIRED',
                'C1_CHILD_PRIVATE_TEMP_REQUIRED','C1_CHILD_LINK_FORBIDDEN','C1_CHILD_PRIVATE_TYPE_REQUIRED',
                'C1_CHILD_HARDLINK_FORBIDDEN','C1_CHILD_PARENT_ACL_REQUIRED','C1_CHILD_ORIGINAL_HASH_MISMATCH',
                'C1_CHILD_SECRET_FORBIDDEN','C1_CHILD_PARENT_TIME_REQUIRED','C1_CHILD_ZERO_OPERATION_PARENT_REQUIRED',
                'C1_CHILD_PARENT_GATES_REQUIRED','C1_CHILD_REGISTRY_PATH_REQUIRED','C1_CHILD_STORE_OPEN_REJECTED')+@('SETUP','PARENT_WRITE','STORE_OPEN','RESERVE','SAVE','LOAD','SECOND_CHILD','INTEGRITY' | ForEach-Object { 'C1_CHILD_SYNTHETIC_NODE_STORE_'+$_+'_BLOCKED' })
            $script:lastCode=if($marker -cin $safeMarkers){$marker}else{'C1_CHILD_SYNTHETIC_NODE_STORE_BLOCKED'}
            Assert-Child ($r.ExitCode -eq 0 -and $script:lastCode -ceq 'C1_CHILD_SYNTHETIC_NODE_STORE_PASS')
            Assert-Child ((Get-Acl -LiteralPath $nodeParentDirectory).Sddl -eq $nodeDirectoryAcl)
            Assert-QaSalePrivateAcl -Directory $nodeParentDirectory -Checkpoint $nodeParent
            Assert-Child ((Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash -ieq $parentHash)
            Assert-Child ((Get-Acl -LiteralPath $directory).Sddl -eq $directoryAcl -and (Get-Acl -LiteralPath $parent).Sddl -eq $parentAcl)
        } finally {
            if (Test-Path -LiteralPath $nodeParent -PathType Leaf) {
                $nodeParentHash=(Get-FileHash -LiteralPath $nodeParent -Algorithm SHA256).Hash.ToLowerInvariant()
                foreach($suffix in @('.reservation.json','.child.json')) {
                    $ownFile=Join-Path $registry ($nodeParentHash+$suffix)
                    if(Test-Path -LiteralPath $ownFile -PathType Leaf){$ownRegistryFiles.Add($ownFile)}
                }
            }
        }
    }
    Test-Case 'C1 child prior reservation blocks a second child even during preflight validation' {
        Create-SyntheticRecovery
        $r=Invoke-Child
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_RESERVATION_BLOCKED')
    }
    Test-Case 'C1 child recovery validates existing private child without changing parent child registry or ACLs' {
        $childHash=(Get-FileHash -LiteralPath $child -Algorithm SHA256).Hash;$reservationHash=(Get-FileHash -LiteralPath $reservation -Algorithm SHA256).Hash
        $registryAcl=(Get-Acl -LiteralPath $registry).Sddl;$childAcl=(Get-Acl -LiteralPath $child).Sddl
        $r=Invoke-Child -Extra @('-ReadOnlyRecovery','-ChildCheckpoint',$child,'-ValidateLauncherOnly')
        Assert-Child ($r.ExitCode -eq 0 -and $r.Report.code -eq 'C1_CHILD_LOCAL_LAUNCHER_READY' -and $r.Report.supabase_requests -eq 0 -and $r.Report.checkpoints_modified -eq 0)
        Assert-Child ((Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash -ieq $parentHash)
        Assert-Child ((Get-FileHash -LiteralPath $child -Algorithm SHA256).Hash -eq $childHash -and (Get-FileHash -LiteralPath $reservation -Algorithm SHA256).Hash -eq $reservationHash)
        Assert-Child ((Get-Acl -LiteralPath $registry).Sddl -eq $registryAcl -and (Get-Acl -LiteralPath $child).Sddl -eq $childAcl)
    }
    Test-Case 'C1 child recovery rejects another filename before credentials or content parsing' {
        $other=Join-Path $registry ($parentHash+'.other.json');[IO.File]::WriteAllText($other,'SYNTHETIC_PRIVATE_VALUE');$ownRegistryFiles.Add($other)
        $r=Invoke-Child -Extra @('-ReadOnlyRecovery','-ChildCheckpoint',$other,'-ValidateLauncherOnly')
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_CHILD_PATH_BLOCKED')
    }
    Test-Case 'C1 child recovery rejects unsafe child ACL and never changes it' {
        $original=Get-Acl -LiteralPath $child
        $unsafe=[Security.AccessControl.FileSecurity]::new();$unsafe.SetSecurityDescriptorSddlForm($original.Sddl)
        $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
        [void]$unsafe.AddAccessRule($rule);Set-Acl -LiteralPath $child -AclObject $unsafe
        try {
            $before=(Get-Acl -LiteralPath $child).Sddl;$r=Invoke-Child -Extra @('-ReadOnlyRecovery','-ChildCheckpoint',$child,'-ValidateLauncherOnly')
            Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_CHILD_PATH_BLOCKED')
            Assert-Child ((Get-Acl -LiteralPath $child).Sddl -eq $before)
        } finally { Set-Acl -LiteralPath $child -AclObject $original }
    }
    Test-Case 'C1 child recovery rejects unsafe reservation ACL without rewriting it' {
        $original=Get-Acl -LiteralPath $reservation
        $unsafe=[Security.AccessControl.FileSecurity]::new();$unsafe.SetSecurityDescriptorSddlForm($original.Sddl)
        $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow)
        [void]$unsafe.AddAccessRule($rule);Set-Acl -LiteralPath $reservation -AclObject $unsafe
        try {
            $before=(Get-Acl -LiteralPath $reservation).Sddl;$r=Invoke-Child -Extra @('-ReadOnlyRecovery','-ChildCheckpoint',$child,'-ValidateLauncherOnly')
            Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_CHILD_PATH_BLOCKED')
            Assert-Child ((Get-Acl -LiteralPath $reservation).Sddl -eq $before)
        } finally { Set-Acl -LiteralPath $reservation -AclObject $original }
    }
    Test-Case 'C1 child recovery rejects invalid artifacts while leaving both checkpoints and ACLs unchanged' {
        $childHash=(Get-FileHash -LiteralPath $child -Algorithm SHA256).Hash;$childAcl=(Get-Acl -LiteralPath $child).Sddl
        $r=Invoke-Child -Extra @('-ReadOnlyRecovery','-ChildCheckpoint',$child)
        Assert-Child ($r.ExitCode -eq 2 -and $r.Report.code -eq 'C1_CHILD_WINDOWS_ARTIFACTS_BLOCKED')
        Assert-Child ((Get-FileHash -LiteralPath $child -Algorithm SHA256).Hash -eq $childHash -and (Get-Acl -LiteralPath $child).Sddl -eq $childAcl)
        Assert-Child ((Get-FileHash -LiteralPath $parent -Algorithm SHA256).Hash -ieq $parentHash)
    }
} finally {
    foreach ($name in $authNames) { [Environment]::SetEnvironmentVariable($name,$authBefore[$name],'Process') }
    foreach ($file in $ownRegistryFiles) { if (Test-Path -LiteralPath $file -PathType Leaf) { [IO.File]::Delete($file) } }
    if ($registryCreated -and (Test-Path -LiteralPath $registry) -and @(Get-ChildItem -LiteralPath $registry -Force).Count -eq 0) { [IO.Directory]::Delete($registry) }
    [IO.Directory]::Delete($directory,$true)
}
$tap.Add("1..$script:number");$tap.Add("# tests $script:number");$tap.Add("# pass $($script:number-$script:failures)");$tap.Add("# fail $script:failures");$tap.Add('# skipped 0')
[IO.File]::WriteAllText([IO.Path]::GetFullPath($TapFile),([string]::Join("`n",$tap)+"`n"),[Text.UTF8Encoding]::new($false))
$tap | Write-Output
if ($script:failures -gt 0) { exit 1 };exit 0
