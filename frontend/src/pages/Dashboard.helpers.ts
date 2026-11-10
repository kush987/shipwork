/** 0.973 → "97.3%"; whole numbers for 0 and 1 ("0%", "100%"). */
export const formatSuccessRate = (rate: number) => `${(rate * 100).toFixed(rate === 1 || rate === 0 ? 0 : 1)}%`;
