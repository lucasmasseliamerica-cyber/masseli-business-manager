# Windows native smoke. Synthetic catalog only; no credentials, Supabase or inventory writes.
param([Parameter(Mandatory=$true)][string]$TapFile)
$ErrorActionPreference='Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) { $PSNativeCommandUseErrorActionPreference=$false }
. (Join-Path $PSScriptRoot 'sale-launcher-core.ps1')
$tap=[Collections.Generic.List[string]]::new(); $tap.Add('TAP version 13')
$script:failures=0; $script:number=0
$directory=Join-Path ([IO.Path]::GetTempPath()) ('nexalvo-stock-launcher-'+[Guid]::NewGuid().ToString())
[void][IO.Directory]::CreateDirectory($directory)
$catalog=Join-Path $directory 'synthetic [literal] catalog.json'; [IO.File]::WriteAllText($catalog,'{}')
$hash=(Get-FileHash -LiteralPath $catalog -Algorithm SHA256).Hash
$sha=(& git rev-parse HEAD).Trim()
$engine=if ($PSVersionTable.PSEdition -eq 'Desktop') { Join-Path $PSHOME 'powershell.exe' } else { Join-Path $PSHOME 'pwsh.exe' }
function Assert-StockTest { param([bool]$Condition) if (-not $Condition) { throw [InvalidOperationException]::new('C_SYNTHETIC_ASSERTION') } }
function Test-Case {
    param([string]$Name,[scriptblock]$Body)
    $script:number++
    try { & $Body; $tap.Add("ok $script:number - $Name") }
    catch { $script:failures++; $tap.Add("not ok $script:number - $Name"); Write-Output "::error title=NEXALVO C Windows launcher::$Name" }
}
function Invoke-StockValidation {
    param([string]$CodeSha=$sha,[bool]$LocalOnly=$true)
    $arguments=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Invoke-QaStockPreflight.ps1'),
        '-ValidatedCodeSha',$CodeSha,'-FixtureItemId','11111111-1111-4111-8111-111111111111',
        '-SourceLocationId','22222222-2222-4222-8222-222222222222','-TargetLocationId','33333333-3333-4333-8333-333333333333','-CatalogFile',$catalog)
    if ($LocalOnly) { $arguments+='-ValidateLauncherOnly' }
    $native=Invoke-QaSaleNative -FilePath $engine -Arguments $arguments
    $output=$native.Output -join "`n"
    Assert-StockTest (-not ($output -match 'Bearer\s|example\.invalid|[A-Za-z]:\\|SYNTHETIC_SECRET'))
    [pscustomobject]@{ExitCode=$native.ExitCode;Report=($output | ConvertFrom-Json)}
}
try {
    Test-Case 'C launcher parses under the native PowerShell engine' {
        foreach ($name in @('Invoke-QaStockPreflight.ps1','Test-QaStockPreflightLauncher.ps1')) {
            $tokens=$null; $errors=$null
            [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors)
            Assert-StockTest ($errors.Count -eq 0)
        }
    }
    Test-Case 'C local validation needs no credentials network dependencies or checkpoint' {
        $result=Invoke-StockValidation
        Assert-StockTest ($result.ExitCode -eq 0 -and $result.Report.code -eq 'C_LOCAL_LAUNCHER_READY' -and $result.Report.persistent_authorized -eq $false -and $result.Report.supabase_requests -eq 0)
        Assert-StockTest ((Get-FileHash -LiteralPath $catalog -Algorithm SHA256).Hash -eq $hash)
    }
    Test-Case 'C unvalidated SHA blocks without disclosing native stderr or requesting credentials' {
        $result=Invoke-StockValidation -CodeSha ('0'*40)
        Assert-StockTest ($result.ExitCode -eq 2 -and $result.Report.code -eq 'C_WINDOWS_GIT_BLOCKED')
    }
    Test-Case 'C invalid catalog blocks normal preflight before hidden prompts or network' {
        $result=Invoke-StockValidation -LocalOnly $false
        Assert-StockTest ($result.ExitCode -eq 2 -and $result.Report.code -eq 'C_WINDOWS_CATALOG_BLOCKED')
        Assert-StockTest ((Get-FileHash -LiteralPath $catalog -Algorithm SHA256).Hash -eq $hash)
    }
} finally { [IO.Directory]::Delete($directory,$true) }
$tap.Add("1..$script:number"); $tap.Add("# tests $script:number"); $tap.Add("# pass $($script:number-$script:failures)")
$tap.Add("# fail $script:failures"); $tap.Add('# skipped 0')
[IO.File]::WriteAllText([IO.Path]::GetFullPath($TapFile),([string]::Join("`n",$tap)+"`n"),[Text.UTF8Encoding]::new($false))
$tap | Write-Output
if ($script:failures -gt 0) { exit 1 }; exit 0
