#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY_ENV="${ROOT_DIR}/.venv"

API_LOG="/tmp/option_risk_api.log"
API_PID="/tmp/option_risk_api.pid"
VITE_LOG="/tmp/option_risk_vite.log"
VITE_PID="/tmp/option_risk_vite.pid"
DEFAULT_MARKET_DATA_DIR="${ROOT_DIR}/Datasets/Данные для работы"
DEMO_OUTPUT_DIR="${OPTION_RISK_DEMO_OUTPUT_DIR:-${TMPDIR:-/tmp}/option_risk_output_demo}"

stop_pidfile() {
  local pid_file="$1"
  local name="$2"
  local expected_grep="$3"
  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -z "${pid}" ]; then
    rm -f "$pid_file"
    return 0
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$pid_file"
    return 0
  fi

  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [ -n "$expected_grep" ] && ! echo "$cmd" | grep -E "$expected_grep" >/dev/null 2>&1; then
    echo "⚠️  PID-файл ${pid_file} указывает на чужой процесс (pid ${pid}). Не останавливаем."
    rm -f "$pid_file"
    return 0
  fi

  echo "==> Останавливаем ${name} (pid ${pid})"
  kill -TERM "-${pid}" >/dev/null 2>&1 || kill -TERM "${pid}" >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -KILL "-${pid}" >/dev/null 2>&1 || kill -KILL "${pid}" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
}

stop_api_orphans() {
  local port="${1:-8000}"

  if ! command -v lsof >/dev/null 2>&1; then
    echo "⚠️  lsof не найден — пропускаем очистку FastAPI по порту."
    return 0
  fi

  local pids
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return 0
  fi

  for pid in $pids; do
    # Безопасность: останавливаем только API-процессы, запущенные из этого проекта (cwd заканчивается на /backend).
    local cwd
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    if ! echo "$cwd" | grep -E "/backend$" >/dev/null 2>&1; then
      continue
    fi

    echo "==> Останавливаем FastAPI-демон (порт ${port}, pid ${pid})"
    kill -TERM "-${pid}" >/dev/null 2>&1 || kill -TERM "${pid}" >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -KILL "-${pid}" >/dev/null 2>&1 || kill -KILL "${pid}" >/dev/null 2>&1 || true
    fi
  done
}

stop_vite_orphans() {
  local start_port="${1:-5173}"
  local end_port="${2:-5190}"

  if ! command -v lsof >/dev/null 2>&1; then
    echo "⚠️  lsof не найден — пропускаем очистку Vite по портам."
    return 0
  fi

  for port in $(seq "$start_port" "$end_port"); do
    local pids
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -z "$pids" ]; then
      continue
    fi
    for pid in $pids; do
      local cmd
      cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if ! echo "$cmd" | grep -E "(^|[[:space:]])vite([[:space:]]|$)|node_modules/(\\.bin/vite|vite/)" >/dev/null 2>&1; then
        continue
      fi

      # Безопасность: останавливаем только vite-процессы, запущенные из этого проекта (cwd оканчивается на /frontend).
      local cwd
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
      if ! echo "$cwd" | grep -E "/frontend$" >/dev/null 2>&1; then
        continue
      fi

      if [ -n "$cmd" ]; then
        echo "==> Останавливаем Vite-демон (порт ${port}, pid ${pid})"
        kill -TERM "-${pid}" >/dev/null 2>&1 || kill -TERM "${pid}" >/dev/null 2>&1 || true
        for _ in $(seq 1 20); do
          if ! kill -0 "$pid" >/dev/null 2>&1; then
            break
          fi
          sleep 0.15
        done
        if kill -0 "$pid" >/dev/null 2>&1; then
          kill -KILL "-${pid}" >/dev/null 2>&1 || kill -KILL "${pid}" >/dev/null 2>&1 || true
        fi
      fi
    done
  done
}

reuse_listener_if_matching() {
  local pid_file="$1"
  local name="$2"
  local port="$3"
  local expected_grep="$4"
  local expected_cwd_suffix="$5"

  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi

  local pid
  pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n 1)"
  if [ -z "$pid" ]; then
    return 1
  fi

  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [ -n "$expected_grep" ] && [ -n "$cmd" ] && ! echo "$cmd" | grep -E "$expected_grep" >/dev/null 2>&1; then
    return 1
  fi

  local cwd
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  if [ -n "$expected_cwd_suffix" ] && ! echo "$cwd" | grep -E "$expected_cwd_suffix" >/dev/null 2>&1; then
    return 1
  fi

  echo "==> Используем уже запущенный ${name} (порт ${port}, pid ${pid})"
  printf '%s' "$pid" >"$pid_file"
  return 0
}

start_detached() {
  local pid_file="$1"
  local log_file="$2"
  shift 2

  : >"${log_file}"
  python3 - "$pid_file" "$log_file" "$@" <<'PY'
import subprocess
import sys

pid_file, log_file, *cmd = sys.argv[1:]
with open(log_file, "ab", buffering=0) as log:
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
with open(pid_file, "w", encoding="utf-8") as fh:
    fh.write(str(proc.pid))
PY
}

echo "==> 1) Подготовка Python окружения"
if [ ! -d "${PY_ENV}" ]; then
  python3 -m venv "${PY_ENV}"
fi
source "${PY_ENV}/bin/activate"
pip install -r "${ROOT_DIR}/backend/requirements.txt"

echo "==> 2) Тесты Python"
cd "${ROOT_DIR}/backend"
PYTHONPATH="." pytest tests -q

echo "==> 3) Пример запуска CLI (выгрузки в ${DEMO_OUTPUT_DIR})"
PYTHONPATH="." python -m option_risk.cli \
  --portfolio "${ROOT_DIR}/Datasets/examples/portfolio.csv" \
  --scenarios "${ROOT_DIR}/Datasets/examples/scenarios.csv" \
  --limits "${ROOT_DIR}/Datasets/examples/limits.json" \
  --market-data-dir "${DEFAULT_MARKET_DATA_DIR}" \
  --output "${DEMO_OUTPUT_DIR}"

echo "==> 4) Запуск FastAPI (фон, :8000)"
stop_pidfile "${API_PID}" "FastAPI" "uvicorn .*option_risk\\.api:app"
stop_api_orphans 8000
api_reused=0
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    if reuse_listener_if_matching "${API_PID}" "FastAPI" 8000 "uvicorn .*option_risk\\.api:app" "/backend$"; then
      api_reused=1
    else
      echo "❌ Порт 8000 уже занят. Освободите его и повторите запуск."
      lsof -nP -iTCP:8000 -sTCP:LISTEN || true
      exit 1
    fi
  fi
fi
if [ "${api_reused}" -ne 1 ]; then
  start_detached "${API_PID}" "${API_LOG}" env PYTHONPATH="." OPTION_RISK_DEFAULT_DATASETS_DIR="${DEFAULT_MARKET_DATA_DIR}" uvicorn option_risk.api:app --host 0.0.0.0 --port 8000
  echo "FastAPI запущен, лог: ${API_LOG}"
fi
if command -v curl >/dev/null 2>&1; then
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
  if ! curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    echo "❌ FastAPI не поднялся. Лог:"
    tail -n 80 "${API_LOG}" || true
    exit 1
  fi
fi

echo "==> 5) Подготовка фронта (npm install, Jest)"
cd "${ROOT_DIR}/frontend"
npm install
npm test

echo "==> 6) Запуск Vite dev-сервера на :5173 (фон)"
stop_pidfile "${VITE_PID}" "Vite" "npm run dev|node_modules/\\.bin/vite"
stop_vite_orphans 5173 5190
vite_reused=0
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
    if reuse_listener_if_matching "${VITE_PID}" "Vite" 5173 "(^|[[:space:]])vite([[:space:]]|$)|node_modules/(\\.bin/vite|vite/)" "/frontend$"; then
      vite_reused=1
    else
      echo "❌ Порт 5173 уже занят. Освободите его и повторите запуск."
      lsof -nP -iTCP:5173 -sTCP:LISTEN || true
      exit 1
    fi
  fi
fi
if [ "${vite_reused}" -ne 1 ]; then
  start_detached "${VITE_PID}" "${VITE_LOG}" env VITE_DEMO_MODE=0 ./node_modules/.bin/vite --host --port 5173 --strictPort
  echo "Vite запущен, лог: ${VITE_LOG}"
fi

echo "Готово. UI: http://localhost:5173 (бек: http://127.0.0.1:8000/health)."
