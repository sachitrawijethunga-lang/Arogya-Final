// Screening flag indices (0-based) that mean high-risk / urgent referral:
// items 1-5 = chest pain, 2-week depression, weight loss, breast lump, non-healing oral lesion.
export const HIGH_RISK_FLAGS = [0, 1, 2, 3, 4];

export function computeTriage(flags) {
  const highRisk = HIGH_RISK_FLAGS.some((i) => flags[i] === true);
  return highRisk ? "high-risk" : "normal";
}
