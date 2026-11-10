Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'StaffOwnerAuthFailureReceipt.psm1')
$script:Owner = 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88'
$script:Origin = 'https://msinksoilkluooxenecy.supabase.co'

function Get-OwnerReadmissionRoute([string]$Step) {
  switch -CaseSensitive ($Step) {
    'ADMIN' { return @{ method = 'GET'; uri = "$script:Origin/auth/v1/admin/users/$script:Owner" } }
    'LOGIN' { return @{ method = 'POST'; uri = "$script:Origin/auth/v1/token?grant_type=password" } }
    'IDENTITY' { return @{ method = 'GET'; uri = "$script:Origin/auth/v1/user" } }
    default { throw 'OWNER_ROUTE_DENIED' }
  }
}

function Get-OwnerSessionExpiry([string]$Token, [string]$ActorId, [long]$MinExpiry) {
  if ($Token.Length -gt 8192 -or $Token -cnotmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' -or -not (Get-StaffTokenAdmission -Token $Token).Passed) { throw 'OWNER_TOKEN_LOCAL_DENIED' }
  $b64 = $Token.Split('.')[1].Replace('-', '+').Replace('_', '/')
  $b64 += '=' * ((4 - $b64.Length % 4) % 4)
  $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json -AsHashtable -DateKind String
  if ($claims['sub'] -cne $ActorId -or $claims['aud'] -cne 'authenticated' -or $claims['session_id'] -isnot [string] -or $claims['session_id'] -cnotmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' -or $claims['exp'] -isnot [long] -or $claims['exp'] -le $MinExpiry) { throw 'OWNER_TOKEN_BINDING_DENIED' }
  return [DateTimeOffset]::FromUnixTimeSeconds($claims['exp'])
}

function Invoke-StaffOwnerReadmission {
  param([scriptblock]$Send, [scriptblock]$Gate, [scriptblock]$Persist, [string]$Password)
  $phase = 'ADMIN'; $reserved = $false; $entered = $false; $status = 0; $token = $null; $response = $null
  try {
    & $Gate
    $response = & $Send 'ADMIN' $null
    $status = $response.status
    if ($status -ne 200) {
      $failure = Get-StaffOwnerAuthFailureReceipt -HttpStatus $status -HeaderCodes $response.codes -Body $response.body
      & $Persist 'admin-failure' @{ http_status = $failure.http_status; public_code = $failure.public_code }
      return @{ passed = $false; phase = $phase; uncertain = $false }
    }
    $user = $response.body
    if ($user -is [System.Collections.IDictionary] -and $user.Contains('user')) { $user = $user['user'] }
    if ($user -isnot [System.Collections.IDictionary] -or $user['id'] -cne $script:Owner -or $user['role'] -cne 'authenticated' -or $user['email'] -isnot [string] -or [string]::IsNullOrWhiteSpace($user['email']) -or [string]::IsNullOrWhiteSpace($user['email_confirmed_at']) -or $user['is_anonymous'] -eq $true) { throw 'OWNER_ADMIN_IDENTITY_DENIED' }
    $email = $user['email']
    & $Persist 'admin-pass' @{ http_status = 200; identity_pass = $true }
    $response = $null; $user = $null

    $phase = 'LOGIN'; $status = 0
    & $Gate
    & $Persist 'login.intent' @{ operation = 'AUTH_PASSWORD_LOGIN_ONLY'; owner_id = $script:Owner }
    & $Gate
    & $Persist 'login.reserve' @{ forwarding_attempts_reserved = 1; remaining = 0; no_replay = $true }
    $reserved = $true
    & $Gate
    $entered = $true
    $response = & $Send 'LOGIN' @{ email = $email; password = $Password }
    $Password = $null; $email = $null
    $status = $response.status
    if ($status -ne 200) {
      $failure = Get-StaffOwnerAuthFailureReceipt -HttpStatus $status -HeaderCodes $response.codes -Body $response.body
      & $Persist 'login.result' $failure
      return @{ passed = $false; phase = $phase; uncertain = $failure.result_uncertain }
    }
    if ($response.body -isnot [System.Collections.IDictionary] -or $response.body['user'] -isnot [System.Collections.IDictionary] -or $response.body['user']['id'] -cne $script:Owner) { throw 'OWNER_LOGIN_IDENTITY_DENIED' }
    $token = [string]$response.body['access_token']
    $expiry = Get-OwnerSessionExpiry $token $script:Owner ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 30)
    $response = $null
    & $Persist 'login.result' @{ http_status = 200; passed = $true; result_uncertain = $false }

    $phase = 'IDENTITY'; $status = 0
    & $Gate
    $response = & $Send 'IDENTITY' $token
    $status = $response.status
    if ($status -ne 200) {
      $failure = Get-StaffOwnerAuthFailureReceipt -HttpStatus $status -HeaderCodes $response.codes -Body $response.body
      & $Persist 'identity.result' @{ http_status = $failure.http_status; public_code = $failure.public_code; result_uncertain = $true }
      return @{ passed = $false; phase = $phase; uncertain = $true }
    }
    if ($response.body -isnot [System.Collections.IDictionary] -or $response.body['id'] -cne $script:Owner -or $response.body['role'] -cne 'authenticated' -or $response.body['is_anonymous'] -eq $true) { throw 'OWNER_USER_IDENTITY_DENIED' }
    $expiry = Get-OwnerSessionExpiry $token $script:Owner ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 30)
    & $Persist 'identity.result' @{ http_status = 200; identity_pass = $true; expires_utc = $expiry.ToString('o'); result_uncertain = $false }
    return @{ passed = $true; phase = $phase; uncertain = $false; token = $token; expires = $expiry }
  } catch {
    $uncertain = $entered
    if ($reserved) {
      $receiptName = if ($phase -ceq 'LOGIN') { 'login.result' } else { 'identity.result' }
      $safeStatus = if ($status -ge 100 -and $status -le 599) { $status } else { $null }
      try { & $Persist $receiptName @{ http_status = $safeStatus; public_code = 'PUBLIC_CODE_UNAVAILABLE'; result_uncertain = $uncertain } } catch {}
    }
    return @{ passed = $false; phase = $phase; uncertain = $uncertain }
  } finally { $Password = $null; $token = $null; $response = $null; $user = $null; $email = $null }
}

Export-ModuleMember -Function Get-OwnerReadmissionRoute, Get-OwnerSessionExpiry, Invoke-StaffOwnerReadmission
