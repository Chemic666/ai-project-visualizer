param(
  [Parameter(Mandatory)][ValidateSet('baseline', 'launch', 'exit')][string]$Action,
  [Parameter(Mandatory)][string]$AcceptanceId,
  [ValidateSet('probe', 'write', 'read')][string]$Mode = 'probe',
  [string]$ObservationId,
  [string]$ReadAttemptId
)
$ErrorActionPreference = 'Stop'
$taskMode = if ($Action -eq 'baseline') { 'baseline' } elseif ($Action -eq 'exit') { 'exit' } else { $Mode }
if ($ObservationId -and -not ($Action -eq 'exit' -or ($Action -eq 'launch' -and $Mode -eq 'read'))) { throw 'ObservationId is only for exit or read; other modes must not consume exit evidence' }
if ($Action -eq 'launch' -and $Mode -eq 'read' -and -not $ObservationId) { throw 'Read requires an explicit exit ObservationId; never automatically select old/latest evidence' }
if ($ReadAttemptId -and -not ($Action -eq 'launch' -and $Mode -eq 'read')) { throw 'ReadAttemptId is only for a read retry' }
$taskPathArgs = @('paths', $AcceptanceId, $taskMode)
if ($ObservationId) { $taskPathArgs += $ObservationId }
if ($ReadAttemptId) { $taskPathArgs += $ReadAttemptId }
$taskConfigText = & node (Join-Path $PSScriptRoot 'w3-evidence.cjs') @taskPathArgs
if ($LASTEXITCODE -ne 0) { throw 'Invalid acceptance namespace; stop' }
$taskConfig = $taskConfigText | ConvertFrom-Json
function Write-NewJson([string]$File, $Value) {
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 12) + "`n")
  $stream = [System.IO.File]::Open($File, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
  try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}
function Get-Snapshot {
  try {
    $taskProcesses = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5 -ErrorAction Stop | ForEach-Object {
      $created = if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ') } else { $null }
      $commandReadable = -not [string]::IsNullOrEmpty($_.CommandLine)
      $profilePattern = '(?i)(?:^|[=\s"])' + [regex]::Escape($taskConfig.profile) + '(?=$|[\s"])'
      $profileMatch = $commandReadable -and [regex]::IsMatch($_.CommandLine, $profilePattern)
      @{ pid = [int]$_.ProcessId; createdAt = $created; parentPid = $(if ($null -ne $_.ParentProcessId) { [int]$_.ParentProcessId } else { $null }); codeCandidate = ($_.Name -ieq 'Code.exe'); commandLineReadable = $commandReadable; profileMatch = $profileMatch; otherProfile = ($commandReadable -and -not $profileMatch -and $_.CommandLine -match '(?i)--user-data-dir[=\s]') }
    })
    return @{ recordedAt = [DateTime]::UtcNow.ToString('o'); readable = $true; processes = $taskProcesses }
  } catch {
    return @{ recordedAt = [DateTime]::UtcNow.ToString('o'); readable = $false; processes = @(); errorType = $_.Exception.GetType().Name }
  }
}
function Get-IndependentProcessObservation($Identity) {
  # Validate before conversion/query: arrays must never become one PID query.
  if ($Identity.pid -isnot [int] -and $Identity.pid -isnot [long]) { throw 'Known PID must be a scalar integer' }
  if ($Identity.pid -le 0 -or $Identity.pid -gt [int]::MaxValue -or $Identity.createdAt -isnot [string]) { throw 'Invalid known process identity' }
  $taskTime = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse($Identity.createdAt, [ref]$taskTime)) { throw 'Known creation time unreadable' }
  $check = @{ pid=$Identity.pid; expectedCreatedAt=$Identity.createdAt; observedAt=[DateTime]::UtcNow.ToString('o'); source='System.Diagnostics.Process'; queryExecuted=$false; state='unreadable'; resultCode='query_failed' }
  $observedProcess = $null
  try {
    $check.queryExecuted = $true
    try { $observedProcess = [System.Diagnostics.Process]::GetProcessById([int]$Identity.pid) }
    catch [System.ArgumentException] {
      # Only an actual GetProcessById not-found result proves absence.
      $check.state = 'gone'; $check.resultCode = 'process_not_found'
      $check.errorType = $_.Exception.GetType().Name
    }
    if ($observedProcess) {
      $check.currentCreatedAt = $observedProcess.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')
      $check.state = if ($check.currentCreatedAt -eq $Identity.createdAt) { 'alive' } else { 'pid_reused' }
      $check.resultCode = 'process_identity_read'
    }
  } catch { $check.state='unreadable'; $check.resultCode='query_failed'; $check.errorType=$_.Exception.GetType().Name }
  finally {
    if ($observedProcess) { $observedProcess.Dispose() }
    $check.completedAt = [DateTime]::UtcNow.ToString('o')
  }
  return $check
}
if ($Action -eq 'baseline') {
  $taskSnapshot = Get-Snapshot
  Write-NewJson $taskConfig.receipt @{ acceptanceId = $AcceptanceId; runId = $taskConfig.runId; createdAt = [DateTime]::UtcNow.ToString('o'); source = 'windows_cim_pre_install_baseline'; isolatedProfile = $taskConfig.profile; snapshot = $taskSnapshot }
  Write-Output "Baseline recorded: $($taskConfig.receipt)"
  if (-not $taskSnapshot.readable) { exit 1 }
  exit 0
}
if ($Action -eq 'exit') {
  if ((Test-Path -LiteralPath $taskConfig.finalSnapshot) -or (Test-Path -LiteralPath $taskConfig.exitReceipt)) { throw 'Exit attempt already exists; supply a NEW ObservationId. Never overwrite prior evidence.' }
  $taskIdentityText = & node (Join-Path $PSScriptRoot 'w3-evidence.cjs') exit-identities $AcceptanceId
  if ($LASTEXITCODE -ne 0) { throw 'Known instance identities unavailable' }
  $taskIdentities = ConvertFrom-Json -InputObject ($taskIdentityText -join "`n")
  if (-not $taskIdentities -or $taskIdentities -isnot [array]) { throw 'Expected a nonempty JSON array of known identities' }
  $taskFinalSnapshot = Get-Snapshot
  $taskIndependent = foreach ($identity in $taskIdentities) {
    Get-IndependentProcessObservation $identity
  }
  Write-NewJson $taskConfig.finalSnapshot @{ acceptanceId = $AcceptanceId; observationId = $(if ($ObservationId) { $ObservationId } else { $null }); runId = $taskConfig.runId; createdAt = [DateTime]::UtcNow.ToString('o'); observerPid = $PID; observerPowerShellVersion = $PSVersionTable.PSVersion.ToString(); source = 'windows_cim_and_process_handle_post_writer_observation'; snapshot = $taskFinalSnapshot; requiredIdentityChecks = @($taskIndependent) }
  Write-Output "Final process observation recorded: $($taskConfig.finalSnapshot); this alone is not exit PASS"
  exit 0
}
if (Test-Path -LiteralPath $taskConfig.receipt) { throw 'Host receipt already exists; use a fresh acceptance ID' }
if (Test-Path -LiteralPath $taskConfig.lifecycle) { throw 'Launch already attempted; do not repeat this namespace' }
if ((Test-Path -LiteralPath $taskConfig.hostStart) -or (Test-Path -LiteralPath $taskConfig.hostAck)) { throw 'Earlier Host handshake exists; use a fresh namespace' }
$taskInstall = Get-Content -LiteralPath (Join-Path $PSScriptRoot "evidence/w3-$AcceptanceId-install.json") -Raw | ConvertFrom-Json
$taskPrepare = Get-Content -LiteralPath (Join-Path $PSScriptRoot "evidence/w3-$AcceptanceId-baseline.json") -Raw | ConvertFrom-Json
if ($taskInstall.acceptanceId -ne $AcceptanceId -or $taskInstall.status -ne 'PASS' -or $taskInstall.scope -ne 'installation_integrity_only' -or $taskInstall.source -ne 'ordinary_node_installed_file_audit') { throw 'Current installation audit required before launch' }
if ($taskPrepare.acceptanceId -ne $AcceptanceId -or -not $taskPrepare.snapshot.readable -or $taskPrepare.source -ne 'windows_cim_pre_install_baseline') { throw 'Readable current pre-install baseline required' }
if ($Mode -eq 'write') { & node (Join-Path $PSScriptRoot 'w3-evidence.cjs') check $AcceptanceId probe; if ($LASTEXITCODE -ne 0) { throw 'Passing current probe required' } }
if ($Mode -eq 'read') {
  # Revalidate before any launch or lifecycle evidence creation.
  $taskExitText = & node (Join-Path $PSScriptRoot 'w3-evidence.cjs') check-exit $AcceptanceId $ObservationId
  if ($LASTEXITCODE -ne 0) { throw 'Current limited manual exit proof required; inspect selected ObservationId and reference integrity' }
  $taskExit = $taskExitText | ConvertFrom-Json
  if ($taskExit.acceptanceId -ne $AcceptanceId -or $taskExit.observationId -ne $ObservationId -or $taskExit.receiptPath -ne $taskConfig.exitReceipt -or $taskExit.sha256 -ne $taskConfig.exitReceiptSha256) { throw 'Selected exit proof binding changed; do not launch' }
}
$taskBaseline = Get-Snapshot
$taskLifecycle = @{ acceptanceId = $AcceptanceId; runId = $taskConfig.runId; source = 'windows_cim_lifecycle_collector'; createdAt = [DateTime]::UtcNow.ToString('o'); isolatedProfile = $taskConfig.profile; baseline = $taskBaseline; root = $null; host = $null; samples = @(); monitoring = 'sampled_not_complete_lifecycle'; launchError = $null }
$taskEnvNames = @('APV_SPIKE_MODE','APV_SPIKE_RUN_ID','APV_SPIKE_EVIDENCE','APV_SPIKE_INSTALLED_ROOT','APV_SPIKE_MARKER','APV_SPIKE_DATA','APV_SPIKE_VSIX','APV_SPIKE_WRITE_EVIDENCE','APV_SPIKE_EXIT_EVIDENCE','APV_SPIKE_EXIT_OBSERVATION_ID','APV_SPIKE_EXIT_SHA256','APV_SPIKE_READ_ATTEMPT_ID','APV_SPIKE_HOST_START','APV_SPIKE_HOST_ACK')
$taskOldEnv = @{}
foreach ($name in $taskEnvNames) { $taskOldEnv[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
  if (-not $taskBaseline.readable) { throw 'Process baseline unreadable; do not launch' }
  if (@($taskBaseline.processes | Where-Object { $_.profileMatch -or ($_.codeCandidate -and (-not $_.commandLineReadable -or -not $_.createdAt)) }).Count -gt 0) { throw 'Pre-existing profile or opaque Code baseline; cannot reliably attribute instance' }
  $env:APV_SPIKE_MODE=$Mode; $env:APV_SPIKE_RUN_ID=$taskConfig.runId; $env:APV_SPIKE_EVIDENCE=$taskConfig.receipt
  $env:APV_SPIKE_INSTALLED_ROOT=$taskConfig.extensions; $env:APV_SPIKE_MARKER=$AcceptanceId; $env:APV_SPIKE_DATA=$taskConfig.data
  $env:APV_SPIKE_VSIX=$taskConfig.vsix; $env:APV_SPIKE_WRITE_EVIDENCE=$taskConfig.writeReceipt; $env:APV_SPIKE_EXIT_EVIDENCE=$taskConfig.exitReceipt
  $env:APV_SPIKE_EXIT_OBSERVATION_ID=$taskConfig.exitObservationId; $env:APV_SPIKE_EXIT_SHA256=$taskConfig.exitReceiptSha256
  $env:APV_SPIKE_READ_ATTEMPT_ID=$taskConfig.readAttemptId
  $env:APV_SPIKE_HOST_START=$taskConfig.hostStart; $env:APV_SPIKE_HOST_ACK=$taskConfig.hostAck
  $taskArguments=@('--new-window','--skip-welcome','--skip-release-notes','--sync=off',"--user-data-dir=`"$($taskConfig.profile)`"","--extensions-dir=`"$($taskConfig.extensions)`"","--extensionDevelopmentPath=`"$(Join-Path $PSScriptRoot 'host-harness')`"","--extensionTestsPath=`"$(Join-Path $PSScriptRoot 'installed-acceptance-runner.cjs')`"")
  # Visible only when the human executes this manual Windows acceptance helper.
  $taskProcess=Start-Process -FilePath 'D:\Apps\Microsoft VS Code\Code.exe' -ArgumentList $taskArguments -WindowStyle Normal -PassThru -RedirectStandardOutput (Join-Path $taskConfig.runtime "$($taskConfig.logPrefix).stdout.txt") -RedirectStandardError (Join-Path $taskConfig.runtime "$($taskConfig.logPrefix).stderr.txt")
  $taskLifecycle.root=@{ pid=$taskProcess.Id; createdAt=$taskProcess.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ'); parentPid=$PID }
  $taskTimer=[System.Diagnostics.Stopwatch]::StartNew()
  $taskQuiet=0
  do {
    $snapshot=Get-Snapshot
    $taskLifecycle.samples += $snapshot
    if (-not $taskLifecycle.host -and (Test-Path -LiteralPath $taskConfig.hostStart)) {
      try {
        $start=Get-Content -LiteralPath $taskConfig.hostStart -Raw | ConvertFrom-Json
        if ($start.runId -ne $taskConfig.runId -or $start.acceptanceId -ne $AcceptanceId -or $start.source -ne 'vscode_extension_host') { throw 'Host start namespace mismatch' }
        if ([DateTime]::Parse($start.recordedAt).ToUniversalTime() -lt [DateTime]::Parse($taskBaseline.recordedAt).ToUniversalTime()) { throw 'Stale Host start receipt' }
        $hostProcess=$snapshot.processes | Where-Object { $_.pid -eq $start.pid } | Select-Object -First 1
        if ($snapshot.readable -and $hostProcess.createdAt) {
          if ($hostProcess.parentPid -ne $start.parentPid) { throw 'Host parent identity mismatch' }
          $taskLifecycle.host=$hostProcess
          Write-NewJson $taskConfig.hostAck @{ source='windows_cim_collector'; runId=$taskConfig.runId; acceptanceId=$AcceptanceId; recordedAt=[DateTime]::UtcNow.ToString('o'); process=$hostProcess }
        }
      } catch { $taskLifecycle.handshakeError=$_.Exception.GetType().Name }
    }
    $taskProcess.Refresh()
    $profileAlive=@($snapshot.processes | Where-Object profileMatch).Count -gt 0
    $hostAlive=$taskLifecycle.host -and @($snapshot.processes | Where-Object { $_.pid -eq $taskLifecycle.host.pid }).Count -gt 0
    if ($snapshot.readable -and $taskProcess.HasExited -and -not $profileAlive -and -not $hostAlive) { $taskQuiet++ } else { $taskQuiet=0 }
    if ($taskQuiet -ge 3) { break }
    Start-Sleep -Milliseconds 250
  } while ($taskTimer.Elapsed.TotalSeconds -lt 120)
  $taskLifecycle.timedOut=$taskTimer.Elapsed.TotalSeconds -ge 120
  $taskLifecycle.monitoredMilliseconds=$taskTimer.ElapsedMilliseconds
  $taskLifecycle.ownedHandleExited=$taskProcess.HasExited
  if ($taskProcess.HasExited) { $taskLifecycle.ownedHandleExitCode=$taskProcess.ExitCode }
} catch { $taskLifecycle.launchError=@{ type=$_.Exception.GetType().Name; reason=$_.Exception.Message } }
finally {
  foreach ($name in $taskEnvNames) { [Environment]::SetEnvironmentVariable($name,$taskOldEnv[$name],'Process') }
  $taskLifecycle.completedAt=[DateTime]::UtcNow.ToString('o')
  Write-NewJson $taskConfig.lifecycle $taskLifecycle
}
Write-Output "Lifecycle recorded: $($taskConfig.lifecycle). No process was terminated."
if ($ReadAttemptId) { & node (Join-Path $PSScriptRoot 'w3-evidence.cjs') check-read $AcceptanceId $ReadAttemptId }
else { & node (Join-Path $PSScriptRoot 'w3-evidence.cjs') check $AcceptanceId $Mode }
exit $LASTEXITCODE
