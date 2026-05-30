#!/usr/bin/env bash
# sync.sh — Sync Meridian runtime state files between local machine and server
#
# Usage:
#   ./sync.sh pull    — Download files from server → local
#   ./sync.sh push    — Upload files from local → server
#
# Configure via .env in the same directory:
#   SERVER_ADDRESS   — Server hostname or IP  (required)
#   SERVER_USERNAME  — SSH login user         (default: ubuntu)
#   SERVER_PATH      — Remote Meridian dir    (default: /home/ubuntu/meridian)
#   LOCAL_PATH       — Local Meridian dir     (default: script's directory)
#   SSH_KEY          — Path to .pem/.key file (optional; wins over password)
#   SERVER_PASSWORD  — SSH password           (optional; needs sshpass installed)

set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Load .env ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# ─── Config ───────────────────────────────────────────────────────────────────
LOCAL_PATH="${LOCAL_PATH:-$SCRIPT_DIR}"
REMOTE_PATH="${SERVER_PATH:-/home/ubuntu/meridian}"
SERVER_USERNAME="${SERVER_USERNAME:-ubuntu}"
SERVER_ADDRESS="${SERVER_ADDRESS:-}"
SSH_KEY="${SSH_KEY:-}"
SERVER_PASSWORD="${SERVER_PASSWORD:-}"

# ─── Files to sync ────────────────────────────────────────────────────────────
FILES=(
  state.json
  lessons.json
  smart-wallets.json
  pool-memory.json
  token-blacklist.json
  strategy-library.json
  decision-log.json
  gmgn-cache.json
  hivemind-cache.json
  signal-weights.json
  skipped-pools.json
  paper-positions.json
  user-config.json
  dev-blocklist.json
  discord-signals.json
  virtual-positions.json
  causal-analysis.json
  position-journal.db
  position-journal.db-shm
  position-journal.db-wal
  config-snapshots.json
  .env
)

# ─── Usage / mode ─────────────────────────────────────────────────────────────
MODE="${1:-}"
if [[ "$MODE" != "pull" && "$MODE" != "push" ]]; then
  echo -e "Usage: ${BOLD}$0 pull|push${NC}"
  echo ""
  echo -e "  ${BOLD}pull${NC}  — Download files from server → local"
  echo -e "  ${BOLD}push${NC}  — Upload files from local → server"
  echo ""
  echo "Required .env keys:"
  echo "  SERVER_ADDRESS   server hostname or IP"
  echo ""
  echo "Optional .env keys:"
  echo "  SERVER_USERNAME  SSH user          (default: ubuntu)"
  echo "  SERVER_PATH      remote Meridian   (default: /home/ubuntu/meridian)"
  echo "  LOCAL_PATH       local Meridian    (default: script directory)"
  echo "  SSH_KEY          path to key file  (e.g. ~/.ssh/id_rsa or /path/key.pem)"
  echo "  SERVER_PASSWORD  SSH password      (requires sshpass; SSH_KEY takes priority)"
  exit 1
fi

# ─── Validate required vars ───────────────────────────────────────────────────
if [ -z "$SERVER_ADDRESS" ]; then
  echo -e "${RED}Error:${NC} SERVER_ADDRESS is not set. Add it to .env or export it."
  exit 1
fi

# ─── Build SSH / rsync transport ──────────────────────────────────────────────
SSH_BASE_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
USE_SSHPASS=false

if [ -n "$SSH_KEY" ]; then
  if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}Error:${NC} SSH_KEY file not found: ${BOLD}${SSH_KEY}${NC}"
    exit 1
  fi
  SSH_BASE_OPTS+=(-i "$SSH_KEY")
elif [ -n "$SERVER_PASSWORD" ]; then
  if ! command -v sshpass &> /dev/null; then
    echo -e "${RED}Error:${NC} SERVER_PASSWORD is set but ${BOLD}sshpass${NC} is not installed."
    echo -e "  macOS:  ${DIM}brew install sshpass${NC}"
    echo -e "  Ubuntu: ${DIM}sudo apt install sshpass${NC}"
    echo "  Or use SSH_KEY instead."
    exit 1
  fi
  export SSHPASS="$SERVER_PASSWORD"
  USE_SSHPASS=true
fi

REMOTE="${SERVER_USERNAME}@${SERVER_ADDRESS}"

# Build the ssh runner function
ssh_run() {
  if $USE_SSHPASS; then
    sshpass -e ssh "${SSH_BASE_OPTS[@]}" "$REMOTE" "$@"
  else
    ssh "${SSH_BASE_OPTS[@]}" "$REMOTE" "$@"
  fi
}

# rsync -e transport string (needs to be a plain string, not a function)
if $USE_SSHPASS; then
  RSYNC_RSH="sshpass -e ssh $(printf '%s ' "${SSH_BASE_OPTS[@]}")"
else
  RSYNC_RSH="ssh $(printf '%s ' "${SSH_BASE_OPTS[@]}")"
fi

# ─── Local hash helper ────────────────────────────────────────────────────────
local_hash() {
  local path="${LOCAL_PATH}/${1}"
  if [ ! -f "$path" ]; then
    echo "MISSING"
    return
  fi
  if command -v sha256sum &> /dev/null; then
    sha256sum "$path" | awk '{print $1}'
  else
    shasum -a 256 "$path" | awk '{print $1}'
  fi
}

# ─── Remote hash fetch (single SSH connection) ────────────────────────────────
fetch_remote_hashes() {
  # Build file list as a single space-separated string to embed in the script
  local file_list
  file_list=$(printf '%s ' "${FILES[@]}")

  # The remote script: cd into the remote path, hash each file
  local remote_script
  remote_script=$(
    cat << 'RSCRIPT'
set -e
cd 'REMOTE_PATH_TOKEN' 2>/dev/null || { echo "REMOTE_PATH_ERR"; exit 1; }
for f in FILE_LIST_TOKEN; do
  if [ -f "$f" ]; then
    h=$(sha256sum "$f" 2>/dev/null | awk '{print $1}')
    [ -z "$h" ] && h=$(shasum -a 256 "$f" 2>/dev/null | awk '{print $1}')
    [ -z "$h" ] && h="ERROR"
    printf '%s %s\n' "$h" "$f"
  else
    printf 'MISSING %s\n' "$f"
  fi
done
RSCRIPT
  )
  remote_script="${remote_script//REMOTE_PATH_TOKEN/$REMOTE_PATH}"
  remote_script="${remote_script//FILE_LIST_TOKEN/$file_list}"

  ssh_run "bash -s" <<< "$remote_script"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Meridian Sync — ${MODE^^}${NC}"
if [ "$MODE" = "pull" ]; then
  echo -e "${DIM}  ${REMOTE}:${REMOTE_PATH}  →  ${LOCAL_PATH}${NC}"
else
  echo -e "${DIM}  ${LOCAL_PATH}  →  ${REMOTE}:${REMOTE_PATH}${NC}"
fi
echo ""
echo -e "Comparing hashes (single SSH connection)..."
echo ""

# Fetch remote hashes
declare -A REMOTE_HASH=()
remote_output=""
if ! remote_output=$(fetch_remote_hashes 2>&1); then
  # Check if it's a path error vs connection error
  if grep -q "REMOTE_PATH_ERR" <<< "$remote_output" 2> /dev/null; then
    echo -e "${RED}Error:${NC} Remote path not found: ${BOLD}${REMOTE_PATH}${NC}"
    echo "Set SERVER_PATH in .env to the correct Meridian directory on the server."
  else
    echo -e "${RED}Error:${NC} Could not connect to ${BOLD}${REMOTE}${NC}"
    echo "$remote_output"
  fi
  exit 1
fi

while IFS=' ' read -r hash file; do
  [ -n "$file" ] && REMOTE_HASH["$file"]="$hash"
done <<< "$remote_output"

# ─── Compare ──────────────────────────────────────────────────────────────────
declare -a CHANGED_FILES=()

COL_F=32
printf "  %-${COL_F}s %s\n" "FILE" "STATUS"
printf "  %-${COL_F}s %s\n" "$(printf '%.0s-' {1..32})" "--------"

for file in "${FILES[@]}"; do
  lhash=$(local_hash "$file")
  rhash="${REMOTE_HASH[$file]:-MISSING}"

  if [ "$lhash" = "MISSING" ] && [ "$rhash" = "MISSING" ]; then
    printf "  ${DIM}%-${COL_F}s absent (both)${NC}\n" "$file"

  elif [ "$lhash" = "MISSING" ]; then
    if [ "$MODE" = "pull" ]; then
      printf "  ${CYAN}%-${COL_F}s${NC} ${YELLOW}server only — will download${NC}\n" "$file"
      CHANGED_FILES+=("$file")
    else
      printf "  ${DIM}%-${COL_F}s server only — skipped on push${NC}\n" "$file"
    fi

  elif [ "$rhash" = "MISSING" ]; then
    if [ "$MODE" = "push" ]; then
      printf "  ${CYAN}%-${COL_F}s${NC} ${YELLOW}local only — will upload${NC}\n" "$file"
      CHANGED_FILES+=("$file")
    else
      printf "  ${DIM}%-${COL_F}s local only — skipped on pull${NC}\n" "$file"
    fi

  elif [ "$lhash" = "$rhash" ]; then
    printf "  ${GREEN}%-${COL_F}s in sync ✓${NC}\n" "$file"

  else
    printf "  ${YELLOW}%-${COL_F}s${NC} ${RED}DIFFERENT — will %s${NC}\n" "$file" "$MODE"
    CHANGED_FILES+=("$file")
  fi
done

echo ""

# ─── Nothing to do ────────────────────────────────────────────────────────────
if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
  echo -e "${GREEN}✓ Everything is already in sync. Nothing to ${MODE}.${NC}"
  echo ""
  exit 0
fi

# ─── Confirm ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}${#CHANGED_FILES[@]} file(s) differ.${NC} Review each one:"
echo ""

if [ "$MODE" = "pull" ]; then
  echo -e "${YELLOW}⚠  Y will overwrite your LOCAL file with the server version.${NC}"
else
  echo -e "${YELLOW}⚠  Y will overwrite the SERVER file with your local version.${NC}"
fi

# Warn about SQLite WAL files if present
db_files=()
for f in "${CHANGED_FILES[@]}"; do
  [[ "$f" == position-journal.db* ]] && db_files+=("$f")
done
if [ ${#db_files[@]} -gt 0 ]; then
  echo -e "${DIM}  Note: SQLite DB files included. Ensure Meridian is stopped on the${NC}"
  echo -e "${DIM}  ${MODE} destination before continuing to avoid a corrupted journal.${NC}"
fi

echo ""

# Per-file Y/N selection
declare -a APPROVED_FILES=()
for f in "${CHANGED_FILES[@]}"; do
  printf "  \033[0;36m%s\033[0m — %s? [Y/n/a(all)/q(quit)] " "$f" "$MODE"
  read -r answer
  answer="${answer:-y}"
  case "$answer" in
    [Yy]) APPROVED_FILES+=("$f") ;;
    [Aa])
      # Accept all remaining files
      APPROVED_FILES+=("$f")
      for remaining in "${CHANGED_FILES[@]}"; do
        [[ "$remaining" == "$f" ]] && continue
        # Only add files not already added
        already=false
        for already_added in "${APPROVED_FILES[@]}"; do
          [[ "$already_added" == "$remaining" ]] && already=true && break
        done
        $already || APPROVED_FILES+=("$remaining")
      done
      echo -e "  ${DIM}(all remaining accepted)${NC}"
      break
      ;;
    [Qq])
      echo ""
      echo "Aborted."
      exit 0
      ;;
    *) echo -e "  ${DIM}skipped${NC}" ;;
  esac
done

echo ""

if [ ${#APPROVED_FILES[@]} -eq 0 ]; then
  echo -e "${DIM}No files selected. Nothing to ${MODE}.${NC}"
  echo ""
  exit 0
fi

echo -e "${BOLD}${#APPROVED_FILES[@]} file(s) will be ${MODE}ed:${NC}"
for f in "${APPROVED_FILES[@]}"; do
  echo -e "  • $f"
done
echo ""

# ─── Execute ──────────────────────────────────────────────────────────────────
RSYNC_OPTS=(-az --no-perms --no-owner --no-group --progress -e "$RSYNC_RSH")
success=0
fail=0

for file in "${APPROVED_FILES[@]}"; do
  printf "  %-34s" "${file}..."
  if [ "$MODE" = "pull" ]; then
    src="${REMOTE}:${REMOTE_PATH}/${file}"
    dst="${LOCAL_PATH}/${file}"
  else
    src="${LOCAL_PATH}/${file}"
    dst="${REMOTE}:${REMOTE_PATH}/${file}"
  fi

  if rsync "${RSYNC_OPTS[@]}" "$src" "$dst" &> /dev/null; then
    echo -e "${GREEN}✓${NC}"
    ((success++)) || true
  else
    echo -e "${RED}✗ failed${NC}"
    ((fail++)) || true
  fi
done

echo ""
msg="${GREEN}${success} synced${NC}"
[ "$fail" -gt 0 ] && msg+=", ${RED}${fail} failed${NC}"
echo -e "${BOLD}Done:${NC} ${msg}"
echo ""
