import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams["font.family"] = ["Malgun Gothic", "AppleGothic", "Noto Sans CJK KR", "Noto Sans CJK JP", "sans-serif"]
SURF, INK, INK2, MUTED, GRID, BLUE = "#fcfcfb", "#0b0b0b", "#52514e", "#8a8984", "#e6e5e0", "#2a78d6"
labels = ["R0\n벡터 검색만", "R1\n+ 구장 필터", "R2\n+ 카테고리 필터", "R3\n+ 키워드 재정렬", "R4 (최종)\n+ 날짜 가산"]
hit5 = [51.1, 55.6, 86.7, 93.3, 95.6]
mrr = [0.452, 0.456, 0.719, 0.814, 0.836]
fig, ax = plt.subplots(figsize=(8, 4.6), dpi=200)
fig.patch.set_facecolor(SURF); ax.set_facecolor(SURF)
ax.bar(range(5), hit5, width=0.56, color=BLUE, zorder=3)
for i, (v, m) in enumerate(zip(hit5, mrr)):
    ax.text(i, v + 2, f"{v:.1f}%", ha="center", va="bottom", fontsize=12, color=INK, fontweight="bold")
    ax.text(i, 4, f"MRR {m:.3f}", ha="center", va="bottom", fontsize=8.5, color="white")
ax.set_xticks(range(5)); ax.set_xticklabels(labels, fontsize=9.5, color=INK2)
ax.set_ylim(0, 110); ax.set_yticks([0, 25, 50, 75, 100]); ax.set_yticklabels(["0", "25%", "50%", "75%", "100%"], fontsize=9, color=MUTED)
ax.grid(axis="y", color=GRID, lw=0.8, zorder=0)
for s in ["top", "right", "left"]: ax.spines[s].set_visible(False)
ax.spines["bottom"].set_color(GRID); ax.tick_params(length=0)
ax.set_title("검색 설정별 Hit@5", loc="left", fontsize=15, color=INK, fontweight="bold", pad=24)
ax.text(0, 1.035, "임베딩 모델은 그대로, 필터와 재정렬만 더해 51.1% → 95.6%", transform=ax.transAxes, fontsize=10, color=INK2)
fig.text(0.01, 0.01, "club 골든셋 중 정답 문서가 있는 45문항 · ef_search=200 · 2026-09-14", fontsize=7.5, color=MUTED)
plt.tight_layout(rect=(0, 0.03, 1, 1))
import pathlib
out = pathlib.Path(__file__).resolve().parent.parent / "images" / "test_hit5_by_config.png"
fig.savefig(out, facecolor=SURF)
