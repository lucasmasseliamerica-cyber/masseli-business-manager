$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'StaffOwnerAuthFailureReceipt.psm1') -Force

$one = Get-StaffOwnerAuthFailureReceipt -HttpStatus 400 -HeaderCodes invalid_credentials -Body @{ error_code = 'invalid_credentials'; message = 'synthetic private text'; access_token = 'synthetic private token' }
if ($one.public_code -cne 'invalid_credentials' -or $one.http_status -ne 400 -or $one.result_uncertain -or ($one | ConvertTo-Json -Compress) -match 'synthetic|message|access_token') { throw 'PUBLIC_CODE_ALLOWLIST_FAILED' }

$absent = Get-StaffOwnerAuthFailureReceipt -HttpStatus 400 -HeaderCodes 'synthetic_unlisted' -Body @{ code = 400; error_description = 'synthetic private text' }
if ($absent.public_code -cne 'PUBLIC_CODE_UNAVAILABLE' -or $absent.result_uncertain) { throw 'HTTP_400_NO_INFERRED_CAUSE_FAILED' }

$conflict = Get-StaffOwnerAuthFailureReceipt -HttpStatus 400 -HeaderCodes invalid_credentials -Body @{ code = 'email_not_confirmed' }
if ($conflict.public_code -cne 'PUBLIC_CODE_CONFLICT' -or -not $conflict.result_uncertain) { throw 'CONFLICTING_CODE_STOP_FAILED' }

foreach ($status in @(0, 408, 502)) {
  $uncertain = Get-StaffOwnerAuthFailureReceipt -HttpStatus $status -Body $null
  if (-not $uncertain.result_uncertain -or ($status -eq 0 -and $null -ne $uncertain.http_status)) { throw 'UNCERTAIN_HTTP_STOP_FAILED' }
}
$timeoutCode = Get-StaffOwnerAuthFailureReceipt -HttpStatus 400 -Body @{ code = 'request_timeout' }
if (-not $timeoutCode.result_uncertain) { throw 'UNCERTAIN_CODE_STOP_FAILED' }

'STAFF_OWNER_AUTH_RECEIPT_PASS: allowlist, absence, conflict, transport and timeout'
