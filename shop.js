// Stable item IDs also identify purchases in saved progress.
export const shopItems = [
  { id: 'chapter-models', chapterId: 'models', price: 200 },
  { id: 'chapter-results', chapterId: 'results', price: 300 }
];

export function hasChapterPass(state, chapterId) {
  const item = shopItems.find(item => item.chapterId === chapterId);
  return Boolean(item && state.purchases?.some(purchase => purchase.itemId === item.id));
}

export function normalizePurchases(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter(purchase => {
    if (!purchase || !shopItems.some(item => item.id === purchase.itemId) || seen.has(purchase.itemId)) return false;
    if (!Number.isSafeInteger(purchase.price) || purchase.price < 0 || !Number.isFinite(purchase.purchasedAt) || purchase.purchasedAt <= 0) return false;
    seen.add(purchase.itemId);
    return true;
  }).map(({ itemId, price, purchasedAt }) => ({ itemId, price, purchasedAt }));
}
