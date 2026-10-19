param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
try {
    $canonical=[IO.Path]::GetFullPath($Target)
    if ($canonical -notmatch '^[A-Za-z]:\\' -or $canonical.Substring(2).Contains(':')) { throw 'REJECT' }
    $probe=Get-Item -LiteralPath $canonical -Force
    while ($null -ne $probe) {
        if (($probe.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REJECT' }
        $parent=[IO.Directory]::GetParent($probe.FullName)
        if ($null -eq $parent) { break }
        $probe=Get-Item -LiteralPath $parent.FullName -Force
    }
    $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($canonical))
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'REJECT' }
    @{fileSystem='NTFS';reparseAncestors=$false;driveType='Fixed'} | ConvertTo-Json -Compress
} catch {
    [Console]::Error.WriteLine('ADMISSION_REJECTED')
    exit 2
}
