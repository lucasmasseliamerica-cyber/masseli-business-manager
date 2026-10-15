# Read-only business preflight. Prompts do not enter values into command history.
# Requires Windows PowerShell 5.1+ / PowerShell 7 and Node 22+. No transcript/debug tracing.
$ErrorActionPreference = 'Stop'
$bindings = @('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD')
$previous = @{}
$exitCode = 1
$locationPushed = $false
$requiredAncestor = '83bac13b201916a8504e44b827e369be437da3ce'
$nativePreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
$previousNativePreference = if ($null -ne $nativePreference) { $nativePreference.Value } else { $null }
try {
    # A nonzero native exit must remain inspectable, including the preflight BLOCKED exit 2.
    if ($null -ne $nativePreference) { Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $false }
    Push-Location (Split-Path $PSScriptRoot -Parent)
    $locationPushed = $true
    $branch = & git branch --show-current
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'automation/nexalvo-qa-actions') { throw 'QA branch required.' }
    $worktree = @(& git status --porcelain=v1 --untracked-files=normal)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect QA worktree.' }
    if ($worktree.Count -ne 0) { throw 'Clean QA worktree required; preserve local changes before running preflight. No cleanup was performed.' }
    & git merge-base --is-ancestor $requiredAncestor HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Required validated QA source is not present in this checkout.' }
    $sha = & git rev-parse --verify HEAD
    if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') { throw 'Unable to identify QA source SHA.' }
    Write-Host "PREFLIGHT SOURCE: branch=$branch sha=$sha clean=true validated_ancestor=83bac13"
    foreach ($name in $bindings) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ([string]::IsNullOrEmpty($previous[$name])) {
            if ($name -eq 'QA_SUPABASE_URL') {
                [Environment]::SetEnvironmentVariable($name, 'https://msinksoilkluooxenecy.supabase.co', 'Process')
                continue
            }
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
    }
    & node qa/p0-preflight-readonly.TEST.mjs
    $exitCode = $LASTEXITCODE
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $previous.Clear()
    if ($locationPushed) { Pop-Location }
    if ($null -ne $nativePreference) { Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $previousNativePreference }
}
exit $exitCode
