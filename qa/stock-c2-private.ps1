# Filesystem checks only; never opens C1/B or connects to a database.
param([Parameter(Mandatory=$true)][string]$Path,[switch]$Initialize)
$ErrorActionPreference='Stop'
$stage='BOOTSTRAP'
try {
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    function Assert-C2Acl([string]$Entry,[bool]$IsDirectory) {
        $sections=[Security.AccessControl.AccessControlSections]'Access,Owner'
        $acl=if($IsDirectory){[IO.Directory]::GetAccessControl($Entry,$sections)}else{[IO.File]::GetAccessControl($Entry,$sections)}
        $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        if($owner -ne $identity.User.Value -and ($IsDirectory -or $owner -ne $identity.Owner.Value)){throw 'OWNER'}
        if($IsDirectory -and -not $acl.AreAccessRulesProtected){throw 'INHERITANCE'}
        $full=$false
        foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
            if($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $rule.IdentityReference.Value -ne $identity.User.Value){throw 'ACL'}
            if(($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl -and ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0){$full=$true}
        }
        if(-not $full){throw 'FULLCONTROL'}
    }
    $stage='PATH'
    $expected=Join-Path ([IO.Path]::GetTempPath()) 'nexalvo-stock-c2-475ae0c8-5a4b-45a2-ad74-1a450e553cb0'
    if ([IO.Path]::GetFullPath($Path) -ine [IO.Path]::GetFullPath($expected)) { throw 'SCOPE' }
    $dir=Get-Item -LiteralPath $Path -Force
    if (-not $dir.PSIsContainer) { throw 'TYPE' }
    $ancestor=$dir
    while ($null -ne $ancestor) {
        if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'LINK' }
        $ancestor=$ancestor.Parent
    }
    if ($Initialize) {
        $stage='EMPTY'
        if (@(Get-ChildItem -LiteralPath $Path -Force).Count -ne 0) { throw 'NONEMPTY' }
        $stage='SETACL'
        # PS5.1 Set-Acl on a new security descriptor can request SeSecurityPrivilege
        # for SACLs. Touch only the access/owner sections of this newly created directory.
        $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
        $acl=[IO.Directory]::GetAccessControl($Path,[Security.AccessControl.AccessControlSections]'Access,Owner')
        $acl.SetAccessRuleProtection($true,$false)
        foreach($rule in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){[void]$acl.RemoveAccessRuleSpecific($rule)}
        $acl.SetOwner($identity.User)
        $rule=[Security.AccessControl.FileSystemAccessRule]::new($identity.User,[Security.AccessControl.FileSystemRights]::FullControl,
          [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
        [void]$acl.AddAccessRule($rule)
        [IO.Directory]::SetAccessControl($Path,$acl)
    }
    $stage='ACL'
    Assert-C2Acl $Path $true
    foreach ($entry in @(Get-ChildItem -LiteralPath $Path -Force)) {
        if ($entry.PSIsContainer -or $entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'ENTRY' }
        Assert-C2Acl $entry.FullName $false
    }
    Write-Output 'C2_PRIVATE_PASS'
} catch { Write-Output "C2_PRIVATE_${stage}_BLOCKED"; exit 2 }
