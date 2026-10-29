"use client";

import { LockKeyhole, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { getAdminReviewScores } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { reviewCriteria, type LocalReviewScore } from "../../lib/review-scores";
import { Button } from "../ui/button";

export function LocalReviewScores({ orderId, refreshKey }: { orderId: string; refreshKey: object }) {
  const [reviews, setReviews] = useState<LocalReviewScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getAdminReviewScores(orderId).then(result => {
      if (active) setReviews(result.reviews);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "دریافت نمره‌های بازبینی ناموفق بود.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [orderId, refreshKey, retry]);

  return (
    <section className="tool-surface grid gap-4 p-5" aria-labelledby="review-scores-heading" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="review-scores-heading" className="text-lg font-semibold">نمره‌های بازبینی</h2>
          <p className="mt-1 text-sm text-muted-foreground">تاریخچه ارزیابی‌های مستقل، با نمره از ۲۰ و جزئیات هر معیار.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs font-medium">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          فقط مدیر
        </span>
      </div>
      {loading ? <p className="text-sm text-muted-foreground" role="status">در حال دریافت نمره‌ها...</p> : error ? (
        <div className="grid gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p>{error}</p>
          <Button variant="outline" className="w-fit" onClick={() => setRetry(value => value + 1)}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />تلاش دوباره
          </Button>
        </div>
      ) : reviews.length ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{reviews.length.toLocaleString("fa-IR")} بازبینی ثبت شده</p>
          {reviews.map((review, index) => (
            <details key={review.run_id} open={index === 0} className="group min-w-0 rounded-md border border-border bg-white">
              <summary className="cursor-pointer p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-3 align-middle">
                  <span className="grid gap-1">
                    <span className="font-medium">{formatDateTime(review.reviewed_at)}</span>
                    <span className="text-xs text-muted-foreground">{review.matches_delivery ? "مطابق نسخه ارسالی" : "نسخه پیشین"} · {review.status === "complete" ? "بازبینی کامل" : "ارزیابی ناتمام"}</span>
                  </span>
                  <span className="rounded-md bg-muted px-3 py-2 text-base font-semibold tabular-nums">
                    {review.score === null ? "بدون نمره" : `${review.score.toLocaleString("fa-IR")} از ۲۰`}
                  </span>
                </span>
              </summary>
              <div className="grid gap-4 border-t border-border p-4 text-sm">
                <p className="whitespace-pre-wrap break-words leading-7">{review.summary}</p>
                {review.rubric.length ? (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full min-w-[480px] text-right">
                      <caption className="sr-only">جزئیات نمره بازبینی</caption>
                      <thead className="bg-muted"><tr><th scope="col" className="p-3">معیار</th><th scope="col" className="p-3">نمره</th><th scope="col" className="p-3">دلیل</th></tr></thead>
                      <tbody>{review.rubric.map(row => (
                        <tr key={row.id} className="border-t border-border align-top">
                          <th scope="row" className="p-3 font-medium">{reviewCriteria[row.id].label}</th>
                          <td className="whitespace-nowrap p-3 tabular-nums">{row.score.toLocaleString("fa-IR")} از {reviewCriteria[row.id].max.toLocaleString("fa-IR")}</td>
                          <td className="whitespace-pre-wrap break-words p-3 leading-6 text-muted-foreground">{row.reason}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : null}
                {review.blockers.length ? <div className="rounded-md bg-amber-50 p-3 text-amber-900"><p className="mb-2 font-medium">موانع تکمیل بازبینی</p><ul className="list-inside list-disc space-y-1">{review.blockers.map((blocker, i) => <li key={i}>{blocker}</li>)}</ul></div> : null}
                <p className="break-all text-xs text-muted-foreground">شناسه بازبینی: <bdi>{review.run_id}</bdi></p>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border p-4 text-sm leading-7 text-muted-foreground">هنوز نمره بازبینی ارسال نشده است. نمره‌ها هنگام انتشار بسته محلی ثبت می‌شوند.</p>
      )}
    </section>
  );
}
