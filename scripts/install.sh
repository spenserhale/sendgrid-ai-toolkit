#!/usr/bin/env sh
# Install the sendgrid-ai-toolkit CLI by downloading the latest prebuilt binary
# from GitHub Releases.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/spenserhale/sendgrid-ai-toolkit/main/scripts/install.sh | sh
#
# Environment variables:
#   SENDGRID_TOOLKIT_VERSION   Version to install (default: latest)
#   SENDGRID_TOOLKIT_INSTALL   Install directory (default: $HOME/.local/bin)
#   SENDGRID_TOOLKIT_MCP       Set to 1 to also install the MCP server binary (sendgrid-mcp)

set -eu

REPO="spenserhale/sendgrid-ai-toolkit"
VERSION="${SENDGRID_TOOLKIT_VERSION:-latest}"
INSTALL_DIR="${SENDGRID_TOOLKIT_INSTALL:-$HOME/.local/bin}"
WITH_MCP="${SENDGRID_TOOLKIT_MCP:-0}"

detect_platform() {
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)
  case "$os" in
    darwin) os="darwin" ;;
    linux)  os="linux" ;;
    *) echo "Unsupported OS: $os"; exit 1 ;;
  esac
  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "Unsupported arch: $arch"; exit 1 ;;
  esac
  echo "${os}-${arch}"
}

if command -v sha256sum >/dev/null 2>&1; then
  checksum_cmd="sha256sum"
else
  checksum_cmd="shasum -a 256"
fi

release_url() {
  if [ "$VERSION" = "latest" ]; then
    echo "https://github.com/${REPO}/releases/latest/download/$1"
  else
    echo "https://github.com/${REPO}/releases/download/${VERSION}/$1"
  fi
}

install_asset() {
  asset="$1"
  target_name="$2"
  url=$(release_url "$asset")

  echo "Downloading $asset from $url..."
  curl -fsSL -o "$tmp/$asset" "$url"
  curl -fsSL -o "$tmp/$asset.sha256" "$(release_url "$asset.sha256")"

  echo "Verifying checksum..."
  (cd "$tmp" && $checksum_cmd -c "$asset.sha256") || {
    echo "Checksum verification failed for $asset"
    exit 1
  }

  mkdir -p "$INSTALL_DIR"
  install_path="$INSTALL_DIR/$target_name"
  mv "$tmp/$asset" "$install_path"
  chmod +x "$install_path"
  echo "Installed $target_name to $install_path"
}

platform=$(detect_platform)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

install_asset "sendgrid-${platform}" "sendgrid"
if [ "$WITH_MCP" = "1" ]; then
  install_asset "sendgrid-mcp-${platform}" "sendgrid-mcp"
fi

echo ""
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not on your PATH. Add the following to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
    ;;
esac
echo "Next: set SENDGRID_ACCOUNTS (see .env.example) and run 'sendgrid accounts' to verify."
echo "Run 'sendgrid --help' to get started."
