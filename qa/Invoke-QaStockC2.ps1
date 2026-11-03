# C2 only. No provisioner, C1/B launcher, replay, compensation or credential files.
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ValidatedCodeSha,
 [Parameter(Mandatory=$true)][string]$CatalogFile,
 [Parameter(Mandatory=$true)][string]$SecurityFile,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewedSecuritySha256,
 [switch]$PreflightOnly,[switch]$ExecuteAuthorized,[switch]$RecoverReadOnly,
 [ValidatePattern('^[a-f0-9]{64}$')][string]$JournalSemanticChecksum,
 [ValidatePattern('^[a-f0-9]{64}$')][string]$JournalBytesManifestSha256
)
$ErrorActionPreference='Stop'
$locked=$false;$mutex=$null;$pushed=$false;$previous=@{};$code=2
$names=@('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD',
 'QA_C2_VALIDATED_CODE_SHA','QA_C2_CATALOG_FILE','QA_C2_SECURITY_FILE','QA_C2_REVIEWED_SECURITY_SHA256','QA_C2_JOURNAL_SEMANTIC_CHECKSUM','QA_C2_JOURNAL_BYTES_MANIFEST_SHA256')
try {
 Set-PSDebug -Off
 . (Join-Path $PSScriptRoot 'sale-launcher-core.ps1')
 foreach($name in $names){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
 if(([int][bool]$PreflightOnly+[int][bool]$ExecuteAuthorized+[int][bool]$RecoverReadOnly) -ne 1){throw 'MODE'}
 if($RecoverReadOnly -and (-not $JournalSemanticChecksum -or -not $JournalBytesManifestSha256)){throw 'HASH'}
 if($ExecuteAuthorized -and $env:QA_C2_EXECUTION_AUTHORIZED -cne 'TEST_ONLY_C2_LOSS_AND_RESIDUAL_HISTORY_20261102'){throw 'AUTHORITY'}
 Push-Location (Split-Path $PSScriptRoot -Parent);$pushed=$true
 $branch=Invoke-QaSaleNative git @('branch','--show-current')
 $status=Invoke-QaSaleNative git @('status','--porcelain')
 if($branch.ExitCode -ne 0 -or ($branch.Output -join '') -cne 'automation/nexalvo-qa-actions' -or $status.ExitCode -ne 0 -or $status.Output.Count -ne 0){throw 'GIT'}
 if((Invoke-QaSaleNative git @('merge-base','--is-ancestor',$ValidatedCodeSha,'HEAD')).ExitCode -ne 0){throw 'SHA'}
 $diff=Invoke-QaSaleNative git @('diff','--name-only',"$ValidatedCodeSha..HEAD")
 if($diff.ExitCode -ne 0 -or @($diff.Output | Where-Object {$_ -and -not $_.StartsWith('docs/')}).Count -gt 0){throw 'CODE'}
 $mutex=[Threading.Mutex]::new($false,'Local\NEXALVOStockC2TEST')
 try{$locked=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$locked=$true;throw 'ABANDONED'}
 if(-not $locked){throw 'MUTEX'}
 $env:QA_C2_VALIDATED_CODE_SHA=$ValidatedCodeSha
 $env:QA_C2_CATALOG_FILE=[IO.Path]::GetFullPath($CatalogFile)
 $env:QA_C2_SECURITY_FILE=[IO.Path]::GetFullPath($SecurityFile)
 $env:QA_C2_REVIEWED_SECURITY_SHA256=$ReviewedSecuritySha256
 $env:QA_C2_JOURNAL_SEMANTIC_CHECKSUM=$JournalSemanticChecksum
 $env:QA_C2_JOURNAL_BYTES_MANIFEST_SHA256=$JournalBytesManifestSha256
 $env:QA_SUPABASE_URL='https://msinksoilkluooxenecy.supabase.co'
 foreach($name in @('QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD')){
   $secret=Read-Host "$name (TEST existing identity; hidden)" -AsSecureString
   $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
   try{[Environment]::SetEnvironmentVariable($name,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr),'Process')}
   finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secret.Dispose()}
 }
 $mode=if($PreflightOnly){'--preflight'}elseif($RecoverReadOnly){'--recover-readonly'}else{'--execute'}
 $result=Invoke-QaSaleNative node @((Join-Path $PSScriptRoot 'stock-c2-executor.mjs'),$mode)
 $parsed=($result.Output -join "`n") | ConvertFrom-Json
 if($parsed.status -notin @('PASS','BLOCKED') -or $parsed.code -notmatch '^C2_[A-Z0-9_]+$'){throw 'REPORT'}
 $result.Output | Write-Output;$code=$result.ExitCode
} catch { [pscustomobject]@{scope='C2_WINDOWS_LAUNCHER';status='BLOCKED';code='C2_WINDOWS_LAUNCHER_BLOCKED';full_homologation=$false} | ConvertTo-Json }
finally{
 foreach($name in $previous.Keys){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}
 if($locked){$mutex.ReleaseMutex()};if($null -ne $mutex){$mutex.Dispose()};if($pushed){Pop-Location}
}
exit $code
