# Native visible console required. No password parameter, transcript or seed by default.
param(
 [ValidateSet('VerifyReadOnly','SeedAuthorized')][string]$Mode='VerifyReadOnly',
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ReviewedHead,
 [Parameter(Mandatory=$true)][string]$Psql17Exe,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$PsqlSha256,
 [Parameter(Mandatory=$true)][string]$CaPath,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$CaSha256,
 [Parameter(Mandatory=$true)][string]$ArtifactRoot,
 [string]$ConnectionEvidenceFile,[string]$SeedApproval,[string]$WindowAt,[string]$WindowUntil
)
$ErrorActionPreference='Stop'
try{
 Set-PSDebug -Off
 if($Host.Name -ne 'ConsoleHost' -or [Console]::IsInputRedirected -or $env:OSTYPE -eq 'msys'){throw 'NATIVE_CONSOLE_REQUIRED'}
 $label=if($Mode -eq 'VerifyReadOnly'){'NEXALVO C2 - SOMENTE LEITURA'}else{'NEXALVO C2 - SEED AUTORIZADO UMA TENTATIVA'}
 $Host.UI.RawUI.WindowTitle=$label+' - '+$ReviewedHead.Substring(0,7)+' - '+[DateTime]::Now.ToString('HHmmss')
 Write-Host 'Senha apenas no prompt nativo oculto do psql. Nao envie senha ao chat.'
 $argsList=@((Join-Path $PSScriptRoot 'stock-c2-seed-launcher.mjs'),'--mode',$Mode,'--reviewed-head',$ReviewedHead,'--psql',$Psql17Exe,'--psql-sha256',$PsqlSha256,'--ca',$CaPath,'--ca-sha256',$CaSha256,'--artifacts',$ArtifactRoot)
 foreach($pair in @(@('--connection-evidence',$ConnectionEvidenceFile),@('--seed-approval',$SeedApproval),@('--window-at',$WindowAt),@('--window-until',$WindowUntil))){if($pair[1]){$argsList+=@($pair[0],$pair[1])}}
 & node @argsList
 exit $LASTEXITCODE
}catch{Write-Output '{"scope":"C2_SEED_LAUNCHER","status":"BLOCKED","code":"C2_SEED_NATIVE_CONSOLE_OR_LAUNCHER_BLOCKED","retry_allowed":false}';exit 2}
