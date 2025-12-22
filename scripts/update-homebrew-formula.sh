#!/usr/bin/env bash
set -euo pipefail

# Generate Homebrew formula for repos CLI
#
# Usage:
#   ./scripts/update-homebrew-formula.sh <output-path>
#
# Required environment variables:
#   VERSION          - Release version (without 'v' prefix)
#   SHA_MACOS_ARM64  - SHA256 checksum for macOS ARM64 binary
#   SHA_MACOS_X64    - SHA256 checksum for macOS x64 binary
#   SHA_LINUX_X64    - SHA256 checksum for Linux x64 binary

OUTPUT_PATH="${1:-}"

if [[ -z "$OUTPUT_PATH" ]]; then
  echo "Error: Output path required" >&2
  echo "Usage: $0 <output-path>" >&2
  exit 1
fi

for var in VERSION SHA_MACOS_ARM64 SHA_MACOS_X64 SHA_LINUX_X64; do
  if [[ -z "${!var:-}" ]]; then
    echo "Error: $var environment variable is required" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$OUTPUT_PATH")"

cat > "$OUTPUT_PATH" << EOF
class Repos < Formula
  desc "A CLI tool for managing multiple git repositories"
  homepage "https://github.com/epilande/repos"
  version "${VERSION}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/epilande/repos/releases/download/v${VERSION}/repos-macos-arm64"
      sha256 "${SHA_MACOS_ARM64}"
    else
      url "https://github.com/epilande/repos/releases/download/v${VERSION}/repos-macos-x64"
      sha256 "${SHA_MACOS_X64}"
    end
  end

  on_linux do
    url "https://github.com/epilande/repos/releases/download/v${VERSION}/repos-linux-x64"
    sha256 "${SHA_LINUX_X64}"
  end

  def install
    binary_name = stable.url.split("/").last
    bin.install binary_name => "repos"
  end

  test do
    system "#{bin}/repos", "--version"
  end
end
EOF

echo "Generated formula at $OUTPUT_PATH"
