import { useEffect, useState } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import "./presentation-preview.css";

export function PresentationPreview({ orderId, onClose }: { orderId: string; onClose(): void }) {
  const [slides, setSlides] = useState<{ title: string }[]>([]);
  const [number, setNumber] = useState(1);
  const [current, setCurrent] = useState<{ title: string; notes: string; image: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    window.workerPlus.presentationPreview(orderId).then(data => { if (!disposed) setSlides(data.slides); }).catch(e => { if (!disposed) setError(String(e.message || e)); });
    return () => { disposed = true; };
  }, [orderId]);
  useEffect(() => {
    let disposed = false;
    setCurrent(null);
    if (slides.length) window.workerPlus.presentationPreview(orderId, number).then(data => { if (!disposed) { setCurrent(data); setError(""); } }).catch(e => { if (!disposed) setError(String(e.message || e)); });
    return () => { disposed = true; };
  }, [orderId, number, slides.length]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [onClose]);
  return <div className="presentation-overlay"><section className="presentation-dialog" role="dialog" aria-modal="true" aria-label="پیش‌نمایش ارائه و راهنمای مطالعه" dir="rtl">
    <header><h2>اسلاید و راهنمای مطالعه</h2><button autoFocus onClick={onClose} aria-label="بستن پیش‌نمایش"><X size={20}/></button></header>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="presentation-reading"><div className="presentation-slide">{current?.image ? <img src={current.image} alt={current.title}/> : <p>{current ? "تصویر پس از مرحله رندر آماده می‌شود." : "در حال دریافت پیش‌نمایش…"}</p>}</div><aside><h3>{current?.title}</h3><pre>{current?.notes}</pre></aside></div>
    <nav aria-label="انتخاب اسلاید"><button disabled={number <= 1} onClick={() => setNumber(n => n - 1)}><ChevronRight size={18}/>قبلی</button><span>{number.toLocaleString("fa-IR")} از {slides.length.toLocaleString("fa-IR")}</span><button disabled={number >= slides.length} onClick={() => setNumber(n => n + 1)}>بعدی<ChevronLeft size={18}/></button></nav>
  </section></div>;
}
