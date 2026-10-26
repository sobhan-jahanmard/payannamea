"use client";

import { PRESENTATION_STYLES, PRESENTATION_FONTS } from "../lib/presentation";

export function PresentationOptions({ style, font, onStyle, onFont }: {
  style: string; font: string; onStyle: (id: string) => void; onFont: (id: string) => void;
}) {
  return <section className="space-y-5" aria-labelledby="presentation-design-heading" dir="rtl">
    <div><h2 id="presentation-design-heading" className="text-base font-semibold">ظاهر ارائه</h2><p className="mt-1 text-sm text-muted-foreground">سبک دلخواه را انتخاب کنید. یادداشت توضیح شفاهی و صفحات مرتبط منبع، همراه هر اسلاید قرار می‌گیرد.</p></div>
    <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-medium">سبک ارائه</legend>
      {PRESENTATION_STYLES.map(item => <label key={item.id} className={`cursor-pointer rounded-xl border-2 p-3 transition focus-within:ring-2 focus-within:ring-primary ${style === item.id ? "border-primary bg-primary/5" : "border-border bg-white"}`}>
        <div className="mb-3 aspect-video overflow-hidden rounded-md border border-black/10" style={{ background: `#${item.canvas}` }}>
          <img src={`/presentation-previews/${item.id}.png`} alt={`نمونهٔ چیدمان ${item.label}`} className="h-full w-full object-contain"/>
        </div>
        <span className="flex min-h-11 items-center gap-2"><input type="radio" name="presentation-style" value={item.id} checked={style === item.id} onChange={() => onStyle(item.id)} className="h-4 w-4 accent-teal-700"/><b className="text-sm">{item.label}</b></span>
        <span className="block text-xs leading-6 text-muted-foreground">{item.description}</span>
      </label>)}
    </fieldset>
    <div className="space-y-2"><label htmlFor="presentation-font" className="block text-sm font-medium">فونت ارائه</label>
      <select id="presentation-font" value={font} onChange={event => onFont(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-white px-3 text-sm sm:max-w-md">
        {PRESENTATION_FONTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select><p className="text-xs leading-6 text-muted-foreground">در صورت نداشتن ترجیح، وزیرمتن برای نمایش فارسی انتخاب می‌شود. فونت انتخابی در عنوان، بدنه، جدول و نمودار اعمال می‌شود.</p>
    </div>
  </section>;
}
