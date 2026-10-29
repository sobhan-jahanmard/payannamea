import { z } from "zod";

export const reviewCriteria = {
  accuracy: { label: "صحت و وفاداری به منابع", max: 5 },
  requirements: { label: "پوشش سفارش", max: 4 },
  reasoning: { label: "فهم علمی و استدلال", max: 4 },
  visual: { label: "خوانایی و طراحی", max: 3 },
  delivery: { label: "ساختار و کیفیت ارائه", max: 2 },
  technical: { label: "کیفیت فنی فایل‌ها", max: 2 },
} as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const localReviewScoreSchema = z.object({
  run_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  report_sha256: sha256,
  reviewed_at: z.string().datetime(),
  status: z.enum(["complete", "incomplete"]),
  score: z.number().finite().min(0).max(20).nullable(),
  summary: z.string().trim().min(1).max(20000),
  rubric: z.array(z.object({
    id: z.enum(["accuracy", "requirements", "reasoning", "visual", "delivery", "technical"]),
    score: z.number().finite().min(0).max(5),
    reason: z.string().trim().min(1).max(10000),
  })).max(6),
  blockers: z.array(z.string().trim().min(1).max(10000)).max(100),
  output_hashes: z.record(z.string().regex(/^final\/[^\\]+$/), sha256),
  matches_delivery: z.boolean(),
}).superRefine((review, context) => {
  if (review.status === "incomplete") {
    if (review.score !== null || review.rubric.length || !review.blockers.length)
      context.addIssue({ code: "custom", message: "Incomplete reviews require blockers, no grade and no rubric" });
    return;
  }
  const ids = new Set(review.rubric.map(row => row.id));
  if (review.score === null || ids.size !== 6 || review.rubric.length !== 6 || review.blockers.length ||
      review.rubric.some(row => row.score > reviewCriteria[row.id].max) ||
      Math.abs(review.rubric.reduce((sum, row) => sum + row.score, 0) - (review.score ?? 0)) > 0.001)
    context.addIssue({ code: "custom", message: "Complete grade must equal all six rubric scores, within their maxima" });
});

export const localReviewScoresSchema = z.object({
  reviews: z.array(localReviewScoreSchema).max(1000),
}).superRefine(({ reviews }, context) => {
  if (new Set(reviews.map(review => review.run_id)).size !== reviews.length)
    context.addIssue({ code: "custom", message: "Duplicate review run IDs" });
});

export type LocalReviewScore = z.infer<typeof localReviewScoreSchema>;
