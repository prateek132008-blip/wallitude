/**
 * Wallitude Cart System
 * Manages cart state via localStorage with event-driven UI updates
 */

const Cart = (() => {
  const STORAGE_KEY = 'wallitude_cart';

  // ─── Read / Write ───────────────────────────────────────────
  function getItems() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    dispatchUpdate();
  }

  function dispatchUpdate() {
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: getItems() }));
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Add an item to the cart
   * @param {Object} item - { id, layout, size, price, text, previewDataUrl, images[] }
   */
  function addItem(item) {
    const items = getItems();
    item.cartId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    item.addedAt = new Date().toISOString();
    items.push(item);
    saveItems(items);
    return item.cartId;
  }

  function removeItem(cartId) {
    const items = getItems().filter(i => i.cartId !== cartId);
    saveItems(items);
  }

  function clearCart() {
    saveItems([]);
  }

  function getCount() {
    return getItems().length;
  }

  function getTotal() {
    return getItems().reduce((sum, i) => sum + (i.price || 0), 0);
  }

  // ─── Header badge helper ─────────────────────────────────────
  function updateBadges() {
    const count = getCount();
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  // Initialise badges on load and on updates
  window.addEventListener('DOMContentLoaded', updateBadges);
  window.addEventListener('cart:updated', updateBadges);

  return { getItems, addItem, removeItem, clearCart, getCount, getTotal };
})();
