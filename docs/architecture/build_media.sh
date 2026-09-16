#!/usr/bin/env bash
# 아키텍처 · 흐름 그림 다시 만들기 (레포 최상위에서 실행)
#
#   1) archify JSON → HTML        : ARCHIFY=/path/to/archify  (archify 스킬 폴더, Node.js 18+)
#   2) HTML → PNG · SVG · WebM     : python + playwright
#   3) WebM → GIF(README·PPT) · MP4(PPT) : ffmpeg
#
# 사용: ARCHIFY=~/archify bash docs/architecture/build_media.sh
#       (ARCHIFY 가 없으면 1단계를 건너뛰고 지금 있는 HTML 로 2·3단계만 합니다)
set -e
cd "$(dirname "$0")"
DIAGRAMS="architecture:system_architecture workflow:chat_pipeline sequence:course_sequence dataflow:data_pipeline workflow:deploy_cicd workflow:ux_flow"

if [ -n "$ARCHIFY" ]; then
  for item in $DIAGRAMS; do
    type=${item%%:*}; name=${item##*:}
    node "$ARCHIFY/bin/archify.mjs" deliver "$type" "$name.archify.json" "$name.html" --quality showcase
  done
fi

python export_media.py

for item in $DIAGRAMS; do
  name=${item##*:}
  ffmpeg -v error -y -i "../media/$name.webm" \
    -vf "fps=15,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
    -loop 0 "../images/$name.gif"
  ffmpeg -v error -y -i "../media/$name.webm" \
    -vf "fps=30,scale=trunc(iw*2/2)*2:trunc(ih*2/2)*2:flags=lanczos,format=yuv420p" \
    -c:v libx264 -crf 18 -preset slow -movflags +faststart "../media/$name.mp4"
  echo "완료: images/$name.gif · media/$name.mp4"
done
