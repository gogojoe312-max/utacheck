#!/usr/bin/env bash
set -euo pipefail

# Some hosted Azure mirrors trickle packages for over 25 minutes. Use the
# official Ubuntu archives with bounded transport waits; retain TLS checks.
if [[ -f /etc/apt/apt-mirrors.txt ]]; then
  printf '%s\n' 'https://archive.ubuntu.com/ubuntu/' | sudo tee /etc/apt/apt-mirrors.txt >/dev/null
fi
if [[ -f /etc/apt/apt-mirrors-security.txt ]]; then
  printf '%s\n' 'https://security.ubuntu.com/ubuntu/' | sudo tee /etc/apt/apt-mirrors-security.txt >/dev/null
fi
printf '%s\n' 'Acquire::http::Timeout "30";' 'Acquire::https::Timeout "30";' 'Acquire::Retries "2";' |
  sudo tee /etc/apt/apt.conf.d/80-utacheck-test-downloads >/dev/null

npm install --prefix "$RUNNER_TEMP/utacheck-browser" --no-save --package-lock=false playwright@1.56.1
"$RUNNER_TEMP/utacheck-browser/node_modules/.bin/playwright" install --with-deps chromium webkit
