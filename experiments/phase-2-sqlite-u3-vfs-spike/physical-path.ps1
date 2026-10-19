param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
$canonical=[IO.Path]::GetFullPath($Target)
if ($canonical -notmatch '^[A-Za-z]:\\' -or $canonical.Substring(2).Contains(':')) { throw 'LOCAL_NON_ADS_PATH_REQUIRED' }
$probe=Get-Item -LiteralPath $canonical -Force
while ($null -ne $probe) {
    if (($probe.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_POINT_REJECTED' }
    $parent=[IO.Directory]::GetParent($probe.FullName)
    if ($null -eq $parent) { break }
    $probe=Get-Item -LiteralPath $parent.FullName -Force
}
$drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($canonical))
if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'FIXED_LOCAL_NTFS_REQUIRED' }
@{path=$canonical;fileSystem=$drive.DriveFormat;reparseAncestors=$false} | ConvertTo-Json -Compress
