#!/usr/bin/env bash
# =============================================================================
# install.sh - Meridian One-Script Installer
# =============================================================================

set -euo pipefail

# -- Colors ---------------------------------------------------------------
RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
BLU='\033[0;34m'
WHT='\033[0;37m'
BLD='\033[1m'
RST='\033[0m'

info() { echo -e "  ${BLU}[i]${RST}  ${WHT}$*${RST}"; }
success() { echo -e "  ${GRN}[ok]${RST} ${GRN}$*${RST}"; }
warn() { echo -e "  ${YEL}[! ]${RST} ${YEL}$*${RST}"; }
error() { echo -e "  ${RED}[x]${RST} ${RED}$*${RST}" >&2; }
die() {
  echo ""
  error "$*"
  echo ""
  exit 1
}

step() {
  echo ""
  echo -e "${BLD}== $1 ==${RST}"
}

# -- Banner ---------------------------------------------------------------
clear
echo ""
echo -e "${BLD}Meridian Installer${RST}"
echo -e "${WHT}Set up your system for the Meridian agent.${RST}"
echo ""

# -- Locate project root -------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
info "Project root: ${BLD}${SCRIPT_DIR}${RST}"

# =============================================================================
# STEP 1 - OS Check (Ubuntu/Debian/RHEL)
# =============================================================================
step "Checking operating system"

if [[ ! -f /etc/os-release ]]; then
  die "Cannot detect OS - /etc/os-release not found. Supported: Ubuntu 20.04+, Debian 11+, AlmaLinux/Rocky Linux 8+."
fi

# shellcheck source=/dev/null
source /etc/os-release

OS_ID="${ID:-}"
OS_VERSION_MAJOR=$(echo "${VERSION_ID:-0}" | cut -d. -f1)
OS_VERSION_MINOR=$(echo "${VERSION_ID:-0}" | cut -d. -f2)

OS_FAMILY=""
PKG_MGR=""

case "${OS_ID}" in
  ubuntu)
    if ((OS_VERSION_MAJOR < 20)) || { ((OS_VERSION_MAJOR == 20)) && ((OS_VERSION_MINOR < 4)); }; then
      die "Ubuntu 20.04 or later is required. Detected: ${VERSION_ID:-unknown}."
    fi
    OS_FAMILY="debian"
    PKG_MGR="apt"
    ;;
  debian)
    if ((OS_VERSION_MAJOR < 11)); then
      die "Debian 11 or later is required. Detected: ${VERSION_ID:-unknown}."
    fi
    OS_FAMILY="debian"
    PKG_MGR="apt"
    ;;
  almalinux | rocky | rhel | centos)
    if ((OS_VERSION_MAJOR < 8)); then
      die "RHEL-family 8 or later is required. Detected: ${VERSION_ID:-unknown}."
    fi
    OS_FAMILY="rhel"
    PKG_MGR="dnf"
    ;;
  *)
    die "Unsupported OS: ${OS_ID:-unknown}. Supported: Ubuntu, Debian, AlmaLinux, Rocky Linux, RHEL."
    ;;
esac

if [[ "${PKG_MGR}" == "dnf" ]] && ! command -v dnf &> /dev/null; then
  if command -v yum &> /dev/null; then
    warn "dnf not found - falling back to yum."
    PKG_MGR="yum"
  else
    die "Neither dnf nor yum found. Cannot continue."
  fi
fi

success "${PRETTY_NAME:-${OS_ID}} - compatible"

# =============================================================================
# STEP 2 - sudo check
# =============================================================================
step "Checking sudo privileges"

SUDO_CMD=""
if [[ $EUID -eq 0 ]]; then
  info "Running as root - no sudo needed."
  SUDO_CMD=""
elif command -v sudo &> /dev/null; then
  if sudo -n true 2> /dev/null; then
    success "sudo is available and cached."
    SUDO_CMD="sudo"
  else
    echo ""
    info "This installer needs sudo to install system packages."
    echo -e "  ${BLD}Please enter your sudo password:${RST}"
    sudo -v || die "sudo authentication failed."
    (while true; do
      sudo -n true
      sleep 50
      kill -0 "$$" || exit
    done) 2> /dev/null &
    SUDO_KEEPALIVE_PID=$!
    SUDO_CMD="sudo"
    echo ""
    success "sudo access confirmed."
  fi
else
  die "sudo not found and you are not root. Install sudo or run as root."
fi

_sudo() {
  if [[ -z "${SUDO_CMD}" ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

RUN_USER="${SUDO_USER:-${USER}}"
RUN_HOME="$(getent passwd "${RUN_USER}" 2> /dev/null | cut -d: -f6)"
if [[ -z "${RUN_HOME}" ]]; then
  RUN_HOME="${HOME}"
fi

# =============================================================================
# STEP 3 - System update + base dependencies
# =============================================================================
step "Updating system and installing base dependencies"

pkg_update() {
  case "${PKG_MGR}" in
    apt) _sudo apt-get update -y -qq ;;
    dnf) _sudo dnf -y -q makecache ;;
    yum) _sudo yum -y -q makecache ;;
  esac
}

pkg_upgrade() {
  case "${PKG_MGR}" in
    apt) _sudo apt-get upgrade -y -qq ;;
    dnf) _sudo dnf -y -q upgrade ;;
    yum) _sudo yum -y -q update ;;
  esac
}

pkg_install() {
  case "${PKG_MGR}" in
    apt) _sudo apt-get install -y -qq "$@" ;;
    dnf) _sudo dnf -y -q install "$@" ;;
    yum) _sudo yum -y -q install "$@" ;;
  esac
}

info "Running package update..."
pkg_update

info "Running package upgrade (may take a moment)..."
pkg_upgrade

info "Installing base packages..."
if [[ "${OS_FAMILY}" == "debian" ]]; then
  pkg_install ca-certificates curl git build-essential
else
  pkg_install ca-certificates curl git gcc gcc-c++ make
fi
success "System packages are up to date."

# =============================================================================
# STEP 4 - Install mise
# =============================================================================
step "Installing mise (tool version manager)"

if command -v mise &> /dev/null; then
  MISE_VER="$(mise --version 2> /dev/null || echo 'unknown')"
  success "mise is already installed: ${MISE_VER}"
else
  if [[ "${OS_FAMILY}" == "debian" ]]; then
    info "Adding mise apt repository..."

    _sudo install -dm 755 /etc/apt/keyrings
    curl -fSs https://mise.en.dev/gpg-key.pub | _sudo tee /etc/apt/keyrings/mise-archive-keyring.asc 1> /dev/null
    echo "deb [signed-by=/etc/apt/keyrings/mise-archive-keyring.asc] https://mise.en.dev/deb stable main" | _sudo tee /etc/apt/sources.list.d/mise.list 1> /dev/null

    pkg_update
    pkg_install mise
  else
    info "Installing mise using the official install script..."
    curl -fsSL https://mise.jdx.dev/install.sh | sh
  fi

  if ! command -v mise &> /dev/null; then
    if [[ -x "${HOME}/.local/bin/mise" ]]; then
      export PATH="${HOME}/.local/bin:${PATH}"
    elif [[ -x "${HOME}/.local/share/mise/bin/mise" ]]; then
      export PATH="${HOME}/.local/share/mise/bin:${PATH}"
    fi
  fi

  if command -v mise &> /dev/null; then
    success "mise installed: $(mise --version 2> /dev/null || echo 'success')"
  else
    die "mise installation failed. Reload your shell and try again."
  fi
fi

# =============================================================================
# STEP 5 - Activate mise in shell rc
# =============================================================================
step "Activating mise in your shell"

CURRENT_SHELL=""
if [[ -n "${SHELL:-}" ]]; then
  CURRENT_SHELL="$(basename "${SHELL}")"
fi

if [[ -z "${CURRENT_SHELL}" ]]; then
  PARENT_CMD="$(ps -p $PPID -o comm= 2> /dev/null || true)"
  CURRENT_SHELL="$(basename "${PARENT_CMD:-bash}")"
fi

case "${CURRENT_SHELL}" in
  bash) SHELL_RC="${HOME}/.bashrc" ;;
  zsh) SHELL_RC="${HOME}/.zshrc" ;;
  fish) SHELL_RC="${HOME}/.config/fish/config.fish" ;;
  *)
    warn "Unknown shell '${CURRENT_SHELL}' - defaulting to bash."
    CURRENT_SHELL="bash"
    SHELL_RC="${HOME}/.bashrc"
    ;;
esac

_add_to_rc() {
  local line="$1"
  local file="$2"
  if grep -qF "${line}" "${file}" 2> /dev/null; then
    info "Already active in ${file}"
  else
    echo "${line}" >> "${file}"
    success "Added activation to ${file}"
  fi
}

mkdir -p "$(dirname "${SHELL_RC}")"
touch "${SHELL_RC}"

case "${CURRENT_SHELL}" in
  bash) _add_to_rc 'eval "$(mise activate bash)"' "${SHELL_RC}" ;;
  zsh) _add_to_rc 'eval "$(mise activate zsh)"' "${SHELL_RC}" ;;
  fish) _add_to_rc 'mise activate fish | source' "${SHELL_RC}" ;;
esac

if command -v mise &> /dev/null; then
  eval "$(mise activate bash)" 2> /dev/null || true
fi

# =============================================================================
# STEP 6 - Install project tools
# =============================================================================
step "Installing project tools (mise install)"

cd "${SCRIPT_DIR}"

info "Running 'mise install' to fetch Node and Yarn..."
if mise install; then
  success "Project tools installed successfully."
else
  warn "mise install encountered issues. Run 'mise doctor' to diagnose."
fi

# =============================================================================
# STEP 7 - Install JS dependencies
# =============================================================================
step "Installing project dependencies"

if command -v yarn &> /dev/null; then
  info "Running 'yarn install'..."
  yarn install
  success "Dependencies installed."
else
  die "yarn not found in PATH. Reload your shell or run: source ${SHELL_RC}"
fi

# =============================================================================
# STEP 8 - Install PM2 (system package)
# =============================================================================
step "Installing PM2 (system package)"

if command -v pm2 &> /dev/null; then
  success "pm2 is already installed: $(pm2 -v 2> /dev/null || echo 'installed')"
else
  if [[ "${OS_FAMILY}" == "rhel" ]]; then
    info "Ensuring EPEL repository is available..."
    if ! pkg_install epel-release; then
      warn "epel-release install failed. pm2 may be unavailable."
    fi
  fi

  if pkg_install pm2; then
    success "pm2 installed: $(pm2 -v 2> /dev/null || echo 'installed')"
  else
    die "pm2 package not available. Enable universe/epel and re-run the installer."
  fi
fi

if command -v systemctl &> /dev/null; then
  info "Configuring PM2 to start on boot for ${RUN_USER}..."
  if _sudo env PATH="${PATH}" pm2 startup systemd -u "${RUN_USER}" --hp "${RUN_HOME}" 1> /dev/null; then
    success "PM2 startup configured."
  else
    warn "PM2 startup failed. You can run: sudo env PATH=\$PATH pm2 startup systemd -u ${RUN_USER} --hp ${RUN_HOME}"
  fi
else
  warn "systemd not detected; PM2 autostart not configured."
fi

# =============================================================================
# STEP 9 - Optional setup wizard
# =============================================================================
step "Optional: run setup wizard"

read -r -p "Run 'yarn setup' now? [Y/n] " RUN_SETUP
RUN_SETUP=${RUN_SETUP:-Y}

if [[ "${RUN_SETUP}" =~ ^[Yy]$ ]]; then
  yarn setup
else
  info "Skipping setup wizard. You can run it later with: yarn setup"
fi

# =============================================================================
# Completion
# =============================================================================
echo ""
success "Meridian setup complete."
echo ""
echo -e "${BLD}Next steps:${RST}"
echo -e "  1) Reload your shell: ${BLD}source ${SHELL_RC}${RST}"
echo -e "  2) Start dry run:     ${BLD}yarn dev${RST}"
echo -e "  3) Start live mode:   ${BLD}yarn start${RST}"
echo ""
info "If you want PM2: run ${BLD}yarn pm2:start${RST} and then ${BLD}pm2 save${RST} to persist autostart."

if [[ -n "${SUDO_KEEPALIVE_PID:-}" ]]; then
  kill "${SUDO_KEEPALIVE_PID}" 2> /dev/null || true
fi
