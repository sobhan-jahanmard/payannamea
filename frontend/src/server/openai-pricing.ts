export type OpenAiTextPricing = {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
  source: string;
  retrievedAt: string;
};

// Snapshot of the standard text-token rates published by OpenAI on 2026-09-11.
// A run stores its own rate snapshot, so later price updates never alter its history.
export const OPENAI_TEXT_PRICING: Record<string, OpenAiTextPricing> = {
  "gpt-6-astra": { inputPerMillionUsd: 10, cachedInputPerMillionUsd: 1, outputPerMillionUsd: 50, source: "https://developers.openai.com/api/docs/models/gpt-6-astra", retrievedAt: "2026-09-11" },
  "gpt-5.6-sol": { inputPerMillionUsd: 4, cachedInputPerMillionUsd: 0.4, outputPerMillionUsd: 20, source: "https://developers.openai.com/api/docs/models/gpt-5.6-sol", retrievedAt: "2026-09-11" },
  "gpt-5.6-terra": { inputPerMillionUsd: 2, cachedInputPerMillionUsd: 0.2, outputPerMillionUsd: 12, source: "https://developers.openai.com/api/docs/models/gpt-5.6-terra", retrievedAt: "2026-09-11" },
  "gpt-5.6-luna": { inputPerMillionUsd: 0.2, cachedInputPerMillionUsd: 0.02, outputPerMillionUsd: 1.2, source: "https://developers.openai.com/api/docs/models/gpt-5.6-luna", retrievedAt: "2026-09-11" }
};

export function estimateOpenAiTextCost(model: string, inputTokens = 0, cachedInputTokens = 0, outputTokens = 0) {
  const pricing = OPENAI_TEXT_PRICING[model];
  if (!pricing) return null;
  const cached = Math.min(Math.max(cachedInputTokens, 0), Math.max(inputTokens, 0));
  const uncached = Math.max(inputTokens - cached, 0);
  const costUsd = (uncached * pricing.inputPerMillionUsd + cached * pricing.cachedInputPerMillionUsd + Math.max(outputTokens, 0) * pricing.outputPerMillionUsd) / 1_000_000;
  return { pricing, costUsd };
}
