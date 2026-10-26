; Inno Setup script: wraps dist\Monotion (from PyInstaller) in Monotion-Setup.exe
#define AppVersion GetEnv("MONOTION_VERSION")
#if AppVersion == ""
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6E1D2F58-3B6A-4C57-9C0B-5A4B7E0C2D11}
AppName=Monotion
AppVersion={#AppVersion}
DefaultDirName={autopf}\Monotion
DefaultGroupName=Monotion
UninstallDisplayIcon={app}\Monotion.exe
SetupIconFile=icon.ico
OutputDir=..\dist
OutputBaseFilename=Monotion-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "..\dist\Monotion\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\Monotion"; Filename: "{app}\Monotion.exe"
Name: "{autodesktop}\Monotion"; Filename: "{app}\Monotion.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"

[Run]
Filename: "{app}\Monotion.exe"; Description: "Start Monotion"; Flags: nowait postinstall skipifsilent
