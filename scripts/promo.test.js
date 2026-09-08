const test = require('node:test');
const assert = require('node:assert/strict');
const { dealFromCart } = require('../frontend/public/js/promo.js');

test('12 bottles earn 1 extra gift without deducting a bottle already in the cart', () => {
  const deal = dealFromCart({
    a: { id: 'a', name: 'יין זול', quantity: 7, sale_price: 50 },
    b: { id: 'b', name: 'יין יקר', quantity: 5, sale_price: 70 },
  });
  assert.equal(deal.quantity, 12);
  assert.equal(deal.amount, 700);
  assert.equal(deal.freeCount, 1);
  assert.equal(deal.giftEach, 58);
  assert.equal(deal.appliedCount, 0);
  assert.equal(deal.stillToAdd, 1);
  assert.deepEqual(deal.gifts, []);
  assert.equal(deal.payable, 700);
});

test('11 bottles do not earn a gift', () => {
  const deal = dealFromCart({
    a: { quantity: 5, sale_price: 40 },
    b: { quantity: 6, sale_price: 60 },
  });
  assert.equal(deal.freeCount, 0);
  assert.equal(deal.giftEach, 0);
  assert.equal(deal.remaining, 1);
  assert.equal(deal.appliedCount, 0);
  assert.equal(deal.stillToAdd, 0);
});

test('24 bottles earn 2 extra gift bottles without discounting the cart', () => {
  const deal = dealFromCart({
    a: { quantity: 12, sale_price: 100 },
    b: { quantity: 12, sale_price: 120 },
  });
  assert.equal(deal.quantity, 24);
  assert.equal(deal.amount, 2640);
  assert.equal(deal.freeCount, 2);
  assert.equal(deal.giftEach, 110);
  assert.equal(deal.appliedCount, 0);
  assert.equal(deal.stillToAdd, 2);
  assert.deepEqual(deal.gifts, []);
  assert.equal(deal.payable, 2640);
});

test('a 13th bottle over the average marks a cheaper bottle as free', () => {
  const deal = dealFromCart({
    a: { id: 'a', name: 'קברנה כרם בן זמרה', quantity: 12, sale_price: 85 },
    b: { id: 'b', name: 'אדיר a חדש 2022', quantity: 1, sale_price: 100 },
  });
  assert.equal(deal.quantity, 13);
  assert.equal(deal.amount, 1120);
  assert.equal(deal.freeCount, 1);
  assert.equal(deal.appliedCount, 1);
  assert.equal(deal.stillToAdd, 0);
  assert.equal(deal.gifts.length, 1);
  assert.equal(deal.gifts[0].name, 'קברנה כרם בן זמרה');
  assert.equal(deal.gifts[0].sale_price, 85);
  assert.equal(deal.gifts[0].quantity, 1);
  assert.equal(deal.discount, 85);
  assert.equal(deal.payable, 1035);
});

test('a 13th bottle at or under the average is itself the gift', () => {
  const deal = dealFromCart({
    a: { id: 'a', name: 'יקר', quantity: 12, sale_price: 100 },
    b: { id: 'b', name: 'זול', quantity: 1, sale_price: 50 },
  });
  assert.equal(deal.gifts[0].name, 'זול');
  assert.equal(deal.gifts[0].sale_price, 50);
  assert.equal(deal.payable, 1200);
});

test('36 bottles earn 3 extras with no deduction until extras are in the cart', () => {
  const deal = dealFromCart({
    cheap: { id: 'cheap', name: 'זול', quantity: 20, sale_price: 40 },
    pricey: { id: 'pricey', name: 'יקר', quantity: 16, sale_price: 200 },
  });
  assert.equal(deal.quantity, 36);
  assert.equal(deal.amount, 4000);
  assert.equal(deal.freeCount, 3);
  assert.equal(deal.appliedCount, 0);
  assert.equal(deal.stillToAdd, 3);
  assert.deepEqual(deal.gifts, []);
  assert.equal(deal.payable, 4000);
});

test('37 mixed bottles deduct one cheaper bottle and leave two extras to add', () => {
  const deal = dealFromCart({
    cheap: { id: 'cheap', name: 'זול', quantity: 21, sale_price: 40 },
    pricey: { id: 'pricey', name: 'יקר', quantity: 16, sale_price: 200 },
  });
  assert.equal(deal.quantity, 37);
  assert.equal(deal.freeCount, 3);
  assert.equal(deal.appliedCount, 1);
  assert.equal(deal.stillToAdd, 2);
  assert.equal(deal.gifts[0].name, 'זול');
  assert.equal(deal.gifts[0].sale_price, 40);
  assert.equal(deal.payable, deal.amount - 40);
});

test('39 mixed bottles deduct three cheaper bottles and none left to add', () => {
  const deal = dealFromCart({
    cheap: { id: 'cheap', name: 'זול', quantity: 23, sale_price: 40 },
    pricey: { id: 'pricey', name: 'יקר', quantity: 16, sale_price: 200 },
  });
  assert.equal(deal.quantity, 39);
  assert.equal(deal.appliedCount, 3);
  assert.equal(deal.stillToAdd, 0);
  assert.equal(deal.gifts[0].name, 'זול');
  assert.equal(deal.gifts[0].quantity, 3);
  assert.equal(deal.discount, 120);
  assert.equal(deal.payable, deal.amount - 120);
});

test('two extras over the average deduct two cheaper bottles already in the cart', () => {
  const deal = dealFromCart({
    cheap: { id: 'cheap', name: 'זול', quantity: 12, sale_price: 50 },
    pricey: { id: 'pricey', name: 'יקר', quantity: 12, sale_price: 150 },
    extra: { id: 'extra', name: 'יקר נוסף', quantity: 2, sale_price: 200 },
  });
  assert.equal(deal.quantity, 26);
  assert.equal(deal.freeCount, 2);
  assert.equal(deal.appliedCount, 2);
  assert.equal(deal.stillToAdd, 0);
  assert.equal(deal.gifts[0].name, 'זול');
  assert.equal(deal.gifts[0].quantity, 2);
  assert.equal(deal.discount, 100);
  assert.equal(deal.payable, deal.amount - 100);
});

test('25 bottles with a dear extra name the ₪85 bottle and do not quote ₪86 for the remaining gift', () => {
  const deal = dealFromCart({
    a: { id: 'a', name: 'קברנה כרם בן זמרה', quantity: 24, sale_price: 85 },
    b: { id: 'b', name: 'אדיר a חדש 2022', quantity: 1, sale_price: 100 },
  });
  assert.equal(deal.quantity, 25);
  assert.equal(deal.amount, 2140);
  assert.equal(deal.freeCount, 2);
  assert.equal(deal.appliedCount, 1);
  assert.equal(deal.stillToAdd, 1);
  assert.equal(deal.gifts[0].name, 'קברנה כרם בן זמרה');
  assert.equal(deal.gifts[0].sale_price, 85);
  assert.equal(deal.discount, 85);
  assert.equal(deal.addEach, 85);
});

test('two extras under the average are themselves the free bottles', () => {
  const deal = dealFromCart({
    cheap: { id: 'cheap', name: 'זול', quantity: 12, sale_price: 50 },
    pricey: { id: 'pricey', name: 'יקר', quantity: 12, sale_price: 150 },
    extra: { id: 'extra', name: 'בינוני', quantity: 2, sale_price: 80 },
  });
  assert.equal(deal.gifts[0].name, 'בינוני');
  assert.equal(deal.gifts[0].quantity, 2);
  assert.equal(deal.gifts[0].sale_price, 80);
  assert.equal(deal.payable, deal.amount - 160);
});
