Set-StrictMode -Version Latest

# Only documented Auth codes for admission/login are eligible for a receipt.
$script:PublicCodes = @(
  'bad_json', 'bad_jwt', 'captcha_failed', 'conflict', 'email_address_invalid',
  'email_not_confirmed', 'email_provider_disabled', 'hook_timeout', 'hook_timeout_after_retry',
  'insufficient_aal', 'invalid_credentials', 'no_authorization', 'over_request_rate_limit',
  'provider_disabled', 'request_timeout', 'session_expired', 'session_not_found',
  'unexpected_failure', 'user_banned', 'user_not_found', 'validation_failed', 'weak_password'
)

function Get-StaffOwnerAuthFailureReceipt {
  param(
    [int]$HttpStatus = 0,
    [AllowNull()][string[]]$HeaderCodes,
    [AllowNull()][object]$Body
  )
  $candidates = @($HeaderCodes)
  if ($Body -is [System.Collections.IDictionary]) {
    $candidates += @($Body['error_code'], $Body['code'])
  }
  $matches = @($candidates | Where-Object { $_ -is [string] -and $script:PublicCodes -ccontains $_ } | Sort-Object -Unique)
  $publicCode = if ($matches.Count -eq 1) { $matches[0] } elseif ($matches.Count -gt 1) { 'PUBLIC_CODE_CONFLICT' } else { 'PUBLIC_CODE_UNAVAILABLE' }
  $recordedStatus = if ($HttpStatus -ge 100 -and $HttpStatus -le 599) { $HttpStatus } else { $null }
  $uncertainCodes = @('request_timeout', 'hook_timeout', 'hook_timeout_after_retry', 'unexpected_failure')
  [pscustomobject]@{
    actor = 'OWNER_A'
    http_status = $recordedStatus
    public_code = $publicCode
    passed = $false
    result_uncertain = ($HttpStatus -notin @(400, 401, 403, 404, 405, 409, 422, 429) -or $publicCode -ceq 'PUBLIC_CODE_CONFLICT' -or @($matches | Where-Object { $uncertainCodes -ccontains $_ }).Count -gt 0)
  }
}

Export-ModuleMember -Function Get-StaffOwnerAuthFailureReceipt
