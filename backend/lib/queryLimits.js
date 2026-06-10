const SEARCH_MAX_LEN = 64;
const PRICE_MAX_LEN = 10;
const PRICE_MIN = 0;
const PRICE_MAX = 100000;
const RATING_MAX_LEN = 4;
const RATING_MIN = 0;
const RATING_MAX = 100;
const PAGE_LIMIT_MAX = 100;
const OFFSET_MAX = 100000;

function parseSearchParam(raw) {
  if (raw == null || raw === '') return null;
  const value = String(raw).trim().slice(0, SEARCH_MAX_LEN);
  return value || null;
}

function parseMaxPriceParam(raw) {
  if (raw == null || raw === '') return null;
  const value = String(raw).trim();
  if (!value || value.length > PRICE_MAX_LEN) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n) || n < PRICE_MIN || n > PRICE_MAX) return null;
  return n;
}

function parseMinRatingParam(raw) {
  if (raw == null || raw === '') return null;
  const value = String(raw).trim();
  if (!value || value.length > RATING_MAX_LEN) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n) || n < RATING_MIN || n > RATING_MAX) return null;
  return n;
}

function parseLimitParam(raw) {
  if (raw == null || raw === '') return 0;
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 1) return 0;
  return Math.min(n, PAGE_LIMIT_MAX);
}

function parseOffsetParam(raw) {
  if (raw == null || raw === '') return 0;
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(n, OFFSET_MAX);
}

module.exports = {
  SEARCH_MAX_LEN,
  PRICE_MAX_LEN,
  PRICE_MIN,
  PRICE_MAX,
  RATING_MAX_LEN,
  RATING_MIN,
  RATING_MAX,
  PAGE_LIMIT_MAX,
  OFFSET_MAX,
  parseSearchParam,
  parseMaxPriceParam,
  parseMinRatingParam,
  parseLimitParam,
  parseOffsetParam,
};
