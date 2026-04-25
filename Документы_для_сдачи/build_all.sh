#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v typst >/dev/null 2>&1; then
  echo "typst не найден. Установите Typst и повторите сборку."
  exit 1
fi

find "${ROOT_DIR}" -name main.typ -print0 | while IFS= read -r -d '' main_file; do
  doc_dir="$(dirname "${main_file}")"
  out_file="${doc_dir}/$(basename "${doc_dir}").pdf"
  echo "==> ${out_file}"
  typst compile --root "${ROOT_DIR}" "${main_file}" "${out_file}"
done
