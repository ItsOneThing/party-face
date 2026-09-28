#!/bin/zsh
set -eu
cd "$(dirname "$0")"
if [[ -x .venv/bin/python ]]; then
  task_python="$PWD/.venv/bin/python"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" ]]; then
  task_python="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
else
  task_python="$(command -v python3)"
fi
if ! "$task_python" -c 'import PIL' >/dev/null 2>&1; then
  echo '请先按照 README 安装本地 Python 依赖。'
  exit 1
fi
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi
"$task_python" tools/server.py
