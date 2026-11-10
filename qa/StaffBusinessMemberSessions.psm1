Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'StaffOwnerReadmission.psm1')
$script:Actors = [ordered]@{
  OWNER_A = 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88'
  MANAGER = '96042557-c717-4750-9dd1-88b36958c6d1'
  EMPLOYEE = '0e03a482-5b3c-4225-baf7-4ae1ab7e9e58'
}

function Assert-MemberSession([string]$Token,[string]$Actor,[long]$MinExpiry,$SessionIds) {
  [void](Get-OwnerSessionExpiry $Token $script:Actors[$Actor] $MinExpiry)
  $b = $Token.Split('.')[1].Replace('-','+').Replace('_','/')
  $b += '=' * ((4 - $b.Length % 4) % 4)
  $claim = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) | ConvertFrom-Json -AsHashtable
  if (-not $SessionIds.Add($claim['session_id'])) { throw 'MEMBER_SESSION_INDEPENDENCE_DENIED' }
}
function Assert-MemberUser($User,[string]$Actor) {
  if ($User -isnot [System.Collections.IDictionary] -or $User['id'] -cne $script:Actors[$Actor] -or $User['role'] -cne 'authenticated' -or $User['is_anonymous'] -eq $true) { throw 'MEMBER_AUTH_IDENTITY_DENIED' }
}

# This is an in-process coordinator, not a command-line input surface. The caller must bind
# Admission to an exclusive current window/authorization, LoginOnce to the durable approved
# Auth reservation, and Deliver to the private stdin of the hash-checked business executor.
function Invoke-StaffBusinessMemberSessions {
  param(
    [string]$OwnerToken,
    [DateTimeOffset]$BusinessEnd,
    [scriptblock]$Admission,
    [scriptblock]$ReadAdmin,
    [scriptblock]$LoginOnce,
    [scriptblock]$ReadUser,
    [scriptblock]$Deliver
  )
  $phase = 'OWNER_GATE'; $actor = 'OWNER_A'; $bundle = @{}; $emails = @{}; $token = $null; $reply = $null; $user = $null
  $sessionIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $minExpiry = $BusinessEnd.ToUnixTimeSeconds()+30
  try {
    Assert-MemberSession $OwnerToken 'OWNER_A' $minExpiry $sessionIds
    & $Admission
    $user = & $ReadUser 'OWNER_A' $OwnerToken
    Assert-MemberUser $user 'OWNER_A'
    $bundle.OWNER_A = $OwnerToken
    $OwnerToken = $null; $user = $null

    $phase = 'ADMIN_READ'
    foreach ($actor in @('MANAGER','EMPLOYEE')) {
      & $Admission
      $user = & $ReadAdmin $actor
      if ($user -is [System.Collections.IDictionary] -and $user.Contains('user')) { $user = $user['user'] }
      Assert-MemberUser $user $actor
      if ($user['email'] -isnot [string] -or [string]::IsNullOrWhiteSpace($user['email']) -or [string]::IsNullOrWhiteSpace($user['email_confirmed_at'])) { throw 'MEMBER_ADMIN_CONFIRMATION_DENIED' }
      $emails[$actor] = $user['email']
      $user = $null
    }
    foreach ($actor in @('MANAGER','EMPLOYEE')) {
      $phase = 'LOGIN_ONCE'
      & $Admission
      $reply = & $LoginOnce $actor $emails[$actor]
      if ($reply -isnot [System.Collections.IDictionary] -or $reply['user'] -isnot [System.Collections.IDictionary] -or $reply['user']['id'] -cne $script:Actors[$actor]) { throw 'MEMBER_LOGIN_IDENTITY_DENIED' }
      $token = [string]$reply['access_token']
      $reply = $null
      Assert-MemberSession $token $actor $minExpiry $sessionIds
      $phase = 'USER_READ'
      & $Admission
      $user = & $ReadUser $actor $token
      Assert-MemberUser $user $actor
      $bundle[$actor] = $token
      $token = $null; $user = $null
    }
    $phase = 'PRIVATE_DELIVERY'
    & $Admission
    [void](& $Deliver $bundle)
    return [pscustomobject]@{ passed = $true; phase = $phase; code = 'MEMBER_SESSIONS_DELIVERED' }
  } catch {
    # The durable login journal is authoritative for uncertainty and budget. Never echo errors.
    return [pscustomobject]@{ passed = $false; phase = $phase; actor = $actor; code = 'MEMBER_ACQUISITION_STOPPED' }
  } finally {
    $OwnerToken = $null; $token = $null; $reply = $null; $user = $null
    $emails.Clear(); $bundle.Clear(); $sessionIds.Clear()
  }
}

Export-ModuleMember -Function Invoke-StaffBusinessMemberSessions
