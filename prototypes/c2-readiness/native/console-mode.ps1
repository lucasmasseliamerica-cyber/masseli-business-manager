# Metadata/mode and public availability button only. Never reads typed input/history.
param([ValidateSet('Save','Restore','ConfirmPasswordPhase')][string]$Action,[Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
if($Action -eq 'ConfirmPasswordPhase'){
 Add-Type @'
using System; using System.Runtime.InteropServices;
public class C2PasswordPhaseAvailability {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int MessageBox(IntPtr owner,string text,string caption,uint flags);
 [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
 [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h,out uint mode);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
 # Save before the availability button; never start another console host between OK and psql.
 [uint32]$before=0
 if(-not [C2PasswordPhaseAvailability]::GetConsoleMode([C2PasswordPhaseAvailability]::GetStdHandle(-10),[ref]$before)){throw 'SCRAM_CONSOLE_REQUIRED'}
 $savedPath=Join-Path $Path 'console-mode-before.json'
 $file=[IO.File]::Open($savedPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$bytes=[Text.Encoding]::UTF8.GetBytes((@{mode=$before;input_captured=$false}|ConvertTo-Json));$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
 $choice=[C2PasswordPhaseAvailability]::MessageBox([IntPtr]::Zero,'Depois de OK, AGUARDE ver Password: na janela do Terminal. Digite a senha e pressione ENTER UMA VEZ. Depois que aparecer a prova SQL e READY, NAO DIGITE NADA, NAO PRESSIONE ENTER; deixe fechar sozinho. Este dialogo nao recebe senha.','NEXALVO LOCAL - PRONTO PARA PASSWORD DO PSQL?',0x00050041)
 if($choice -ne 1){exit 3}
 $terminal=Get-Process WindowsTerminal -ErrorAction SilentlyContinue|Where-Object MainWindowTitle -eq 'NEXALVO SCRAM LOCAL - SOMENTE DEMORA READY'|Select-Object -First 1
 if(-not $terminal -or $terminal.MainWindowHandle -eq [IntPtr]::Zero){throw 'SCRAM_VISIBLE_TERMINAL_REQUIRED'}
 [void][C2PasswordPhaseAvailability]::SetForegroundWindow($terminal.MainWindowHandle)
 if([C2PasswordPhaseAvailability]::GetForegroundWindow() -ne $terminal.MainWindowHandle){throw 'SCRAM_TERMINAL_FOCUS_NOT_CONFIRMED'}
 $file=[IO.File]::Open((Join-Path $Path 'password-phase-availability.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$bytes=[Text.Encoding]::UTF8.GetBytes((@{at=[DateTime]::UtcNow.ToString('o');console_saved_before_button=$true;terminal_focus_confirmed=$true;typed_input_captured=$false}|ConvertTo-Json));$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
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
