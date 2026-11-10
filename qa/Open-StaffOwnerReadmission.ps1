param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ApprovalSha256)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$root = 'C:\Users\lucas\Documents\Codex\2026-11-02\co'
$journal = Join-Path $root 'work\staff-user-service\business-run-20261107-0410'
$prefix = 'owner-a-readmission-01'
$project = 'msinksoilkluooxenecy'
$origin = "https://$project.supabase.co"
$owner = 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88'
$accessModule = Join-Path $root 'work\staff-user-service\access-helper-form\StaffAccessCore.psm1'
$tokenModule = Join-Path $root 'outputs\staff-token-admission-diagnosis-20261104\codigo\StaffTokenAdmission.psm1'
$core = Join-Path $PSScriptRoot 'StaffOwnerReadmission.psm1'
$diagnostics = Join-Path $PSScriptRoot 'StaffOwnerAuthFailureReceipt.psm1'
$review = Join-Path $root 'outputs\staff-business-renewal-review-20261109\readmissao-owner-a-20261110.md'
$approvalPath = Join-Path $journal "$prefix-approval.json"
$priorResult = Join-Path $journal 'session-OWNER_A-login.result.json'
$priorReserve = Join-Path $journal 'session-OWNER_A-login.reserve.json'
$script:adminKey = $null; $script:publicKey = $null; $script:retained = $null; $script:expires = $null
$form = $null; $timer = $null; $password = $null; $ownsLock = $false
$phase = 'LOCAL_ADMISSION'; $finalCode = 'LOCAL_ADMISSION_BLOCKED'; $uncertain = $false

function Hash-OwnerFile($Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Read-OwnerData($Path) { Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -AsHashtable -DateKind String }
function Save-OwnerReceipt([string]$Name, $Data) { Write-AccessDurableJson (Join-Path $journal "$prefix-$Name.json") $Data }
function Assert-OwnerMaterial {
  if ((Hash-OwnerFile $approvalPath) -cne $ApprovalSha256 -or (Hash-OwnerFile $review) -cne $approval['review_sha256'] -or (Hash-OwnerFile $priorResult) -cne $approval['previous_result_sha256'] -or (Hash-OwnerFile $priorReserve) -cne $approval['previous_reservation_sha256']) { throw 'OWNER_APPROVAL_BINDING_DRIFT' }
  if ($approval['project'] -cne $project -or $approval['owner_id'] -cne $owner -or $approval['admin_max'] -ne 1 -or $approval['login_max'] -ne 1 -or $approval['identity_max_after_success'] -ne 1 -or $approval['operator_window_minutes'] -ne 10 -or $approval['no_retry'] -ne $true) { throw 'OWNER_APPROVAL_SCOPE_DRIFT' }
  foreach ($f in $expectedFiles) {
    if ((Hash-OwnerFile $f) -cne $approval['files'][$f]) { throw 'OWNER_CODE_DRIFT' }
  }
  if (@(Get-ChildItem -LiteralPath $journal -File | Where-Object Name -Match '^(?:command-|[A-Z][0-9]+-(?:intent|reservation|result|ack)\.json|STOP\.json|CLOSE\.json|renewed-native-lock\.json)').Count) { throw 'BUSINESS_DISPATCH_OR_LOCK_EXISTS' }
}
function Assert-OwnerSendGate {
  Assert-OwnerMaterial
  [void](Get-AccessTimeoutMs $start $end)
}
function Send-OwnerRequest([string]$Step, $Value) {
  Assert-OwnerSendGate
  $route = Get-OwnerReadmissionRoute $Step
  $client = [Net.Http.HttpClient]::new((New-AccessNativeHandler), $true)
  $client.Timeout = [TimeSpan]::FromMilliseconds((Get-AccessTimeoutMs $start $end))
  $client.MaxResponseContentBufferSize = 262144
  $req = $null; $res = $null; $raw = $null; $body = $null
  try {
    $req = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($route.method), $route.uri)
    $req.Version = [Version]::new(1, 1); $req.VersionPolicy = [Net.Http.HttpVersionPolicy]::RequestVersionExact
    $req.Headers.ConnectionClose = $true
    if ($Step -ceq 'ADMIN') {
      [void]$req.Headers.TryAddWithoutValidation('apikey', $script:adminKey)
      if ($adminKind -ceq 'LEGACY') { $req.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $script:adminKey) }
    } else {
      [void]$req.Headers.TryAddWithoutValidation('apikey', $script:publicKey)
      if ($Step -ceq 'LOGIN') {
        if ($Value -isnot [System.Collections.IDictionary] -or $Value.Count -ne 2 -or -not $Value.Contains('email') -or -not $Value.Contains('password')) { throw 'OWNER_LOGIN_BODY_DENIED' }
        $req.Content = [Net.Http.StringContent]::new(($Value | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
      } else { $req.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', [string]$Value) }
    }
    $res = $client.SendAsync($req).GetAwaiter().GetResult()
    $status = [int]$res.StatusCode
    $codes = if ($res.Headers.Contains('x-sb-error-code')) { @($res.Headers.GetValues('x-sb-error-code')) } else { @() }
    try { $raw = $res.Content.ReadAsStringAsync().GetAwaiter().GetResult(); $body = $raw | ConvertFrom-Json -AsHashtable -DateKind String } catch {}
    # Only retain the fields used by the next stage. The refresh token is never taken from the response.
    if ($Step -ceq 'LOGIN' -and $status -eq 200 -and $body -is [System.Collections.IDictionary]) {
      $body = @{ access_token = $body['access_token']; user = $body['user'] }
    }
    return @{ status = $status; codes = $codes; body = $body }
  } finally {
    if ($Step -ceq 'ADMIN') { $script:adminKey = $null }
    $Value = $null; $body = $null; $raw = $null
    if ($null -ne $res) { $res.Dispose() }
    if ($null -ne $req) { $req.Dispose() }
    $client.Dispose()
  }
}

function Get-ApprovedOwnerHandoff {
  $bridge = Join-Path $journal "$prefix-business-handoff.json"
  if (-not (Test-Path -LiteralPath $bridge)) { return $null }
  $b = Read-OwnerData $bridge
  $launchDir = Join-Path $root 'work\staff-user-service\staff-business-owner-readmission-20261110'
  $runner = Join-Path $launchDir 'staff-business-native-owner-r1.mjs'
  $windowPath = Join-Path $journal "$prefix-business-window.json"
  $admissionPath = Join-Path $journal "$prefix-business-admission.json"
  if ($b['project'] -cne $project -or $b['operator_confirmed'] -ne $true -or $b['owner_identity_sha256'] -cne (Hash-OwnerFile (Join-Path $journal "$prefix-identity.result.json")) -or $b['runner_sha256'] -cne (Hash-OwnerFile $runner) -or $b['window_sha256'] -cne (Hash-OwnerFile $windowPath) -or $b['admission_sha256'] -cne (Hash-OwnerFile $admissionPath)) { throw 'OWNER_HANDOFF_BINDING_DRIFT' }
  $w = Read-OwnerData $windowPath
  $a = Read-OwnerData $admissionPath
  if ($w['project'] -cne $project -or $w['manifest_sha256'] -cne 'de56f442bf76ed402cdc2a83c629bfd7a59205bf43cbd882a807a1c0230bc94f' -or $w['addendum_link_sha256'] -cne '61ca25cce72fac16a224df507e0146667f3fcf1daa584d8d27fe659a16f491cb' -or $w['checkpoint_sha256'] -cne 'f4b9aa823e4c33c1efc58af83fd79410b75dce26765ee764f116b81732da47f7' -or $w['no_other_staff_operations_or_TEST_DDL'] -ne $true -or $w['Edge'] -ne 17 -or $w['PATCH'] -ne 4) { throw 'OWNER_HANDOFF_SCOPE_DRIFT' }
  if ($a['window_sha256'] -cne $b['window_sha256'] -or $a['initial_state_exact'] -ne $true -or $a['quiet_at_admission'] -ne $true -or $a['edge_version'] -ne 6 -or $a['edge_source_hashes'] -ne 4) { throw 'OWNER_HANDOFF_ADMISSION_DRIFT' }
  $wstart = [DateTimeOffset]::Parse($w['start_utc']); $wcut = [DateTimeOffset]::Parse($w['cutoff_utc']); $wend = [DateTimeOffset]::Parse($w['end_utc']); $now = [DateTimeOffset]::UtcNow
  if ($wcut -le $wstart -or ($wend-$wcut).TotalMinutes -ne 10 -or ($wend-$wstart).TotalMinutes -gt 45 -or $now -lt $wstart -or $now.AddSeconds(25) -ge $wcut -or $script:expires -le $wend.AddSeconds(30)) { throw 'OWNER_HANDOFF_WINDOW_DENIED' }
  Assert-OwnerMaterial
  return @{ runner = $runner; minExpiry = $wend.ToUnixTimeSeconds()+30; receipt = $b['runner_sha256'] }
}

function Hold-OwnerSession {
  $hold = [Windows.Forms.Form]::new(); $hold.Text = 'NEXALVO — Sessão OWNER A verificada'; $hold.StartPosition = 'CenterScreen'; $hold.ClientSize = [Drawing.Size]::new(640, 250)
  $label = [Windows.Forms.Label]::new(); $label.AutoSize = $true; $label.Location = [Drawing.Point]::new(15, 15)
  $label.Text = "Sessão somente em memória. Validade UTC: $($script:expires.ToString('yyyy-MM-dd HH:mm:ss'))"; $hold.Controls.Add($label)
  $note = [Windows.Forms.Label]::new(); $note.AutoSize = $true; $note.Location = [Drawing.Point]::new(15, 42); $note.Text = 'Aguardando uma janela de negócio e admissão válidas.'; $hold.Controls.Add($note)
  $panel = [Windows.Forms.Panel]::new(); $panel.Location = [Drawing.Point]::new(15, 70); $panel.Size = [Drawing.Size]::new(610, 114); $panel.Visible = $false; $hold.Controls.Add($panel)
  $fields = @{}
  $y = 5
  foreach ($actor in @('MANAGER','EMPLOYEE')) {
    $l = [Windows.Forms.Label]::new(); $l.Text = "$actor — token existente"; $l.AutoSize = $true; $l.Location = [Drawing.Point]::new(0, $y); $panel.Controls.Add($l)
    $b = [Windows.Forms.TextBox]::new(); $b.UseSystemPasswordChar = $true; $b.Width = 412; $b.Location = [Drawing.Point]::new(184, $y); $panel.Controls.Add($b); $fields[$actor] = $b; $y += 31
  }
  $go = [Windows.Forms.Button]::new(); $go.Text = 'Entregar ao executor local'; $go.AutoSize = $true; $go.Location = [Drawing.Point]::new(184, 70); $panel.Controls.Add($go)
  $cancel = [Windows.Forms.Button]::new(); $cancel.Text = 'Encerrar sessão local'; $cancel.AutoSize = $true; $cancel.Location = [Drawing.Point]::new(15, 200); $cancel.DialogResult = 'Cancel'; $hold.CancelButton = $cancel; $hold.Controls.Add($cancel)
  $tick = [Windows.Forms.Timer]::new(); $tick.Interval = 1000
  $tick.add_Tick({
    if ([DateTimeOffset]::UtcNow.AddSeconds(30) -ge $script:expires) { $hold.Close(); return }
    try { $panel.Visible = $null -ne (Get-ApprovedOwnerHandoff) } catch { $panel.Visible = $false }
  })
  $go.add_Click({ if ($panel.Visible -and $fields.MANAGER.TextLength -gt 0 -and $fields.EMPLOYEE.TextLength -gt 0) { $hold.DialogResult = 'OK' } })
  $child = $null; $bundle = $null
  try {
    $tick.Start()
    if ($hold.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return 'OWNER_SESSION_HOLD_ENDED' }
    $handoff = Get-ApprovedOwnerHandoff
    if ($null -eq $handoff) { return 'OWNER_HANDOFF_BLOCKED' }
    [void](Get-OwnerSessionExpiry $script:retained $owner $handoff.minExpiry)
    [void](Get-OwnerSessionExpiry $fields.MANAGER.Text '96042557-c717-4750-9dd1-88b36958c6d1' $handoff.minExpiry)
    [void](Get-OwnerSessionExpiry $fields.EMPLOYEE.Text '0e03a482-5b3c-4225-baf7-4ae1ab7e9e58' $handoff.minExpiry)
    $bundle = @{ OWNER_A = $script:retained; MANAGER = $fields.MANAGER.Text; EMPLOYEE = $fields.EMPLOYEE.Text }
    foreach ($f in $fields.Values) { $f.Clear(); $f.ClearUndo() }
    Save-OwnerReceipt 'handoff-lock' @{ runner_sha256 = $handoff.receipt; utc = [DateTimeOffset]::UtcNow.ToString('o'); no_replay = $true }
    $info = [Diagnostics.ProcessStartInfo]::new((Get-Command node.exe).Source)
    $info.ArgumentList.Add($handoff.runner)
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true; $info.RedirectStandardInput = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    foreach ($name in @('NODE_OPTIONS','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','NODE_USE_ENV_PROXY')) { if ($info.Environment.ContainsKey($name)) { throw 'OWNER_HANDOFF_TRANSPORT_DRIFT' } }
    $child = [Diagnostics.Process]::new(); $child.StartInfo = $info
    if (-not $child.Start()) { throw 'OWNER_HANDOFF_PROCESS_BLOCKED' }
    Save-OwnerReceipt 'handoff-process' @{ pid = $child.Id; parent_pid = $PID; utc = [DateTimeOffset]::UtcNow.ToString('o') }
    $stdout = $child.StandardOutput.ReadToEndAsync(); $stderr = $child.StandardError.ReadToEndAsync()
    $child.StandardInput.Write(($bundle | ConvertTo-Json -Compress)); $child.StandardInput.Close()
    $bundle.Clear(); $script:retained = $null
    $child.WaitForExit()
    return 'OWNER_SESSION_HANDOFF_ENDED'
  } catch { return 'OWNER_HANDOFF_BLOCKED' }
  finally {
    if ($null -ne $bundle) { $bundle.Clear() }
    foreach ($f in $fields.Values) { $f.Clear(); $f.ClearUndo() }
    $tick.Stop(); $tick.Dispose(); $hold.Dispose()
    if ($null -ne $child) { try { $child.StandardInput.Close() } catch {}; $child.Dispose() }
  }
}

try {
  $expectedFiles = @($PSCommandPath, $core, $diagnostics, $accessModule, $tokenModule)
  $approval = Read-OwnerData $approvalPath
  Assert-OwnerMaterial
  $previous = Read-OwnerData $priorResult
  if ($previous['actor'] -cne 'OWNER_A' -or $previous['status'] -ne 400 -or $previous['passed'] -ne $false -or $previous['result_uncertain'] -ne $false) { throw 'PREVIOUS_OWNER_OUTCOME_DRIFT' }
  if (@(Get-ChildItem -LiteralPath $journal -File | Where-Object { $_.Name -like "$prefix-*" -and $_.Name -cne "$prefix-approval.json" }).Count) { throw 'OWNER_ATTEMPT_ALREADY_OPENED' }
  if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA) { throw 'OWNER_FORM_REQUIRES_STA' }
  Import-Module $accessModule -Force -DisableNameChecking
  Import-Module $tokenModule -Force -Global
  Import-Module $core -Force
  $config = @{}
  foreach ($line in (Get-Content -LiteralPath (Join-Path $repo '.env.local'))) {
    if ($line -cmatch '^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)=(.*)$') { $config[$Matches[1]] = $Matches[2].Trim().Trim('"', "'") }
  }
  if ($config['VITE_SUPABASE_URL'].TrimEnd('/') -cne $origin) { throw 'OWNER_TEST_CONFIG_DRIFT' }
  $script:publicKey = $config['VITE_SUPABASE_ANON_KEY']; [void](Get-AccessKeyKind $script:publicKey 'Public'); $config.Clear()
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Save-OwnerReceipt 'lock' @{ pid = $PID; approval_sha256 = $ApprovalSha256; utc = [DateTimeOffset]::UtcNow.ToString('o') }
  $ownsLock = $true
  $form = [Windows.Forms.Form]::new(); $form.Text = 'NEXALVO — Readmissão OWNER A TEST'; $form.StartPosition = 'CenterScreen'; $form.ClientSize = [Drawing.Size]::new(650, 222); $form.Font = [Drawing.Font]::new('Segoe UI',10)
  $label = [Windows.Forms.Label]::new(); $label.Text = 'Uma tentativa Auth de OWNER A. Informe somente os valores atuais.'; $label.AutoSize = $true; $label.Location = [Drawing.Point]::new(15, 12); $form.Controls.Add($label)
  $boxes = @{}
  $y = 48
  foreach ($field in @('Chave administrativa TEST','Senha atual de OWNER A')) {
    $l = [Windows.Forms.Label]::new(); $l.Text = $field; $l.AutoSize = $true; $l.Location = [Drawing.Point]::new(15, $y); $form.Controls.Add($l)
    $b = [Windows.Forms.TextBox]::new(); $b.UseSystemPasswordChar = $true; $b.MaxLength = 4096; $b.Width = 370; $b.Location = [Drawing.Point]::new(253, $y-3); $b.AccessibleName = $field; $form.Controls.Add($b); $boxes[$field] = $b; $y += 43
  }
  $go = [Windows.Forms.Button]::new(); $go.Text = 'Confirmar e verificar OWNER A'; $go.AutoSize = $true; $go.Enabled = $false; $go.Location = [Drawing.Point]::new(253, 151); $form.Controls.Add($go)
  $cancel = [Windows.Forms.Button]::new(); $cancel.Text = 'Cancelar'; $cancel.AutoSize = $true; $cancel.Location = [Drawing.Point]::new(505, 151); $cancel.DialogResult = 'Cancel'; $form.Controls.Add($cancel); $form.CancelButton = $cancel; $form.AcceptButton = $go
  $form.Tag = @{ boxes = $boxes; go = $go }
  foreach ($b in $boxes.Values) {
    $b.add_TextChanged({param($sender,$event) $ui=$sender.FindForm().Tag; $ui.go.Enabled = @($ui.boxes.Values | Where-Object TextLength -eq 0).Count -eq 0 })
  }
  $go.add_Click({param($sender,$event) if ($sender.Enabled) { $sender.FindForm().DialogResult = 'OK' } })
  $timer = [Windows.Forms.Timer]::new(); $timer.Interval = 1000
  $timer.add_Tick({ if ([DateTimeOffset]::UtcNow.AddSeconds(30) -ge $end) { $form.Close() } })
  $phase = 'LOCAL_MASKED_COLLECTION'
  $start = [DateTimeOffset]::UtcNow; $end = $start.AddMinutes(10)
  Save-OwnerReceipt 'form-opened' @{ pid = $PID; start_utc = $start.ToString('o'); end_utc = $end.ToString('o'); masked_fields = 2; network_started = $false }
  $timer.Start()
  if ($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { $finalCode = 'LOCAL_COLLECTION_ENDED'; return }
  $timer.Stop()
  Assert-OwnerSendGate
  $script:adminKey = $boxes['Chave administrativa TEST'].Text
  $adminKind = Get-AccessKeyKind $script:adminKey
  $password = $boxes['Senha atual de OWNER A'].Text
  if ([string]::IsNullOrEmpty($password)) { throw 'OWNER_PASSWORD_INPUT_EMPTY' }
  foreach ($b in $boxes.Values) { $b.Clear(); $b.ClearUndo() }
  $form.Dispose(); $form = $null
  $phase = 'AUTH_READMISSION'
  $result = Invoke-StaffOwnerReadmission -Gate { Assert-OwnerSendGate } -Persist { param($Name,$Data) Save-OwnerReceipt $Name $Data } -Send { param($Step,$Value) Send-OwnerRequest $Step $Value } -Password $password
  $password = $null; $script:adminKey = $null
  $phase = $result.phase; $uncertain = $result.uncertain
  if (-not $result.passed) { $finalCode = 'OWNER_AUTH_BLOCKED'; return }
  $script:retained = $result.token; $script:expires = $result.expires; $result.Clear()
  $phase = 'OWNER_SESSION_MEMORY_HOLD'
  Save-OwnerReceipt 'hold-ready' @{ pid = $PID; expires_utc = $script:expires.ToString('o'); private_memory_only = $true }
  $finalCode = Hold-OwnerSession
} catch {
  # Raw error data can contain headers, response data or secret input.
} finally {
  if ($null -ne $timer) { $timer.Stop(); $timer.Dispose() }
  if ($null -ne $form) { foreach ($b in $boxes.Values) { $b.Clear(); $b.ClearUndo() }; $form.Dispose() }
  $script:adminKey = $null; $script:publicKey = $null; $script:retained = $null; $password = $null
  if ($ownsLock) { try { Save-OwnerReceipt 'final' @{ phase = $phase; code = $finalCode; result_uncertain = $uncertain; utc = [DateTimeOffset]::UtcNow.ToString('o') } } catch {} }
}
