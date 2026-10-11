// Single source of truth for the packing-list taxonomy. Import everywhere.
// lib/parse.ts builds its system prompt from these arrays so the model can only
// ever return a category that exists here.

// Clothing categories are quantity-tracked (a count of how many you're taking).
export const CLOTHING_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Dresses & full-body",
  "Outerwear",
  "Knitwear",
  "Base layers / thermals",
  "Socks",
  "Bras",
  "Knickers",
  "Sleepwear / loungewear",
  "Swimwear",
  "Footwear",
  "Accessories",
] as const;

// Non-clothing categories are presence-based (you either have the item or not).
export const NON_CLOTHING_CATEGORIES = [
  "Toiletries",
  "Skincare & beauty",
  "Sun & bug protection",
  "Health & medication",
  "Sleep & comfort",
  "Electronics & tech",
  "Documents & money",
  "Books & journals",
  "Games & entertainment",
  "Outdoor & hiking gear",
  "Food & drink",
  "Bags & luggage",
  "Other",
] as const;

export const ALL_CATEGORIES = [
  ...CLOTHING_CATEGORIES,
  ...NON_CLOTHING_CATEGORIES,
] as const;

export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];
export type NonClothingCategory = (typeof NON_CLOTHING_CATEGORIES)[number];
export type Category = ClothingCategory | NonClothingCategory;

export function isClothingCategory(category: string): boolean {
  return (CLOTHING_CATEGORIES as readonly string[]).includes(category);
}
