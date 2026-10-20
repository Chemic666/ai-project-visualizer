param([string]$Vsix)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[IO.Compression.ZipFile]::OpenRead($Vsix)
try {$files=@();foreach($e in $z.Entries){if($e.FullName.EndsWith('/')){continue};if($e.FullName.Contains('..') -or $e.FullName.Contains(':') -or $e.FullName.StartsWith('/')){throw 'UNSAFE_ARCHIVE'};$stream=$e.Open();try{$sha=[Security.Cryptography.SHA256]::Create();$hash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant();$files+=@{path=$e.FullName;bytes=$e.Length;sha256=$hash}}finally{$stream.Dispose()}};$files|ConvertTo-Json -Depth 4 -Compress}finally{$z.Dispose()}
