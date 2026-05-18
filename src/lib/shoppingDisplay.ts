/** Default when the user leaves quantity blank. */
export const DEFAULT_SHOPPING_QUANTITY = '1'

/** What we show in lists, widgets, and home previews. */
export function displayQuantity(quantity: string | null | undefined): string {
  const trimmed = quantity?.trim()
  return trimmed || DEFAULT_SHOPPING_QUANTITY
}

/** What we persist — never store null/empty. */
export function normalizeQuantity(quantity: string | null | undefined): string {
  return displayQuantity(quantity)
}
