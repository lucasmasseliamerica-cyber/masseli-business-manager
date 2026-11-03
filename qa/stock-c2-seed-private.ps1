# ACL only for a newly created operational run, never a reservation or database.
param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
try {
 $rootPath=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
 $target=[IO.Path]::GetFullPath($Path)
 if(-not $target.StartsWith($rootPath,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($target)+'\' -ine $rootPath){throw 'SCOPE'}
 $dir=Get-Item -LiteralPath $target -Force
 if(-not $dir.PSIsContainer -or @(Get-ChildItem -LiteralPath $target -Force).Count -ne 0){throw 'EMPTY_NEW_DIRECTORY_REQUIRED'}
 for($entry=$dir;$null -ne $entry;$entry=$entry.Parent){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'LINK'}}
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 $acl=[IO.Directory]::GetAccessControl($target,[Security.AccessControl.AccessControlSections]'Access,Owner')
 $acl.SetAccessRuleProtection($true,$false)
 foreach($rule in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){[void]$acl.RemoveAccessRuleSpecific($rule)}
 $acl.SetOwner($identity.User)
 $rule=[Security.AccessControl.FileSystemAccessRule]::new($identity.User,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
 [void]$acl.AddAccessRule($rule);[IO.Directory]::SetAccessControl($target,$acl)
 $check=[IO.Directory]::GetAccessControl($target,[Security.AccessControl.AccessControlSections]'Access,Owner')
 if(-not $check.AreAccessRulesProtected -or $check.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.User.Value){throw 'OWNER'}
 foreach($access in $check.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($access.IdentityReference.Value -ne $identity.User.Value -or $access.AccessControlType -ne 'Allow'){throw 'ACL'}}
 'C2_SEED_PRIVATE_PASS'
}catch{'C2_SEED_PRIVATE_BLOCKED';exit 2}
