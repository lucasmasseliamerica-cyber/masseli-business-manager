param([Parameter(Mandatory)][string]$ExistingTokenModule)
$ErrorActionPreference = 'Stop'
Import-Module $ExistingTokenModule -Global
Import-Module (Join-Path $PSScriptRoot 'StaffBusinessMemberSessions.psm1') -Force

$script:ids = @{ OWNER_A='f37e9907-47c4-48bf-94b7-9a6fa5de1f88'; MANAGER='96042557-c717-4750-9dd1-88b36958c6d1'; EMPLOYEE='0e03a482-5b3c-4225-baf7-4ae1ab7e9e58' }
$script:end = [DateTimeOffset]::UtcNow.AddMinutes(30)
$script:trace = [Collections.Generic.List[string]]::new()
$script:mode = ''
function Encode([string]$value) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value)).TrimEnd('=').Replace('+','-').Replace('/','_') }
function Token([string]$actor,[string]$sessionId) {
  (Encode '{"alg":"HS256"}')+'.'+(Encode (@{sub=$script:ids[$actor];iss='https://msinksoilkluooxenecy.supabase.co/auth/v1';role='authenticated';aud='authenticated';exp=$script:end.AddMinutes(5).ToUnixTimeSeconds();session_id=$sessionId}|ConvertTo-Json -Compress))+'.fixture0'
}
function Simulate([string]$Mode) {
  $script:mode = $Mode; $script:trace.Clear()
  $owner = if ($Mode -ceq 'missing-owner') { '' } else { Token 'OWNER_A' '11111111-1111-4111-8111-111111111111' }
  Invoke-StaffBusinessMemberSessions -OwnerToken $owner -BusinessEnd $script:end -Admission {} -ReadUser {
    param($Actor,$Session)
    $script:trace.Add("USER-$Actor")
    @{id=$script:ids[$Actor];role='authenticated'}
  } -ReadAdmin {
    param($Actor)
    $script:trace.Add("ADMIN-$Actor")
    $id = if ($script:mode -ceq 'wrong-employee-admin' -and $Actor -ceq 'EMPLOYEE') { 'wrong' } else { $script:ids[$Actor] }
    @{id=$id;role='authenticated';email='fixture@example.test';email_confirmed_at='fixture'}
  } -LoginOnce {
    param($Actor,$Email)
    $script:trace.Add("LOGIN-$Actor")
    if ($script:mode -ceq 'login-rejected') { throw 'synthetic first login failure' }
    $sessionId = if ($Actor -ceq 'MANAGER' -or $script:mode -ceq 'duplicate') {'22222222-2222-4222-8222-222222222222'} else {'33333333-3333-4333-8333-333333333333'}
    @{user=@{id=$script:ids[$Actor]};access_token=(Token $Actor $sessionId);refresh_token='synthetic-not-transferred'}
  } -Deliver {
    param($Bundle)
    if ($Bundle.Count -ne 3 -or -not $Bundle.ContainsKey('OWNER_A') -or -not $Bundle.ContainsKey('MANAGER') -or -not $Bundle.ContainsKey('EMPLOYEE')) { throw 'PRIVATE_BUNDLE_SHAPE_FAILED' }
    $script:trace.Add('DELIVER')
  }
}

$r=Simulate 'pass'
if (-not $r.passed -or ($script:trace -join ',') -cne 'USER-OWNER_A,ADMIN-MANAGER,ADMIN-EMPLOYEE,LOGIN-MANAGER,USER-MANAGER,LOGIN-EMPLOYEE,USER-EMPLOYEE,DELIVER' -or ($r | ConvertTo-Json -Compress) -match 'fixture|access_token|refresh_token') { throw 'MEMBER_ACQUISITION_ORDER_FAILED' }
$r=Simulate 'missing-owner'; if ($r.passed -or $script:trace.Count -ne 0) { throw 'OWNER_REQUIRED_BEFORE_MEMBER_NETWORK_FAILED' }
$r=Simulate 'wrong-employee-admin'; if ($r.passed -or @($script:trace -match '^LOGIN-').Count) { throw 'BOTH_ADMIN_IDS_REQUIRED_FAILED' }
$r=Simulate 'login-rejected'; if ($r.passed -or 'LOGIN-EMPLOYEE' -cin $script:trace -or 'DELIVER' -cin $script:trace) { throw 'FIRST_FAILURE_STOPS_BATCH_FAILED' }
$r=Simulate 'duplicate'; if ($r.passed -or 'USER-EMPLOYEE' -cin $script:trace -or 'DELIVER' -cin $script:trace) { throw 'DUPLICATE_SESSION_STOPS_DELIVERY_FAILED' }
'STAFF_MEMBER_ACQUISITION_PLAN_PASS: 5 synthetic paths; no remote requests'
