"""Render public style thumbnails from clearly synthetic data, never customer files."""
from pathlib import Path
import argparse
import json

from presentation.design import catalog, resolve_design
from presentation.compose import build_designed_pptx
from presentation.deck import render_powerpoint


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.workspace.resolve()
    root.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    import fitz
    with fitz.open() as document:
        document.new_page().insert_text((72, 72), "Design demonstration: 12 sections, 4 charts, 3 reviews. Synthetic data.")
        document.save(root / "design-demo.pdf")
    sources = {"sources": [{"id": "S1", "name": "design-demo.pdf", "images": [], "pagination": {"method": "original_pdf"},
        "segments": [{"id": "S1:page-1", "text": "Design demonstration", "pages": [1]}]}]}
    note = "نمونهٔ طراحی؛ داده‌ها صرفاً برای نمایش قالب‌اند و به سفارش واقعی مربوط نیستند."
    shared = {"notes": note, "evidence": [{"locator": "S1:page-1", "quote": "Design demonstration"}], "points": []}
    spec = {"slides": [
        {**shared, "section": "title", "layout": "title", "title": "نمونهٔ طراحی ارائه", "points": ["نمایش سبک، تایپوگرافی و چیدمان"]},
        {**shared, "section": "results", "layout": "key_metric", "title": "یک پیام روشن در هر اسلاید", "description": "نمونهٔ نمایشی برای انتخاب ظاهر ارائه؛ داده‌ها آموزشی‌اند", "visual": {"metrics": [
            {"label": "بخش‌های اصلی", "value": "۱۲", "detail": "ساختار قابل تنظیم"}, {"label": "نوع نمودار", "value": "۴", "detail": "دادهٔ قابل ویرایش"}, {"label": "مرحلهٔ بازبینی", "value": "۳", "detail": "کنترل کیفیت ارائه"}]}},
        {**shared, "section": "method", "layout": "process", "title": "از منبع تا ارائهٔ آماده", "description": "نمونهٔ نمایشی از چیدمان فرایند", "visual": {"nodes": [
            {"label": "مطالعهٔ منبع"}, {"label": "تدوین روایت"}, {"label": "انتخاب شواهد"}, {"label": "طراحی اسلاید"}, {"label": "بازبینی"}, {"label": "آمادگی ارائه"}]}}
    ]}
    for style in catalog()["styles"]:
        folder = root / style["id"]
        folder.mkdir(exist_ok=True)
        rules = {"title": "نمونهٔ طراحی", "rtl": True, "font": "Vazirmatn", "layout_version": 2, "design": resolve_design({"presentation_style": style["id"]})}
        build_designed_pptx(spec, rules, sources, folder / "demo.pptx", root)
        render_powerpoint(folder / "demo.pptx", folder / "demo.pdf", folder / "pages")
        from PIL import Image
        number = 3 if style["id"] == "visual-teaching" else 2
        with Image.open(folder / f"pages/slide-{number:03}.png") as image:
            image.resize((960, 540), Image.Resampling.LANCZOS).save(args.output / f"{style['id']}.png")
        print(style["id"], flush=True)


if __name__ == "__main__":
    main()
