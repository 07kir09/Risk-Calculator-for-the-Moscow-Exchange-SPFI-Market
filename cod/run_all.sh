#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY_ENV="${ROOT_DIR}/../.venv"

API_LOG="/tmp/option_risk_api.log"
API_PID="/tmp/option_risk_api.pid"
VITE_LOG="/tmp/option_risk_vite.log"
VITE_PID="/tmp/option_risk_vite.pid"

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
    local cmd
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if ! echo "$cmd" | grep -E "uvicorn .*option_risk\\.api:app" >/dev/null 2>&1; then
      continue
    fi

    # Безопасность: останавливаем только API-процессы, запущенные из этого проекта (cwd заканчивается на /cod).
    local cwd
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    if ! echo "$cwd" | grep -E "/cod$" >/dev/null 2>&1; then
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

      # Безопасность: останавливаем только vite-процессы, запущенные из этого проекта (cwd содержит /cod/frontend или /Cod/frontend).
      local cwd
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
      if ! echo "$cwd" | grep -E "/[Cc]od/frontend$" >/dev/null 2>&1; then
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

echo "==> 1) Подготовка Python окружения"
if [ ! -d "${PY_ENV}" ]; then
  python3 -m venv "${PY_ENV}"
fi
source "${PY_ENV}/bin/activate"
pip install -r "${ROOT_DIR}/requirements.txt"

echo "==> 2) Тесты Python"
cd "${ROOT_DIR}"
PYTHONPATH="." pytest tests -q

echo "==> 3) Пример запуска CLI (выгрузки в cod/output_demo)"
PYTHONPATH="." python -m option_risk.cli \
  --portfolio examples/portfolio.csv \
  --scenarios examples/scenarios.csv \
  --limits examples/limits.json \
  --output output_demo

echo "==> 4) Запуск FastAPI (фон, :8000)"
stop_pidfile "${API_PID}" "FastAPI" "uvicorn .*option_risk\\.api:app"
stop_api_orphans 8000
if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ Порт 8000 уже занят. Освободите его и повторите запуск."
    lsof -nP -iTCP:8000 -sTCP:LISTEN || true
    exit 1
  fi
fi
nohup env PYTHONPATH="." uvicorn option_risk.api:app --host 0.0.0.0 --port 8000 >"${API_LOG}" 2>&1 &
echo $! >"${API_PID}"
echo "FastAPI запущен, лог: ${API_LOG}"
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
rm -rf "${ROOT_DIR}/frontend/node_modules/.vite" 2>/dev/null || true
nohup env VITE_DEMO_MODE=0 ./node_modules/.bin/vite --host --port 5173 --strictPort --force >"${VITE_LOG}" 2>&1 &
echo $! >"${VITE_PID}"
echo "Vite запущен, лог: ${VITE_LOG}"

echo "Готово. UI: http://localhost:5173 (бек: http://127.0.0.1:8000/health)."
