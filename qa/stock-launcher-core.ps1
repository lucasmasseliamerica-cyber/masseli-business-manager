# C1 local helpers only. Shared B native/ACL functions do not execute the B launcher or checkpoint.
. (Join-Path $PSScriptRoot 'sale-launcher-core.ps1')
function Resolve-QaStockRecovery {
    param([string]$RecoveryFile)
    $root=(Get-Item -LiteralPath ([IO.Path]::GetTempPath()) -Force).FullName.TrimEnd('\','/')
    $file=Get-Item -LiteralPath ([IO.Path]::GetFullPath($RecoveryFile)) -Force
    if ($file.PSIsContainer -or $file.Name -cne 'stock-recovery.json' -or -not $file.Directory.Name.StartsWith('nexalvo-stock-c1-',[StringComparison]::Ordinal) -or
        -not $file.Directory.FullName.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw [InvalidOperationException]::new('C1_PRIVATE_PATH') }
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw [InvalidOperationException]::new('C1_PRIVATE_LINK') }
    $ancestor=$file.Directory
    while ($null -ne $ancestor) {
        if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw [InvalidOperationException]::new('C1_PRIVATE_LINK') }
        if ([string]::Equals($ancestor.FullName.TrimEnd('\','/'),$root,[StringComparison]::OrdinalIgnoreCase)) { break }
        $ancestor=$ancestor.Parent
    }
    Assert-QaSalePrivateAcl -Directory $file.Directory.FullName -Checkpoint $file.FullName
    [string]$file.FullName
}
function Get-QaStockLauncherFailure {
    param([string]$Stage)
    $safe=@('BOOTSTRAP','GIT','MODE','CATALOG','NODE','MUTEX','CHECKPOINT_SCAN','DEPENDENCIES','PRIVATE_PATH','PRIVATE_ACL','CHECKPOINT_HASH','CREDENTIALS','RUNNER_ENV','RUNNER','REPORT','CHECKPOINT_VERIFY','CLEANUP')
    if ($Stage -notin $safe) { $Stage='BOOTSTRAP' }
    # Never read Exception.Message, identities, paths or checkpoint contents.
    [pscustomobject]@{scope='C1_WINDOWS_LAUNCHER';status='BLOCKED';code="C1_WINDOWS_${Stage}_BLOCKED";stage=$Stage;full_homologation=$false}
}
