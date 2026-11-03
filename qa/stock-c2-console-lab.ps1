# Laboratory only: inspect own console metadata; optionally queue a public ENTER, never a password.
param([Parameter(Mandatory=$true)][string]$Directory,[Parameter(Mandatory=$true)][int]$NodePid,[Parameter(Mandatory=$true)][int]$ChildPid,[switch]$QueueEnter)
$ErrorActionPreference='Stop'
$Directory=[IO.Path]::GetFullPath($Directory)
if(-not (Test-Path -LiteralPath (Join-Path (Split-Path $Directory -Parent) 'LOCAL_ONLY.crt'))){throw 'LOCAL_LAB_ONLY'}
$intent=Get-Content -LiteralPath (Join-Path $Directory 'native-intent.json') -Raw|ConvertFrom-Json
$argsList=@($intent.arguments);$hostIndex=[Array]::IndexOf($argsList,'-h')
if($hostIndex -lt 0 -or $argsList[$hostIndex+1] -cne '127.0.0.1' -or $intent.exe -notlike '*\edb-17.11-5\pgsql\bin\psql.exe'){throw 'LOCAL_LOOPBACK_PSQL_REQUIRED'}
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class C2LocalConsole {
 [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
 [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h,out uint mode);
 [DllImport("kernel32.dll")] public static extern uint GetConsoleProcessList(uint[] ids,uint count);
 [StructLayout(LayoutKind.Explicit,Size=20)] public struct Input {
  [FieldOffset(0)] public ushort type;
  [FieldOffset(4)] public int down;
  [FieldOffset(8)] public ushort repeat;
  [FieldOffset(10)] public ushort key;
  [FieldOffset(14)] public ushort ch;
 }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern bool WriteConsoleInputW(IntPtr h,Input[] data,uint n,out uint written);
 public static bool Enter(IntPtr h) { uint written; var a=new Input[2];
  a[0]=new Input{type=1,down=1,repeat=1,key=13,ch=13};a[1]=new Input{type=1,down=0,repeat=1,key=13,ch=13};
  return WriteConsoleInputW(h,a,2,out written)&&written==2;
 }
}
'@
$ids=New-Object uint32[] 32;$count=[C2LocalConsole]::GetConsoleProcessList($ids,32)
$handle=[C2LocalConsole]::GetStdHandle(-10);[uint32]$mode=0
$isConsole=[C2LocalConsole]::GetConsoleMode($handle,[ref]$mode)
$same=($count -le 32 -and $ids -contains [uint32]$NodePid -and $ids -contains [uint32]$ChildPid)
if(-not $isConsole -or -not $same){throw 'LOCAL_CONSOLE_MEMBERSHIP_REQUIRED'}
$queued=$false;if($QueueEnter){$queued=[C2LocalConsole]::Enter($handle);if(-not $queued){throw 'LOCAL_ENTER_FAILED'}}
$result=@{scope='LOCAL_CONSOLE_ROUTE_METADATA_ONLY';same_console=$same;console_input_handle=$isConsole;echo_enabled=(($mode-band 4)-ne 0);public_enter_queued=$queued;input_read_or_logged=$false;target='LOCAL_LOOPBACK_ONLY'}|ConvertTo-Json
$file=[IO.File]::Open((Join-Path $Directory 'console-route-observation.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$bytes=[Text.Encoding]::UTF8.GetBytes($result);$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}
