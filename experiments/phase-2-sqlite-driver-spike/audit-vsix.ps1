param([Parameter(Mandatory)][string]$VsixPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $VsixPath).Path)
try {
  $required = @('extension/extension.cjs', 'extension/probe.cjs', 'extension/node_modules/better-sqlite3/prebuilds/win32-x64.node')
  $entries = @($archive.Entries | ForEach-Object FullName)
  foreach ($name in $required) { if ($entries -notcontains $name) { throw "Required VSIX resource missing: $name" } }
  $entry = $archive.GetEntry($required[2])
  $stream = $entry.Open()
  try { $algorithm = [System.Security.Cryptography.SHA256]::Create(); $hash = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); if ($algorithm) { $algorithm.Dispose() } }
  $stage = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'evidence/native-stage.json') -Raw | ConvertFrom-Json
  if ($hash -ne $stage.sha256) { throw 'VSIX native hash does not match staged Windows x64 binary' }
  $result = @{ status = 'PASS'; scope = 'archive_inventory_only'; nativeFile = $required[2]; sha256 = $hash; nativeEntries = @($entries | Where-Object { $_.EndsWith('.node') }); loadability = 'Technical Verification Pending until installed-host evidence' }
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'evidence/vsix-inventory.json') -Encoding utf8
  $result | ConvertTo-Json -Depth 5
} finally { $archive.Dispose() }
