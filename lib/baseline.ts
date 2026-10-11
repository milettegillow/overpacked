// Universal items that almost everyone packs on almost every trip. Useful for
// treating these as unremarkable (e.g. never flagging them as an outlier) while
// still letting them behave like normal items everywhere else.
export const BASELINE_ITEMS = [
  "toothbrush",
  "toothpaste",
  "deodorant",
  "shampoo",
  "conditioner",
  "hairbrush",
  "comb",
  "razor",
  "floss",
  "face wash",
  "moisturiser",
  "contact lenses",
  "contact lens solution",
  "glasses",
  "paracetamol",
  "painkillers",
  "prescription medication",
  "plasters",
  "hand sanitiser",
  "period products",
  "tampons",
  "pads",
  "phone",
  "phone charger",
  "laptop",
  "laptop charger",
  "charger",
  "macbook",
  "computer",
  "adapter",
  "travel adapter",
  "plug adapter",
  "wallet",
  "purse",
  "keys",
  "headphones",
  "earphones",
  "passport",
  "bank card",
  "debit card",
] as const;

// Lenient, case-insensitive, partial match: "toothbrush" matches
// "electric toothbrush".
export function isBaselineItem(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return BASELINE_ITEMS.some((baseline) => n.includes(baseline));
}
