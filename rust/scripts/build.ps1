#!/usr/bin/env powershell
# Build/test Bird Rust sous Windows.
# Détecte Visual Studio (linker MSVC) ; sinon un MinGW-W64 WinLibs installé via WinGet.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Test-Msvc {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path $vswhere) {
    $path = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($path) {
      $vcvars = Join-Path $path 'VC\Auxiliary\Build\vcvars64.bat'
      if (Test-Path $vcvars) { return $vcvars }
    }
  }
  return $null
}

function Find-Mingw {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'),
    'C:\msys64\mingw64\bin',
    'C:\mingw64\bin'
  )
  foreach ($base in $candidates) {
    if (-not (Test-Path $base)) { continue }
    if ($base -like '*WinGet*') {
      $gcc = Get-ChildItem $base -Recurse -Filter 'gcc.exe' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match 'mingw64\\bin\\gcc\.exe$' -and $_.DirectoryName -notmatch 'llvm' } |
        Select-Object -First 1
      if ($gcc) { return $gcc.DirectoryName }
    } else {
      $gcc = Join-Path $base 'gcc.exe'
      if (Test-Path $gcc) { return $base }
    }
  }
  return $null
}

$vcvars = Test-Msvc
if (-not $vcvars) {
  $mingw = Find-Mingw
  if (-not $mingw) {
    Write-Error "Aucun linker MSVC ni MinGW-W64 trouvé. Installez 'Visual Studio Build Tools' (C++), ou WinLibs MinGW-W64 via WinGet."
  }
  Write-Host "→ MinGW-W64 détecté : $mingw"
  $env:PATH = "$mingw;$env:PATH"
  $env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $mingw 'gcc.exe'
  & cargo +stable-x86_64-pc-windows-gnu test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & cargo +stable-x86_64-pc-windows-gnu build --release -p bird-cli
  exit $LASTEXITCODE
}

Write-Host "→ Visual Studio détecté : $vcvars"
# vcvars64 doit être chargé dans le même processus cmd que cargo.
& $env:ComSpec /c "call `"$vcvars`" >nul && cargo test && cargo build --release -p bird-cli"
exit $LASTEXITCODE
