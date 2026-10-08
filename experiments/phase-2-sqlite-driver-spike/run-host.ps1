param(
  [ValidateSet('development', 'installed')][string]$Scope = 'development',
  [ValidateSet('probe', 'write', 'read')][string]$Mode = 'probe'
)
$ErrorActionPreference = 'Stop'
$spikeRoot = $PSScriptRoot
$runtimeRoot = Join-Path $spikeRoot '_runtime'
$evidenceRoot = Join-Path $spikeRoot 'evidence'
$extensionsRoot = Join-Path $runtimeRoot 'code-extensions'
$profileRoot = Join-Path $runtimeRoot 'code-user-data'
New-Item -ItemType Directory -Force -Path $runtimeRoot, $evidenceRoot, $extensionsRoot | Out-Null
$codeCli = (Get-Command code -ErrorAction Stop).Source
$codeExecutable = Join-Path (Split-Path (Split-Path $codeCli -Parent) -Parent) 'Code.exe'
$extensionRoot = if ($Scope -eq 'development') { $spikeRoot } else { Join-Path $spikeRoot 'host-harness' }
$taskArguments = @('--new-window', '--skip-welcome', '--skip-release-notes', '--sync=off', "--user-data-dir=`"$profileRoot`"", "--extensions-dir=`"$extensionsRoot`"", "--extensionDevelopmentPath=`"$extensionRoot`"", "--extensionTestsPath=`"$(Join-Path $spikeRoot 'host-runner.cjs')`"")
$taskEvidence = Join-Path $evidenceRoot "$Scope-host-$Mode.json"
$oldTaskMode = $env:APV_SPIKE_MODE
$oldTaskEvidence = $env:APV_SPIKE_EVIDENCE
$oldInstalledRoot = $env:APV_SPIKE_INSTALLED_ROOT
$oldRunId = $env:APV_SPIKE_RUN_ID
$taskRunId = [guid]::NewGuid().ToString()
$launchResult = @{ scope = $Scope; mode = $Mode; runId = $taskRunId; evidenceFile = (Split-Path $taskEvidence -Leaf); status = 'NOT TESTED' }
try {
  $env:APV_SPIKE_MODE = $Mode
  $env:APV_SPIKE_EVIDENCE = $taskEvidence
  $env:APV_SPIKE_RUN_ID = $taskRunId
  $env:APV_SPIKE_INSTALLED_ROOT = if ($Scope -eq 'installed') { $extensionsRoot } else { $null }
  $taskProcess = Start-Process -FilePath $codeExecutable -ArgumentList $taskArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot "host-$Scope-$Mode.stdout.txt") -RedirectStandardError (Join-Path $runtimeRoot "host-$Scope-$Mode.stderr.txt")
  $exited = $taskProcess.WaitForExit(25000)
  $taskProcess.Refresh()
  $launchResult.processId = $taskProcess.Id
  $launchResult.exited = $exited
  if ($exited) { $launchResult.exitCode = $taskProcess.ExitCode }
  $launchResult.evidenceExists = Test-Path -LiteralPath $taskEvidence
  $launchResult.currentRunEvidence = $false
  if ($launchResult.evidenceExists) {
    $taskReport = Get-Content -LiteralPath $taskEvidence -Raw | ConvertFrom-Json
    $launchResult.currentRunEvidence = $taskReport.runId -eq $taskRunId
  }
  $launchResult.status = if ($launchResult.currentRunEvidence) { 'PASS WITH LIMITATION' } else { 'NOT TESTED' }
  $launchResult.reason = if ($launchResult.currentRunEvidence) { 'Inspect per-candidate results; process launch alone is not compatibility evidence' } else { 'No current-run Extension Host probe evidence; Technical Verification Pending' }
  if (-not $exited) {
    # Stop only the isolated process started by this invocation, never by name.
    Stop-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue
    $launchResult.ownedProcessStoppedAfterTimeout = $true
  }
} catch {
  $launchResult.reason = 'Host launcher error; cause not established; Technical Verification Pending'
  $launchResult.errorType = $_.Exception.GetType().Name
  $launchResult.hresult = $_.Exception.HResult
} finally {
  $env:APV_SPIKE_MODE = $oldTaskMode
  $env:APV_SPIKE_EVIDENCE = $oldTaskEvidence
  $env:APV_SPIKE_INSTALLED_ROOT = $oldInstalledRoot
  $env:APV_SPIKE_RUN_ID = $oldRunId
  $launchResult | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidenceRoot "$Scope-launch-$Mode.json") -Encoding utf8
}
$launchResult | ConvertTo-Json -Depth 5
