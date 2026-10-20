"""Render compact, source-labeled charts from approved numeric plot specs."""
from __future__ import annotations

from pathlib import Path
from typing import Any
import textwrap


def render_chart(item: dict[str, Any], target: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    from matplotlib import pyplot as plt
    from matplotlib.font_manager import FontProperties

    spec = item["plot_spec"]
    labels = [str(value) for value in spec["x_labels"]]
    values = [float(value) for value in spec["y_values"]]
    if not 2 <= len(values) == len(labels) <= 12:
        raise ValueError("Chart data must contain 2–12 matching labels and values")
    # DejaVu includes Arabic presentation forms and is rendered consistently by
    # Matplotlib after bidi reshaping. The thesis body font is applied in Word.
    font = FontProperties(family="DejaVu Sans", size=13)

    def display(value: str) -> str:
        return str(value)

    fig, ax = plt.subplots(figsize=(10, 6), dpi=170)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("#f8fafc")
    positions = list(range(len(values)))
    if str(spec.get("chart_type") or "").lower() == "line":
        ax.plot(positions, values, marker="o", linewidth=2.5, color="#135f75")
        ax.fill_between(positions, values, alpha=0.12, color="#135f75")
    else:
        bars = ax.bar(positions, values, color="#277b89", width=0.62)
        for bar, value in zip(bars, values):
            label = f"{value:,.2f}".rstrip("0").rstrip(".")
            center = bar.get_x() + bar.get_width() / 2
            if value < 0:
                ax.annotate(label, (center, value / 2), ha="center", va="center",
                            fontsize=11, color="white", fontweight="bold")
            else:
                ax.annotate(label, (center, value), xytext=(0, 4), textcoords="offset points",
                            ha="center", fontsize=10, color="#172b3a")
    ax.set_xticks(positions, [display(label) for label in labels], fontproperties=font)
    ax.tick_params(axis="x", labelsize=11, pad=10)
    ax.tick_params(axis="y", labelsize=10)
    ax.text(0.01, 1.02, display(spec["y_unit"]), transform=ax.transAxes,
            fontproperties=font, fontsize=12, ha="left", color="#405564")
    ax.set_title(display(spec["title"]), fontproperties=font, fontsize=19, pad=22, color="#153b4d")
    ax.grid(axis="y", color="#dbe4e8", linewidth=0.8)
    ax.set_axisbelow(True)
    for edge in ("top", "right"):
        ax.spines[edge].set_visible(False)
    note = str(spec["source_note"]).strip()
    if len(note) > 170:
        raise ValueError("Chart source note is too long to remain legible")
    note_lines = textwrap.wrap("منبع/فرض: " + note, width=80, break_long_words=False)
    fig.text(0.95, 0.025, "\n".join(display(line) for line in note_lines), fontproperties=font,
             ha="right", va="bottom", fontsize=13, linespacing=1.5, color="#405564")
    fig.subplots_adjust(left=0.10, right=0.95, top=0.84, bottom=0.30)
    target.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(target, facecolor="white", bbox_inches="tight", pad_inches=0.18)
    plt.close(fig)
