param(
    [Parameter(Mandatory=$true)][ValidateSet('Resolve','Prepare','Inspect')][string]$Mode,
    [string]$RunId,
    [string]$Target,
    [switch]$Reopen,
    [switch]$Diagnostics
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

$stage='known_folder'
try {
    $local=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if ([string]::IsNullOrEmpty($local) -or $local -cnotmatch '^[A-Z]:\\' -or $local.Substring(2).Contains(':')) { throw 'REJECT' }
    $local=[IO.Path]::GetFullPath($local)
    $application=[IO.Path]::Combine($local,'AIProjectVisualizer')
    $validation=[IO.Path]::Combine($application,'validation')
    $location=@{ok=$true;localApplicationData=$local;applicationRoot=$application;productionRoot=[IO.Path]::Combine($application,'storage-v1');validationParent=$validation}

    # Metadata handles are short-lived probes only. They are not SQLite file handles
    # and do not establish protection against a malicious process of the same user.
    $stage='native_probe'
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class APVPrivateRootMetadata {
    [StructLayout(LayoutKind.Sequential)] public struct Info {
        public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
        public uint VolumeSerial, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h, out Info i);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint GetFinalPathNameByHandle(SafeFileHandle h, StringBuilder path, uint length, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint QueryDosDevice(string device, char[] target, int length);
    public static void CheckDrive(string root) {
        var d = new DriveInfo(root);
        if (d.DriveType != DriveType.Fixed || !String.Equals(d.DriveFormat,"NTFS",StringComparison.Ordinal)) throw new IOException("unsupported_volume");
        var buf = new char[4096]; var len=QueryDosDevice(root.Substring(0,2),buf,buf.Length);
        if (len==0) throw new IOException("unsupported_volume");
        string device=new string(buf,0,(int)len).TrimEnd('\0');
        if (!System.Text.RegularExpressions.Regex.IsMatch(device,@"^\\Device\\HarddiskVolume[0-9]+$")) throw new IOException("unsupported_volume");
    }
    public static Info Check(string path) {
        using (var h=CreateFile(path,0,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
            Info i; if (h.IsInvalid || !GetFileInformationByHandle(h,out i)) throw new IOException("metadata_unavailable");
            if ((i.Attributes & 0x400)!=0) throw new IOException("reparse_point");
            var b=new StringBuilder(32768); var n=GetFinalPathNameByHandle(h,b,(uint)b.Capacity,0);
            if (n==0 || n>=b.Capacity) throw new IOException("metadata_unavailable");
            if (!String.Equals(b.ToString(),@"\\?\"+path,StringComparison.Ordinal)) throw new IOException("final_path_mismatch");
            if ((i.Attributes & 0x10)==0 && i.Links!=1) throw new IOException("hard_link");
            return i;
        }
    }
}
'@

    $stage='volume'
    $driveRoot=[IO.Path]::GetPathRoot($local)
    [APVPrivateRootMetadata]::CheckDrive($driveRoot)
    $driveInfo=[APVPrivateRootMetadata]::Check($driveRoot)
    function Check-Physical([string]$p, [bool]$directory) {
        if ([IO.Path]::GetFullPath($p) -cne $p) { throw 'path_not_canonical' }
        $info=[APVPrivateRootMetadata]::Check($p)
        if ($info.VolumeSerial -ne $driveInfo.VolumeSerial -or (($info.Attributes -band 16) -ne 0) -ne $directory) { throw 'volume_or_type_mismatch' }
    }
    $stage='ancestors'
    $ancestor=$local
    while ($null -ne $ancestor) {
        Check-Physical $ancestor $true
        $parent=[IO.Directory]::GetParent($ancestor)
        $ancestor=if ($null -eq $parent) { $null } else { $parent.FullName }
    }
    if ($Mode -eq 'Resolve') { $location | ConvertTo-Json -Compress; exit 0 }
    $stage='request'
    if ($RunId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') { throw 'REJECT' }
    $root=[IO.Path]::Combine($validation,$RunId)
    if ($Mode -eq 'Inspect' -and $Target -cne $root) { throw 'REJECT' }
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $allowed=@($sid.Value,'S-1-5-18','S-1-5-32-544')
    function Check-Acl([string]$p, [bool]$directory, [bool]$protected=$false) {
        Check-Physical $p $directory
        $acl=if ($directory) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid.Value -or ($protected -and -not $acl.AreAccessRulesProtected)) { throw 'acl_owner_or_protection' }
        $raw=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0)
        if ($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -eq 0) { throw 'acl_descriptor_invalid' }
        $userFull=$false
        foreach ($ace in $raw.DiscretionaryAcl) {
            # Reject unfamiliar, callback, object-specific and deny ACEs conservatively.
            if ($ace -isnot [Security.AccessControl.CommonAce] -or $ace.IsCallback -or $ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed -or $allowed -cnotcontains $ace.SecurityIdentifier.Value) { throw 'acl_untrusted_ace' }
            if ($ace.SecurityIdentifier.Value -ceq $sid.Value -and ([int]$ace.AceFlags -band [int][Security.AccessControl.AceFlags]::InheritOnly) -eq 0 -and ($ace.AccessMask -band 2032127) -eq 2032127) { $userFull=$true }
        }
        if (-not $userFull) { throw 'acl_missing_user_control' }
        return $acl
    }
    function Ensure-NewPrivateDirectory([string]$p, [bool]$mustBeNew=$false) {
        $exists=[IO.Directory]::Exists($p) -or [IO.File]::Exists($p)
        if ($exists) {
            if ($mustBeNew) { throw 'already_exists' }
            $null=Check-Acl $p $true $true
            return
        }
        # Parent is already validated and exists: CreateDirectory will create only
        # this component, with its protected descriptor in the creation operation.
        $parentPath=[IO.Path]::GetDirectoryName($p)
        if ($parentPath -ceq $local) { Check-Physical $parentPath $true } else { $null=Check-Acl $parentPath $true $true }
        $security=[Security.AccessControl.DirectorySecurity]::new()
        $security.SetOwner($sid)
        $security.SetAccessRuleProtection($true,$false)
        foreach ($value in $allowed) {
            $principal=[Security.Principal.SecurityIdentifier]::new($value)
            $rule=[Security.AccessControl.FileSystemAccessRule]::new($principal,[Security.AccessControl.FileSystemRights]::FullControl,
                [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
            $security.AddAccessRule($rule)
        }
        $null=[IO.Directory]::CreateDirectory($p,$security)
        $null=Check-Acl $p $true $true
    }
    # OS known folder is a location/physical anchor, not a silently approved ACL.
    # Strict private DACL checking starts at the APV application directory.
    # Unknown ancestor writers remain an explicit production trust blocker.
    $stage='anchor_acl'
    $anchorAcl=[IO.Directory]::GetAccessControl($local)
    $anchorRaw=[Security.AccessControl.RawSecurityDescriptor]::new($anchorAcl.GetSecurityDescriptorBinaryForm(),0)
    $anchorTrust='reviewed-write-principals-only'
    if ($null -eq $anchorRaw.DiscretionaryAcl -or $anchorAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid.Value) { $anchorTrust='unverified' }
    else { foreach ($ace in $anchorRaw.DiscretionaryAcl) {
        if ($ace -isnot [Security.AccessControl.CommonAce] -or $ace.IsCallback) { $anchorTrust='unverified'; continue }
        if ($ace.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessAllowed -and ($ace.AccessMask -band 0x000D0156) -ne 0 -and $allowed -cnotcontains $ace.SecurityIdentifier.Value) { $anchorTrust='unverified' }
    } }
    if ($Mode -eq 'Prepare' -and -not $Reopen) {
        $stage='application'
        Ensure-NewPrivateDirectory $application
        $stage='validation_parent'
        Ensure-NewPrivateDirectory $validation
        $stage='validation_root'
        Ensure-NewPrivateDirectory $root $true
        $stage='private_root'
        Ensure-NewPrivateDirectory ([IO.Path]::Combine($root,'private')) $true
        $stage='observed_root'
        Ensure-NewPrivateDirectory ([IO.Path]::Combine($root,'observed')) $true
    }
    $stage='application'
    $null=Check-Acl $application $true $true
    $stage='validation_parent'
    $null=Check-Acl $validation $true $true
    $stage='validation_root'
    $rootAcl=Check-Acl $root $true $true
    $private=[IO.Path]::Combine($root,'private')
    $observed=[IO.Path]::Combine($root,'observed')
    $stage='private_root'
    $null=Check-Acl $private $true $true
    $stage='observed_root'
    $null=Check-Acl $observed $true $true
    $stage='tree'
    $stack=[Collections.Generic.Stack[string]]::new()
    $stack.Push($root)
    $count=0
    while ($stack.Count -gt 0) {
        $dir=$stack.Pop()
        $null=Check-Acl $dir $true
        foreach ($item in [IO.Directory]::GetFileSystemEntries($dir)) {
            $count++
            if ($count -gt 10000 -or -not $item.StartsWith($root+'\',[StringComparison]::Ordinal)) { throw 'REJECT' }
            # Check for reparses before enumerating or following a child.
            $metadata=[APVPrivateRootMetadata]::Check($item)
            $isDir=($metadata.Attributes -band 16) -ne 0
            $null=Check-Acl $item $isDir
            if ($isDir) { $stack.Push($item) }
        }
    }
    $location.root=$root
    $location.privateDirectory=$private
    $location.observedDirectory=$observed
    $location.runId=$RunId
    $location.proof=@{ancestorAclTrust=$anchorTrust;anchorDaclSddl=$anchorAcl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access);aclScope='app-root-and-descendants';ownerSid=$sid.Value;daclSddl=$rootAcl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access);fileSystem='NTFS';driveType='Fixed';protectedDacl=$true;reparseAncestors=$false;treeItemsChecked=$count;assurance='acl-and-path-metadata-only'}
    $location | ConvertTo-Json -Depth 5 -Compress
} catch {
    # Never expose account paths, SIDs, PowerShell or native errors on rejection.
    if ($Diagnostics) {
        $allowedCategories=@('final_path_mismatch','reparse_point','hard_link','metadata_unavailable','unsupported_volume','path_not_canonical','volume_or_type_mismatch','acl_owner_or_protection','acl_descriptor_invalid','acl_untrusted_ace','acl_missing_user_control','already_exists')
        $category='operation_failed'
        $exception=$_.Exception
        while ($null -ne $exception) {
            if ($allowedCategories -ccontains $exception.Message) { $category=$exception.Message; break }
            if ($exception -is [UnauthorizedAccessException]) { $category='access_denied' }
            $exception=$exception.InnerException
        }
        @{ok=$false;reason='unavailable';diagnostic=@{stage=$stage;category=$category}} | ConvertTo-Json -Compress
    } else {
        [Console]::Out.WriteLine('{"ok":false,"reason":"unavailable"}')
    }
    exit 2
}
