# Metadata/mode and public availability button only. Never reads typed input/history.
param([ValidateSet('Save','Restore','ConfirmPasswordPhase')][string]$Action,[Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
if($Action -eq 'ConfirmPasswordPhase'){
 Add-Type @'
using System; using System.Runtime.InteropServices;
public class C2PasswordPhaseAvailability {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int MessageBox(IntPtr owner,string text,string caption,uint flags);
}
'@
 $choice=[C2PasswordPhaseAvailability]::MessageBox([IntPtr]::Zero,'A credencial local ja foi criada. Ao clicar OK, o psql pedira AGORA a mesma senha no prompt nativo oculto. Digite-a imediatamente. Depois da prova SQL, NAO DIGITE READY e aguarde 60s. Este dialogo nao recebe senha.','NEXALVO LOCAL - PRONTO PARA PASSWORD DO PSQL?',0x00050041)
 if($choice -ne 1){exit 3}
 exit 0
}
Add-Type @'
using System; using System.Runtime.InteropServices;
public class C2ScramConsole {
 [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
 [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h,out uint mode);
 [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h,uint mode);
}
'@
$handle=[C2ScramConsole]::GetStdHandle(-10);[uint32]$mode=0
if(-not [C2ScramConsole]::GetConsoleMode($handle,[ref]$mode)){throw 'SCRAM_CONSOLE_REQUIRED'}
if($Action -eq 'Save'){
 $bytes=[Text.Encoding]::UTF8.GetBytes((@{mode=$mode;input_captured=$false}|ConvertTo-Json))
 $file=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
}else{
 $saved=Get-Content -LiteralPath $Path -Raw|ConvertFrom-Json
 if(-not [C2ScramConsole]::SetConsoleMode($handle,[uint32]$saved.mode)){throw 'SCRAM_CONSOLE_RESTORE_FAILED'}
}
