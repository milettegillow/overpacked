// Per-category clothing quantity floors: at or below the floor, packing is just
// normal packing and should never be flagged as too much. Only quantities above
// the floor are worth comparing. Categories not listed have no floor.
export const CLOTHING_FLOORS: Record<string, number> = {
  Tops: 3,
  Bottoms: 3,
  "Dresses & full-body": 3,
  Bras: 3,
  Knickers: 3,
  Outerwear: 1,
  Knitwear: 1,
  Swimwear: 1,
  Footwear: 2,
};

export function clothingFloor(category: string): number | null {
  return CLOTHING_FLOORS[category] ?? null;
}

// True when a quantity is at or below its category's floor.
export function isWithinFloor(category: string, quantity: number): boolean {
  const floor = clothingFloor(category);
  return floor != null && quantity <= floor;
}
