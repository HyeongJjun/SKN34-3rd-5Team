#!/usr/bin/env bash
# README · 산출물 그림 다시 만들기 (레포 최상위에서: bash docs/diagrams/render.sh)
#   *.mmd  → docs/images/*.png   (필요: Node.js 18+)
#   chart_hit5.py → docs/images/test_hit5_by_config.png   (필요: Python + matplotlib)
set -e
cd "$(dirname "$0")"
for f in *.mmd; do
  npx -y @mermaid-js/mermaid-cli@11 -i "$f" -o "../images/${f%.mmd}.png" -b white -s 3 -c mermaid.config.json
  echo "그림 생성: docs/images/${f%.mmd}.png"
done
python chart_hit5.py && echo "그림 생성: docs/images/test_hit5_by_config.png"
