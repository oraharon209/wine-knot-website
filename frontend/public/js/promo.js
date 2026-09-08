(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WineKnotPromo = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEAL_QTY = 12;

  function cartList(cart) {
    return Object.values(cart || {});
  }

  function roundShekel(value) {
    return Math.round(Number(value) || 0);
  }

  function pickGiftBottles(items, appliedCount, average) {
    if (!appliedCount) return [];
    const pool = [];
    items.forEach(item => {
      const qty = Number(item.quantity || 0);
      const price = roundShekel(item.sale_price);
      for (let i = 0; i < qty; i += 1) {
        pool.push({
          id: item.id,
          name: item.name,
          winery: item.winery || '',
          vintage: item.vintage || '',
          sale_price: price,
        });
      }
    });

    const under = pool.filter(bottle => bottle.sale_price <= average);
    const over = pool.filter(bottle => bottle.sale_price > average);
    under.sort((a, b) => b.sale_price - a.sale_price);
    over.sort((a, b) => a.sale_price - b.sale_price);
    const chosen = under.concat(over).slice(0, appliedCount);

    const grouped = [];
    chosen.forEach(bottle => {
      const last = grouped[grouped.length - 1];
      if (last && last.id === bottle.id && last.sale_price === bottle.sale_price) {
        last.quantity += 1;
        return;
      }
      grouped.push({
        id: bottle.id,
        name: bottle.name,
        winery: bottle.winery,
        vintage: bottle.vintage,
        sale_price: bottle.sale_price,
        quantity: 1,
      });
    });
    return grouped;
  }

  function dealFromCart(cart) {
    const items = cartList(cart);
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const amount = items.reduce((sum, item) => {
      return sum + roundShekel(item.sale_price) * Number(item.quantity || 0);
    }, 0);
    const freeCount = Math.floor(quantity / DEAL_QTY);
    const remainder = quantity % DEAL_QTY;
    const remaining = freeCount && remainder === 0 ? 0 : DEAL_QTY - remainder;
    const giftEach = quantity && freeCount ? roundShekel(amount / quantity) : 0;
    const appliedCount = Math.min(freeCount, remainder);
    const stillToAdd = freeCount - appliedCount;
    const gifts = pickGiftBottles(items, appliedCount, giftEach);
    const discount = gifts.reduce((sum, gift) => sum + gift.sale_price * gift.quantity, 0);
    const payable = amount - discount;
    const addEach = appliedCount ? roundShekel(discount / appliedCount) : giftEach;

    return {
      quantity,
      amount,
      freeCount,
      remaining,
      giftEach,
      addEach,
      appliedCount,
      stillToAdd,
      gifts,
      discount,
      payable,
    };
  }

  return { DEAL_QTY, dealFromCart };
});
