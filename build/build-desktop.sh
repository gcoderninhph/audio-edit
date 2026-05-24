#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
FRONTEND_DIR="${ROOT_DIR}/frontend"
CONFIG_FILE="${SCRIPT_DIR}/electron-builder.auto.json"
CONFIG_FROM_FRONTEND="../build/electron-builder.auto.json"

to_windows_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
    return
  fi

  printf '%s' "$1"
}

cleanup() {
  rm -f "${CONFIG_FILE}"
}

stop_packaged_app_if_running() {
  if ! command -v powershell.exe >/dev/null 2>&1; then
    return
  fi

  local exe_path
  exe_path="$(to_windows_path "${ROOT_DIR}/build/win-unpacked/Audio Edit.exe")"
  AUDIO_EDIT_EXE_PATH="${exe_path}" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
    'Get-Process | Where-Object { $_.Path -eq $env:AUDIO_EDIT_EXE_PATH } | Stop-Process -Force' \
    >/dev/null 2>&1 || true
}

trap cleanup EXIT

if [[ ! -d "${FRONTEND_DIR}" ]]; then
  echo "Unable to find frontend directory at ${FRONTEND_DIR}" >&2
  exit 1
fi

cat > "${CONFIG_FILE}" <<'JSON'
{
  "appId": "com.gstudio.audioedit",
  "productName": "Audio Edit",
  "directories": {
    "output": "../build",
    "buildResources": "build"
  },
  "files": [
    "dist/**",
    "electron/**",
    "src/utils/**",
    "package.json"
  ],
  "asarUnpack": [
    "electron/bin/**",
    "node_modules/ffmpeg-static/**"
  ],
  "win": {
    "signAndEditExecutable": false,
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ],
    "artifactName": "${productName}-Setup-${version}.${ext}"
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true
  }
}
JSON

echo "==> Building renderer"
cd "${FRONTEND_DIR}"
npm run build

echo "==> Releasing packaged executable lock if needed"
stop_packaged_app_if_running

echo "==> Building Windows desktop package into ${SCRIPT_DIR}"
CSC_IDENTITY_AUTO_DISCOVERY=false npx --yes electron-builder \
  --config "${CONFIG_FROM_FRONTEND}" \
  --win nsis \
  --x64 \
  --publish never

echo "==> Desktop build complete"
if [[ -f "${SCRIPT_DIR}/Audio Edit-Setup-0.0.0.exe" ]]; then
  ls -lh "${SCRIPT_DIR}/Audio Edit-Setup-0.0.0.exe"
fi
if [[ -f "${SCRIPT_DIR}/win-unpacked/Audio Edit.exe" ]]; then
  ls -lh "${SCRIPT_DIR}/win-unpacked/Audio Edit.exe"
fi