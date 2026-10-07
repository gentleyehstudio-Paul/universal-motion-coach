#!/bin/zsh
cd "$(dirname "$0")"
export PORT=8766
motion_origin="http://127.0.0.1:${PORT}/"
motion_url="${motion_origin}app/"
motion_status=$(/usr/bin/curl --silent --show-error --fail --max-time 2 "${motion_origin}api/status" 2>/dev/null || true)
if [[ "$motion_status" == *'"provider":"OpenAI"'* && "$motion_status" == *'"configured":true'* ]]; then
  printf 'Motion Lab 已在 %s 執行中；不需再次輸入 API 金鑰。\n' "$motion_url"
  /usr/bin/open "$motion_url"
  exit 0
fi
if [[ "$motion_status" == *'"provider":"OpenAI"'* && "$motion_status" == *'"configured":false'* ]]; then
  printf 'Motion Lab 目前以未啟用 AI 的模式執行。請先關閉原本啟動它的終端機，再重新執行此命令並輸入 API 金鑰。\n' >&2
  exit 1
fi
if /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  printf '連接埠 %s 已被其他程式占用。請先確認該程式，Motion Lab 不會覆蓋或停止它。\n' "$PORT" >&2
  exit 1
fi
printf 'OpenAI API key（隱藏輸入，不寫入檔案）：'
read -rs OPENAI_API_KEY
printf '\n'
if [[ -z "$OPENAI_API_KEY" ]]; then
  printf '未輸入金鑰，未啟動 AI。\n'
  exit 1
fi
export OPENAI_API_KEY
printf '請開啟 %s 。關閉此終端後，金鑰隨程序結束。\n' "$motion_url"
exec /opt/homebrew/bin/node server.mjs
