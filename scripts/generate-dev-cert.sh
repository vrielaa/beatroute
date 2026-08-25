#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cert_directory="$project_root/frontend/certs"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert is required. Install it with: brew install mkcert"
  exit 1
fi

mkdir -p "$cert_directory"

mkcert \
  -cert-file "$cert_directory/127.0.0.1.pem" \
  -key-file "$cert_directory/127.0.0.1-key.pem" \
  localhost 127.0.0.1 ::1

chmod 600 "$cert_directory/127.0.0.1-key.pem"

echo "Generated local development certificate in frontend/certs/."
