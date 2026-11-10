param([Parameter(Mandatory)][string]$ExistingTokenModule)
$ErrorActionPreference = 'Stop'
Import-Module $ExistingTokenModule -Global
Import-Module (Join-Path $PSScriptRoot 'StaffOwnerReadmission.psm1') -Force

$script:owner = 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88'
$script:base = 'https://msinksoilkluooxenecy.supabase.co'
function B64([string]$value) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value)).TrimEnd('=').Replace('+','-').Replace('/','_') }
$expiry = [DateTimeOffset]::UtcNow.AddMinutes(55).ToUnixTimeSeconds()
$script:token = (B64 '{"alg":"HS256"}') + '.' + (B64 (@{sub=$owner;iss="$base/auth/v1";role='authenticated';aud='authenticated';exp=$expiry;session_id='11111111-1111-4111-8111-111111111111'}|ConvertTo-Json -Compress)) + '.fixture0'
$script:events = [Collections.Generic.List[string]]::new()
$script:receipts = @{}
$script:mode = ''
$admin = Get-OwnerReadmissionRoute 'ADMIN'; $login = Get-OwnerReadmissionRoute 'LOGIN'; $identity = Get-OwnerReadmissionRoute 'IDENTITY'
if ($admin.method -cne 'GET' -or $admin.uri -cne "$base/auth/v1/admin/users/$owner" -or $login.method -cne 'POST' -or $login.uri -cne "$base/auth/v1/token?grant_type=password" -or $identity.method -cne 'GET' -or $identity.uri -cne "$base/auth/v1/user") { throw 'OWNER_ROUTE_TEST_FAILED' }
try { Get-OwnerReadmissionRoute 'REFRESH'; throw 'ROUTE_NOT_DENIED' } catch { if ($_.Exception.Message -cne 'OWNER_ROUTE_DENIED') { throw } }

function Simulate([string]$Mode) {
  $script:mode=$Mode; $script:events.Clear(); $script:receipts.Clear()
  Invoke-StaffOwnerReadmission -Password 'synthetic-password' -Gate {
    if ($script:mode -ceq 'expire-after-reserve' -and $script:receipts.ContainsKey('login.reserve')) { throw 'SYNTHETIC_EXPIRED' }
  } -Persist {
    param($Name,$Data)
    if ($script:mode -ceq 'reserve-write-fails' -and $Name -ceq 'login.reserve') { throw 'SYNTHETIC_DISK_FAILURE' }
    if ($script:receipts.ContainsKey($Name)) { throw 'SYNTHETIC_REPLAY' }
    $script:events.Add($Name); $script:receipts[$Name]=$Data
  } -Send {
    param($Step,$Value)
    $script:events.Add($Step)
    if ($Step -ceq 'ADMIN') {
      $id = if ($script:mode -ceq 'wrong-admin') { 'wrong-id' } else { $script:owner }
      return @{status=200;codes=@();body=@{id=$id;role='authenticated';email='fixture@example.test';email_confirmed_at='known'}}
    }
    if ($Step -ceq 'LOGIN') {
      if ($Value.Count -ne 2 -or $Value.email -cne 'fixture@example.test' -or $Value.password -cne 'synthetic-password') { throw 'SYNTHETIC_PAYLOAD_BINDING' }
      if ($script:mode -ceq 'http-400') { return @{status=400;codes=@('invalid_credentials');body=@{message='fixture private text';access_token='fixture private token'}} }
      if ($script:mode -ceq 'timeout') { throw 'SYNTHETIC_TIMEOUT' }
      return @{status=200;codes=@();body=@{user=@{id=$script:owner};access_token=$script:token}}
    }
    if ($Value -cne $script:token) { throw 'SYNTHETIC_TOKEN_BINDING' }
    $id = if ($script:mode -ceq 'wrong-authenticated-user') { 'wrong-id' } else { $script:owner }
    return @{status=200;codes=@();body=@{id=$id;role='authenticated'}}
  }
}
$r=Simulate 'pass'
if (-not $r.passed -or $r.token -cne $script:token -or ($script:events -join ',') -cne 'ADMIN,admin-pass,login.intent,login.reserve,LOGIN,login.result,IDENTITY,identity.result') { throw 'OWNER_ORDER_OR_PASS_FAILED' }
if (($script:receipts | ConvertTo-Json -Depth 6 -Compress) -match 'fixture|synthetic-password|access_token') { throw 'OWNER_RECEIPT_LEAK' }
$r.Clear()

$r=Simulate 'wrong-admin'; if ($r.passed -or ($script:events -join ',') -cne 'ADMIN') { throw 'OWNER_ADMIN_STOP_FAILED' }
$r=Simulate 'reserve-write-fails'; if ($r.passed -or 'LOGIN' -cin $script:events) { throw 'OWNER_RESERVATION_STOP_FAILED' }
$r=Simulate 'expire-after-reserve'; if ($r.passed -or $r.uncertain -or 'LOGIN' -cin $script:events) { throw 'OWNER_DEADLINE_STOP_FAILED' }
$r=Simulate 'http-400'; if ($r.passed -or $r.uncertain -or 'IDENTITY' -cin $script:events -or $script:receipts['login.result'].public_code -cne 'invalid_credentials') { throw 'OWNER_KNOWN_REJECTION_FAILED' }
$r=Simulate 'timeout'; if ($r.passed -or -not $r.uncertain -or 'IDENTITY' -cin $script:events) { throw 'OWNER_UNCERTAIN_STOP_FAILED' }
$r=Simulate 'wrong-authenticated-user'; if ($r.passed -or -not $r.uncertain -or $r.ContainsKey('token')) { throw 'OWNER_AUTHENTICATED_IDENTITY_STOP_FAILED' }

$tokens=$null;$errors=$null
[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Open-StaffOwnerReadmission.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'OWNER_LAUNCHER_PARSE_FAILED' }
'OWNER_READMISSION_PASS: 7 synthetic paths, exact routes, receipt redaction and launcher parse'
