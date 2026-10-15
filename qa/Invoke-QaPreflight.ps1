# Read-only business preflight. Prompts do not enter values into command history.
# Requires Windows PowerShell 5.1+ / PowerShell 7 and Node 22+. No transcript/debug tracing.
$ErrorActionPreference = 'Stop'
$bindings = @('QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD')
$previous = @{}
$exitCode = 1
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $branch = & git branch --show-current
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'automation/nexalvo-qa-actions') { throw 'QA branch required.' }
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
    Pop-Location
}
exit $exitCode
