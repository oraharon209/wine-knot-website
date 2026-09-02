/* Wine Knot storefront — catalog, discovery, product route, cart and WhatsApp order.
   Plain ES2020, no dependencies. Data comes from the Express API; nothing here is hard-coded catalog content. */
(() => {
  'use strict';

  const API = '/api';
  const CONTACT = { phone: '050-8496666', whatsapp: '972508496666', email: 'doronchick@gmail.com' };
  const CART_KEY = 'wineknot_cart';
  const AGE_KEY = 'wineknot_age_verified';
  const VIEW_KEY = 'wineknot_view';
  const PAGE_SIZE = 24;
  const SEARCH_MAX_LEN = 64;
  const PRICE_MAX = 100000;
  const PRICE_BANDS = [
    { value: '0-80', label: 'עד ₪80', min: 0, max: 80 },
    { value: '80-130', label: '₪80–130', min: 80, max: 130 },
    { value: '130-200', label: '₪130–200', min: 130, max: 200 },
    { value: '200-', label: 'מעל ₪200', min: 200, max: null },
  ];
  const SORTS = {
    price_asc: (a, b) => a.sale_price - b.sale_price || cmpName(a, b),
    price_desc: (a, b) => b.sale_price - a.sale_price || cmpName(a, b),
    rating_desc: (a, b) => b.rating - a.rating || a.sale_price - b.sale_price,
    name_asc: cmpName,
  };

  const state = {
    categories: [],
    wines: [],
    byId: new Map(),
    recommended: [],
    recommendedIds: new Set(),
    filters: { category: '', winery: '', price: '', min_price: '', max_price: '', min_rating: '', vintage: '', search: '', sort: 'price_asc' },
    view: 'grid',
    shown: PAGE_SIZE,
    route: { name: 'home', id: null },
    cart: loadCart(),
    catalogLoaded: false,
    homeScrollY: 0,
  };

  const $ = (id) => document.getElementById(id);
  const collator = new Intl.Collator('he');

  /* ---------------------------------------------------------------- utils */
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clean(s) {
    return String(s ?? '').replace(/\s+/g, ' ').replace(/[\s,\-–]+$/, '').trim();
  }
  function cmpName(a, b) {
    return collator.compare(clean(a.name), clean(b.name));
  }
  function safeImageUrl(url) {
    const u = String(url || '').trim();
    return /^(\/images\/wines\/|https?:\/\/)/.test(u) ? u : '';
  }
  function fmtPrice(amount) {
    return '₪' + Number(amount).toLocaleString('he-IL', { maximumFractionDigits: 0 });
  }
  function discountPct(shelf, sale) {
    shelf = Number(shelf); sale = Number(sale);
    if (!shelf || shelf <= sale) return 0;
    return Math.round((1 - sale / shelf) * 100);
  }
  function freeBottles(qty) {
    return Math.floor(qty / 12);
  }
  function bottles(n) {
    return n === 1 ? 'בקבוק אחד' : `${n} בקבוקים`;
  }
  function winesWord(n) {
    return n === 1 ? 'יין אחד' : `${n} יינות`;
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function icon(name, cls = 'icon') {
    return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }
  function sanitizePrice(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > 10) return '';
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0 || n > PRICE_MAX) return '';
    return String(n);
  }
  function categoryName(slug) {
    const c = state.categories.find((x) => x.slug === slug);
    return c ? c.name_he : slug;
  }
  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  /* ---------------------------------------------------------------- cart */
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
  }
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    updateCartBadge(true);
    renderCart();
  }
  function cartItems() { return Object.values(state.cart); }
  function cartCount() { return cartItems().reduce((s, i) => s + i.quantity, 0); }
  function cartTotal() { return cartItems().reduce((s, i) => s + i.sale_price * i.quantity, 0); }
  function cartGifts() { return cartItems().reduce((s, i) => s + freeBottles(i.quantity), 0); }

  function addToCart(wine, qty = 1) {
    const id = String(wine.id);
    if (state.cart[id]) state.cart[id].quantity += qty;
    else {
      state.cart[id] = {
        id: wine.id,
        name: clean(wine.name),
        sale_price: Number(wine.sale_price),
        winery: clean(wine.winery || ''),
        vintage: clean(wine.vintage || ''),
        quantity: qty,
      };
    }
    saveCart();
    const free = freeBottles(state.cart[id].quantity);
    const head = qty === 1 ? 'נוסף לעגלה' : `נוספו ${qty} בקבוקים לעגלה`;
    showToast(`${head}${free ? ` · כולל ${free === 1 ? 'בקבוק מתנה' : `${free} בקבוקי מתנה`}` : ''}`, { action: 'לעגלה', onAction: openCart });
  }
  function setCartQuantity(id, qty) {
    id = String(id);
    if (!state.cart[id]) return;
    if (qty <= 0) delete state.cart[id];
    else state.cart[id].quantity = qty;
    saveCart();
  }

  function updateCartBadge(bump = false) {
    const badge = $('cartBadge');
    const count = cartCount();
    badge.textContent = count;
    badge.dataset.count = count;
    badge.setAttribute('aria-label', count ? `${bottles(count)} בעגלה` : 'העגלה ריקה');
    if (bump && count) {
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }
  }

  function cartWineLabel(item) {
    const name = clean(item.name);
    const vintage = clean(item.vintage || '');
    if (!vintage || new RegExp(`\\b${vintage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(name)) return name;
    return `${name} · ${vintage}`;
  }

  function buildWhatsAppMessage() {
    const items = cartItems();
    if (!items.length) return '';
    const lines = ['שלום Wine Knot,', '', 'להלן ההזמנה שלי:', ''];
    let totalFree = 0;
    let totalQty = 0;
    items.forEach((item) => {
      const free = freeBottles(item.quantity);
      totalFree += free;
      totalQty += item.quantity;
      lines.push(cartWineLabel(item));
      if (item.winery) lines.push(`מיקב: ${item.winery}`);
      const qtyText = free
        ? `${item.quantity} בקבוקים (+${free} מתנה = ${item.quantity + free} סה"כ)`
        : bottles(item.quantity);
      lines.push(`   ${qtyText} · ${fmtPrice(item.sale_price * item.quantity)}`);
      if (free) {
        const giftLabel = free === 1 ? 'בקבוק מתנה' : `${free} בקבוקי מתנה`;
        lines.push(`   🎁 ${giftLabel} בשווי ${fmtPrice(Math.round(item.sale_price))}${free > 1 ? ' כל אחד' : ''}`);
      }
      lines.push('');
    });
    lines.push('──────────────');
    lines.push(`סה״כ לתשלום: ${fmtPrice(cartTotal())}`);
    if (totalFree) {
      const avg = totalQty ? Math.round(cartTotal() / totalQty) : 0;
      lines.push(`🎁 סה"כ ${totalFree} בקבוקי מתנה (שווי ממוצע ${fmtPrice(avg)} לבקבוק)`);
    }
    const note = clean($('orderNote').value).slice(0, 300);
    if (note) {
      lines.push('');
      lines.push(`הערה: ${note}`);
    }
    lines.push('');
    lines.push('תודה!');
    return lines.join('\n');
  }

  function renderCart() {
    const items = cartItems();
    const body = $('cartItems');
    const foot = $('cartFooter');
    const waBtn = $('cartWhatsAppBtn');
    if (!items.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <h3>העגלה ריקה</h3>
          <p>מתחילים מההמלצות של דורון, או מחפשים בקבוק ספציפי.</p>
          <a class="btn btn-secondary" href="/#picks" data-close-cart>להמלצות של דורון</a>
        </div>`;
      foot.hidden = true;
      waBtn.disabled = true;
      return;
    }
    foot.hidden = false;
    waBtn.disabled = false;
    body.innerHTML = items.map((item) => {
      const free = freeBottles(item.quantity);
      const meta = [item.winery, item.vintage].filter(Boolean).map(esc).join(' · ');
      return `
        <div class="cart-line" data-id="${esc(item.id)}">
          <div>
            <div class="cart-line-name"><a href="/wine/${esc(item.id)}" data-close-cart>${esc(item.name)}</a></div>
            ${meta ? `<div class="cart-line-meta">${meta}</div>` : ''}
          </div>
          <div class="cart-line-total num">${fmtPrice(item.sale_price * item.quantity)}</div>
          <div class="cart-line-ctl">
            <div class="qty qty-sm" role="group" aria-label="כמות עבור ${esc(item.name)}">
              <button type="button" data-action="dec" aria-label="פחות בקבוק אחד">${icon('minus')}</button>
              <span aria-live="polite">${item.quantity}</span>
              <button type="button" data-action="inc" aria-label="עוד בקבוק אחד">${icon('plus')}</button>
            </div>
            ${free ? `<span class="cart-line-gift">כולל ${free === 1 ? 'בקבוק מתנה' : `${free} בקבוקי מתנה`}</span>` : ''}
            <button type="button" class="cart-remove" data-action="remove">הסרה</button>
          </div>
        </div>`;
    }).join('');

    const gifts = cartGifts();
    $('cartSummary').innerHTML = `
      <div><span>בקבוקים</span><span class="num">${cartCount()}</span></div>
      ${gifts ? `<div class="gift"><span>בקבוקי מתנה (<span class="ltr">12 + 1</span>)</span><span class="num ltr">+${gifts}</span></div>` : ''}
      <div class="total"><span>סה״כ לתשלום</span><span class="num">${fmtPrice(cartTotal())}</span></div>`;
  }

  /* ---------------------------------------------------------------- dialogs */
  let lastFocus = null;
  let releaseTrap = null;
  function focusables(container) {
    return [...container.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
  }
  function trapFocus(container) {
    if (releaseTrap) releaseTrap();
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const els = focusables(container);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener('keydown', onKey);
    releaseTrap = () => { container.removeEventListener('keydown', onKey); releaseTrap = null; };
  }
  function restoreFocus() {
    if (releaseTrap) releaseTrap();
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
  }
  function openDrawer(overlayId, drawerId, triggerId, closeId) {
    lastFocus = document.activeElement;
    $(overlayId).classList.add('open');
    $(triggerId).setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    trapFocus($(drawerId));
    $(closeId).focus();
  }
  function closeDrawer(overlayId, triggerId) {
    $(overlayId).classList.remove('open');
    $(triggerId).setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    restoreFocus();
  }
  const openCart = () => { hideToast(); renderCart(); openDrawer('cartOverlay', 'cartDrawer', 'cartBtn', 'cartClose'); };
  const closeCart = () => closeDrawer('cartOverlay', 'cartBtn');
  const openMenu = () => openDrawer('menuOverlay', 'menuDrawer', 'menuBtn', 'menuClose');
  const closeMenu = () => closeDrawer('menuOverlay', 'menuBtn');

  let toastTimer;
  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').classList.remove('show');
  }
  function showToast(text, { action, onAction } = {}) {
    const el = $('toast');
    el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
    if (action) el.querySelector('.toast-action').addEventListener('click', () => { el.classList.remove('show'); onAction(); });
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------------------------------------------------------------- data */
  async function loadCategories() {
    state.categories = await fetchJSON(`${API}/categories`);
  }
  async function loadWines() {
    const data = await fetchJSON(`${API}/wines`);
    state.wines = (Array.isArray(data) ? data : data.wines || []).map(normalize);
    state.byId = new Map(state.wines.map((w) => [String(w.id), w]));
    state.catalogLoaded = true;
  }
  async function loadRecommended() {
    try {
      const rows = await fetchJSON(`${API}/wines/recommended`);
      state.recommended = rows.map(normalize);
      state.recommendedIds = new Set(state.recommended.map((w) => String(w.id)));
      state.recommended.forEach((w) => { if (!state.byId.has(String(w.id))) state.byId.set(String(w.id), w); });
    } catch {
      state.recommended = [];
    }
  }
  async function fetchWine(id) {
    const cached = state.byId.get(String(id));
    if (cached) return cached;
    const w = normalize(await fetchJSON(`${API}/wines/${encodeURIComponent(id)}`));
    state.byId.set(String(w.id), w);
    return w;
  }
  function normalize(w) {
    return {
      ...w,
      name: clean(w.name),
      winery: clean(w.winery),
      vintage: clean(w.vintage),
      notes: clean(w.notes),
      country: clean(w.country),
      sale_price: Number(w.sale_price),
      shelf_price: Number(w.shelf_price),
      rating: Number(w.rating),
      out_of_stock: !!Number(w.out_of_stock),
    };
  }

  /* ---------------------------------------------------------------- filters */
  function activeBand() {
    return PRICE_BANDS.find((b) => b.value === state.filters.price) || null;
  }
  function priceRange() {
    const band = activeBand();
    if (band) return { min: band.min, max: band.max, exclusiveMax: true };
    const min = state.filters.min_price !== '' ? Number(state.filters.min_price) : null;
    const max = state.filters.max_price !== '' ? Number(state.filters.max_price) : null;
    if (min == null && max == null) return null;
    return { min, max, exclusiveMax: false };
  }
  function matches(w, f = state.filters, { ignore = [] } = {}) {
    if (!ignore.includes('category') && f.category && w.category !== f.category) return false;
    if (!ignore.includes('winery') && f.winery && w.winery !== f.winery) return false;
    if (!ignore.includes('vintage') && f.vintage && w.vintage !== f.vintage) return false;
    if (!ignore.includes('min_rating') && f.min_rating && w.rating < Number(f.min_rating)) return false;
    if (!ignore.includes('price')) {
      const r = priceRange();
      if (r) {
        if (r.min != null && w.sale_price < r.min) return false;
        if (r.max != null && (r.exclusiveMax ? w.sale_price >= r.max : w.sale_price > r.max)) return false;
      }
    }
    if (!ignore.includes('search') && f.search) {
      const q = f.search.toLowerCase();
      const hay = [w.name, w.winery, w.notes, w.country, w.grape, w.vintage, w.category_he].map((v) => String(v || '').toLowerCase());
      if (!hay.some((h) => h.includes(q))) return false;
    }
    return true;
  }
  function filteredWines() {
    return state.wines.filter((w) => matches(w)).sort(SORTS[state.filters.sort] || SORTS.price_asc);
  }
  function hasActiveFilters() {
    const f = state.filters;
    return !!(f.category || f.winery || f.price || f.min_price || f.max_price || f.min_rating || f.vintage || f.search);
  }
  function resetFilters({ keepSort = true } = {}) {
    const sort = state.filters.sort;
    state.filters = { category: '', winery: '', price: '', min_price: '', max_price: '', min_rating: '', vintage: '', search: '', sort: keepSort ? sort : 'price_asc' };
  }
  function setFilters(patch, { scroll = false, replace = false } = {}) {
    Object.assign(state.filters, patch);
    if ('price' in patch && patch.price) { state.filters.min_price = ''; state.filters.max_price = ''; }
    state.shown = PAGE_SIZE;
    syncControls();
    renderCatalog();
    renderShelves();
    syncUrl(replace);
    if (scroll) scrollToCatalog();
  }
  function scrollToCatalog() {
    const el = $('catalog');
    if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-no-motion');
  }

  function readUrl() {
    const url = new URL(location.href);
    const m = url.pathname.match(/^\/wine\/(\d+)\/?$/);
    if (m) { state.route = { name: 'product', id: m[1] }; } else { state.route = { name: 'home', id: null }; }
    const p = url.searchParams;
    resetFilters({ keepSort: false });
    const f = state.filters;
    f.category = p.get('category') || '';
    f.winery = clean(p.get('winery') || '');
    f.vintage = clean(p.get('vintage') || '');
    f.search = clean(p.get('search') || '').slice(0, SEARCH_MAX_LEN);
    const band = p.get('price');
    if (band && PRICE_BANDS.some((b) => b.value === band)) f.price = band;
    f.min_price = sanitizePrice(p.get('min_price'));
    f.max_price = sanitizePrice(p.get('max_price'));
    const rating = p.get('min_rating');
    if (rating && ['90', '93', '95'].includes(rating)) f.min_rating = rating;
    const sort = p.get('sort');
    if (sort && SORTS[sort]) f.sort = sort;
    const view = p.get('view') || localStorage.getItem(VIEW_KEY);
    state.view = view === 'list' ? 'list' : 'grid';
  }
  function buildQuery() {
    const f = state.filters;
    const p = new URLSearchParams();
    if (f.category) p.set('category', f.category);
    if (f.winery) p.set('winery', f.winery);
    if (f.price) p.set('price', f.price);
    if (!f.price && f.min_price) p.set('min_price', f.min_price);
    if (!f.price && f.max_price) p.set('max_price', f.max_price);
    if (f.min_rating) p.set('min_rating', f.min_rating);
    if (f.vintage) p.set('vintage', f.vintage);
    if (f.search) p.set('search', f.search);
    if (f.sort !== 'price_asc') p.set('sort', f.sort);
    if (state.view === 'list') p.set('view', 'list');
    return p.toString();
  }
  function syncUrl(replace = true) {
    if (state.route.name !== 'home') return;
    const qs = buildQuery();
    const url = qs ? `/?${qs}` : '/';
    const current = location.pathname + location.search;
    if (current === url) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  function categoryHref(slug) {
    return slug ? `/?category=${encodeURIComponent(slug)}` : '/';
  }

  /* ---------------------------------------------------------------- render: navigation */
  function renderShelves() {
    const active = state.route.name === 'home' ? state.filters.category : '';
    const link = (slug, label, count) => `<a class="shelf" href="${categoryHref(slug)}" data-cat="${esc(slug)}"${active === slug ? ' aria-current="true"' : ''}>${esc(label)}${count != null ? ` <span class="count num">${count}</span>` : ''}</a>`;
    $('shelves').innerHTML = link('', 'הכל', state.wines.length || null) + state.categories.map((c) => link(c.slug, c.name_he, stockCount(c.slug))).join('');
    $('menuShelves').innerHTML = `<a href="/" data-cat="" data-close-menu${active === '' ? ' aria-current="true"' : ''}>הכל<span class="count num">${state.wines.length}</span></a>` +
      state.categories.map((c) => `<a href="${categoryHref(c.slug)}" data-cat="${esc(c.slug)}" data-close-menu${active === c.slug ? ' aria-current="true"' : ''}>${esc(c.name_he)}<span class="count num">${stockCount(c.slug)}</span></a>`).join('');
    $('footerShelves').innerHTML = state.categories.map((c) => `<li><a href="${categoryHref(c.slug)}" data-cat="${esc(c.slug)}">${esc(c.name_he)}</a></li>`).join('');
  }
  function stockCount(slug) {
    return state.wines.filter((w) => w.category === slug).length;
  }

  function renderStart() {
    $('startScores').innerHTML = ['95', '93', '90'].map((min) => {
      const n = state.wines.filter((w) => w.rating >= Number(min)).length;
      return n ? `<a href="/?min_rating=${min}" data-rating="${min}"><span>${min} ומעלה</span><span class="count num">${n}</span></a>` : '';
    }).join('') + `<a class="more" href="/?sort=rating_desc" data-sort="rating_desc">כל היינות לפי ציון</a>`;

    $('startBudget').innerHTML = PRICE_BANDS.map((b) => {
      const n = state.wines.filter((w) => w.sale_price >= b.min && (b.max == null || w.sale_price < b.max)).length;
      return n ? `<a href="/?price=${b.value}" data-price="${b.value}"><span class="ltr">${esc(b.label)}</span><span class="count num">${n}</span></a>` : '';
    }).join('');

    const counts = new Map();
    state.wines.forEach((w) => { if (w.winery) counts.set(w.winery, (counts.get(w.winery) || 0) + 1); });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0])).slice(0, 6);
    $('startWineries').innerHTML = top.map(([name, n]) => `<a href="/?winery=${encodeURIComponent(name)}" data-winery="${esc(name)}"><span>${esc(name)}</span><span class="count num">${n}</span></a>`).join('') +
      `<a class="more" href="#fWinery" data-focus="fWinery">כל ${counts.size} היקבים</a>`;
  }

  function populateSelects() {
    const cat = $('fCategory');
    cat.innerHTML = '<option value="">כל הסוגים</option>' + state.categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.name_he)} (${stockCount(c.slug)})</option>`).join('');

    const counts = new Map();
    state.wines.forEach((w) => { if (w.winery) counts.set(w.winery, (counts.get(w.winery) || 0) + 1); });
    const wineries = [...counts.keys()].sort(collator.compare);
    $('fWinery').innerHTML = '<option value="">כל היקבים</option>' + wineries.map((n) => `<option value="${esc(n)}">${esc(n)} (${counts.get(n)})</option>`).join('');

    $('fPrice').innerHTML = '<option value="">כל מחיר</option>' + PRICE_BANDS.map((b) => `<option value="${b.value}">${esc(b.label)}</option>`).join('') +
      '<option value="custom" hidden>טווח מותאם</option>';

    const vintages = [...new Set(state.wines.map((w) => w.vintage).filter((v) => /^\d{4}$/.test(v)))].sort((a, b) => b.localeCompare(a));
    $('fVintage').innerHTML = '<option value="">כל בציר</option>' + vintages.map((v) => `<option value="${v}">${v}</option>`).join('');
  }

  function syncControls() {
    const f = state.filters;
    ['search', 'searchDesktop', 'searchMobile'].forEach((id) => { if ($(id).value !== f.search) $(id).value = f.search; });
    $('fCategory').value = f.category;
    $('fWinery').value = wineryOptionExists(f.winery) ? f.winery : '';
    const priceSel = $('fPrice');
    const customOpt = priceSel.querySelector('[value=custom]');
    if (f.price) { priceSel.value = f.price; if (customOpt) customOpt.hidden = true; }
    else if (f.min_price || f.max_price) { if (customOpt) customOpt.hidden = false; priceSel.value = 'custom'; }
    else { priceSel.value = ''; if (customOpt) customOpt.hidden = true; }
    $('fScore').value = f.min_rating;
    $('fVintage').value = f.vintage;
    $('sort').value = f.sort;
    $('viewGrid').setAttribute('aria-pressed', String(state.view === 'grid'));
    $('viewList').setAttribute('aria-pressed', String(state.view === 'list'));
  }
  function wineryOptionExists(name) {
    return !!name && [...$('fWinery').options].some((o) => o.value === name);
  }

  const wideQuery = window.matchMedia('(min-width: 768px)');
  function syncFilterDisclosure() {
    const details = $('filterDetails');
    const f = state.filters;
    const n = [f.category, f.winery, f.price || f.min_price || f.max_price, f.min_rating, f.vintage].filter(Boolean).length;
    $('filterCount').textContent = n ? `(${n})` : '';
    if (wideQuery.matches) details.open = true;
    else if (n && !details.dataset.userToggled) details.open = true;
  }

  function renderActiveFilters() {
    syncFilterDisclosure();
    const f = state.filters;
    const chips = [];
    const chip = (key, label) => `<button type="button" class="chip" data-clear="${key}" aria-label="הסרת הסינון ${esc(label)}">${esc(label)} ${icon('close')}</button>`;
    if (f.category) chips.push(chip('category', categoryName(f.category)));
    if (f.winery) chips.push(chip('winery', f.winery));
    if (f.price) chips.push(chip('price', activeBand().label));
    else if (f.min_price || f.max_price) chips.push(chip('customprice', `${f.min_price ? `מ־${fmtPrice(f.min_price)}` : ''} ${f.max_price ? `עד ${fmtPrice(f.max_price)}` : ''}`.trim()));
    if (f.min_rating) chips.push(chip('min_rating', `ציון ${f.min_rating}+`));
    if (f.vintage) chips.push(chip('vintage', `בציר ${f.vintage}`));
    if (f.search) chips.push(chip('search', `„${f.search}”`));
    if (chips.length > 1) chips.push('<button type="button" class="btn btn-text btn-sm" data-clear="all">ניקוי הכל</button>');
    $('activeFilters').innerHTML = chips.join('');
  }

  /* ---------------------------------------------------------------- render: wines */
  function imgHtml(w, { eager = false, alt = '' } = {}) {
    const src = safeImageUrl(w.image_url);
    if (!src) return '<span class="no-img">תמונה בקרוב</span>';
    return `<img src="${esc(src)}" alt="${esc(alt)}" width="600" height="900" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}>`;
  }
  function scoreHtml(w, large = false) {
    if (!w.rating) return '';
    return `<span class="score${large ? ' score-lg' : ''}" role="img" aria-label="ציון Wine Knot ${w.rating}"><span class="score-n">${w.rating}</span><span class="score-l">${large ? 'ציון Wine Knot' : 'ציון'}</span></span>`;
  }
  function priceHtml(w, cls = 'price') {
    const disc = discountPct(w.shelf_price, w.sale_price);
    return `<div class="${cls}"><span class="price-now num">${fmtPrice(w.sale_price)}</span>${disc ? `<s class="price-was num" aria-label="מחיר מדף ${fmtPrice(w.shelf_price)}">${fmtPrice(w.shelf_price)}</s>` : ''}</div>`;
  }
  function metaParts(w) {
    return [w.winery, w.vintage].filter(Boolean);
  }
  function cardHtml(w, { eager = false } = {}) {
    const rec = state.recommendedIds.has(String(w.id));
    return `
      <article class="card" data-id="${esc(w.id)}">
        <div class="card-media">
          ${imgHtml(w, { eager })}
          ${rec ? `<span class="knot">${icon('knot')}מומלץ</span>` : ''}
          ${w.out_of_stock ? '<span class="tag tag-oos">אזל מהמלאי</span>' : ''}
        </div>
        <div class="card-body">
          <div class="card-meta">${metaParts(w).map((p) => `<span>${esc(p)}</span>`).join('')}</div>
          <h3 class="card-title"><a href="/wine/${esc(w.id)}" data-wine="${esc(w.id)}">${esc(w.name)}</a></h3>
          ${w.notes ? `<p class="note">${esc(w.notes)}</p>` : ''}
          <div class="card-foot">
            ${scoreHtml(w)}
            ${priceHtml(w)}
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-add="${esc(w.id)}"${w.out_of_stock ? ' disabled' : ''}>${w.out_of_stock ? 'אזל מהמלאי' : 'הוספה לעגלה'}</button>
          </div>
        </div>
      </article>`;
  }
  function pickHtml(w, i) {
    return `
      <article class="pick" data-id="${esc(w.id)}">
        <div class="pick-media">${imgHtml(w, { eager: i < 3 })}</div>
        <div class="pick-body">
          <div class="card-meta">${metaParts(w).map((p) => `<span>${esc(p)}</span>`).join('')}</div>
          <h3 class="pick-title"><a href="/wine/${esc(w.id)}" data-wine="${esc(w.id)}">${esc(w.name)}</a></h3>
          ${w.notes ? `<p class="note">${esc(w.notes)}</p>` : ''}
          <div class="pick-foot">
            ${scoreHtml(w)}
            ${priceHtml(w)}
          </div>
          <div class="card-actions"><button class="btn btn-secondary btn-sm" type="button" data-add="${esc(w.id)}">הוספה לעגלה</button></div>
        </div>
      </article>`;
  }
  function listHtml(rows) {
    return `
      <table class="list">
        <thead><tr>
          <th scope="col">יין</th>
          <th scope="col" class="l-note-cell">השורה של דורון</th>
          <th scope="col">ציון</th>
          <th scope="col">מחיר</th>
          <th scope="col"><span class="sr-only">הוספה לעגלה</span></th>
        </tr></thead>
        <tbody>
          ${rows.map((w) => {
            const disc = discountPct(w.shelf_price, w.sale_price);
            const sub = [w.winery, w.vintage, w.category_he].filter(Boolean).map(esc).join(' · ');
            return `
            <tr data-id="${esc(w.id)}">
              <td>
                <div class="l-name"><a href="/wine/${esc(w.id)}" data-wine="${esc(w.id)}">${esc(w.name)}</a>${state.recommendedIds.has(String(w.id)) ? ` <span class="knot" title="מומלץ">${icon('knot')}<span class="sr-only">מומלץ</span></span>` : ''}</div>
                <div class="l-sub">${sub}</div>
              </td>
              <td class="l-note-cell"><div class="l-note">${esc(w.notes || '')}</div></td>
              <td class="l-score num">${w.rating || ''}</td>
              <td class="l-price num">${fmtPrice(w.sale_price)}${disc ? `<s aria-label="מחיר מדף ${fmtPrice(w.shelf_price)}">${fmtPrice(w.shelf_price)}</s>` : ''}</td>
              <td class="l-act"><button class="btn btn-secondary btn-sm" type="button" data-add="${esc(w.id)}" aria-label="הוספה לעגלה: ${esc(w.name)}">${icon('plus')}<span class="sr-only">הוספה לעגלה</span></button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function renderPicks() {
    const section = $('picks');
    if (!state.recommended.length) { section.hidden = true; return; }
    section.hidden = false;
    $('picksGrid').innerHTML = state.recommended.map(pickHtml).join('');
  }

  function renderHeroFeatured() {
    const aside = $('heroAside');
    const host = $('heroFeatured');
    if (!aside || !host) return;
    const picks = state.recommended.slice(0, 3);
    if (!picks.length) { aside.hidden = true; host.innerHTML = ''; return; }
    aside.hidden = false;
    host.innerHTML = picks.map((w, i) => `
      <a class="hero-feat" href="/wine/${esc(w.id)}" data-wine="${esc(w.id)}">
        <div class="hero-feat-media">${imgHtml(w, { eager: i === 0, alt: '' })}</div>
        <div class="hero-feat-body">
          <div class="hero-feat-meta">${metaParts(w).map((p) => esc(p)).join(' · ')}</div>
          <h3 class="hero-feat-title">${esc(w.name)}</h3>
          ${w.notes ? `<p class="hero-feat-note">${esc(w.notes)}</p>` : ''}
        </div>
        ${scoreHtml(w)}
      </a>`).join('');
  }

  function renderCatalog() {
    const container = $('winesContainer');
    const rows = filteredWines();
    const total = rows.length;
    $('catalogCount').textContent = state.wines.length ? state.wines.length : '';
    renderActiveFilters();

    if (!total) {
      $('resultsLine').textContent = 'לא נמצאו יינות';
      container.innerHTML = `
        <div class="empty">
          <h3>לא מצאנו יין שמתאים לסינון הזה</h3>
          <p>${state.filters.search ? 'נסו לחפש רק לפי שם היקב או הזן, ' : ''}נסו להרחיב את טווח המחיר או להסיר סינון אחד.</p>
          <div class="actions">
            <button class="btn btn-secondary" type="button" data-clear="all">ניקוי כל הסינונים</button>
            <a class="btn btn-text" href="#picks">להמלצות של דורון</a>
          </div>
        </div>`;
      $('moreWrap').hidden = true;
      return;
    }

    const shown = Math.min(state.shown, total);
    const visible = rows.slice(0, shown);
    $('resultsLine').textContent = shown < total ? `מציגים ${shown} מתוך ${winesWord(total)}` : winesWord(total);
    container.innerHTML = state.view === 'list'
      ? listHtml(visible)
      : `<div class="grid">${visible.map((w, i) => cardHtml(w, { eager: i < 4 })).join('')}</div>`;
    const remaining = total - shown;
    $('moreWrap').hidden = remaining <= 0;
    if (remaining > 0) $('moreBtn').textContent = `הצגת עוד יינות (${remaining} נוספים)`;
  }

  /* ---------------------------------------------------------------- product route */
  let productJsonLd = null;
  function related(w) {
    const pool = state.wines.filter((x) => x.id !== w.id && !x.out_of_stock);
    const sameWinery = pool.filter((x) => x.winery && x.winery === w.winery).sort(SORTS.price_asc).slice(0, 4);
    const used = new Set(sameWinery.map((x) => x.id));
    const sameShelf = pool
      .filter((x) => !used.has(x.id) && x.category === w.category)
      .sort((a, b) => Math.abs(a.sale_price - w.sale_price) - Math.abs(b.sale_price - w.sale_price) || b.rating - a.rating)
      .slice(0, 4);
    return { sameWinery, sameShelf };
  }
  async function renderProduct(id) {
    const view = $('view-product');
    view.hidden = false;
    $('view-home').hidden = true;
    view.innerHTML = '<div class="product"><div class="product-media skeleton"></div><div class="product-info"><div class="skeleton" style="height:2.5rem;width:60%"></div><div class="skeleton" style="height:1.25rem;width:40%"></div></div></div>';
    let w;
    try { w = await fetchWine(id); } catch {
      view.innerHTML = `
        <nav class="crumbs" aria-label="פירורי לחם"><ul role="list"><li><a href="/" data-route="home">כל היינות</a></li></ul></nav>
        <div class="empty"><h3>היין הזה לא נמצא</h3><p>אולי הוא הוסר מהרשימה. כל היינות שבמלאי נמצאים בדף הבית.</p>
        <div class="actions"><a class="btn btn-primary" href="/" data-route="home">לכל היינות</a></div></div>`;
      document.title = 'יין לא נמצא | Wine Knot';
      return;
    }
    const rec = state.recommendedIds.has(String(w.id));
    const disc = discountPct(w.shelf_price, w.sale_price);
    const meta = [w.category_he, w.vintage ? `בציר ${w.vintage}` : '', w.country].filter(Boolean);
    const { sameWinery, sameShelf } = related(w);

    view.innerHTML = `
      <nav class="crumbs" aria-label="פירורי לחם">
        <ul role="list">
          <li><a href="/" data-route="home">כל היינות</a></li>
          ${w.category ? `<li><a href="${categoryHref(w.category)}" data-cat="${esc(w.category)}">${esc(w.category_he || categoryName(w.category))}</a></li>` : ''}
          <li aria-current="page">${esc(w.name)}</li>
        </ul>
      </nav>
      <article class="product" data-id="${esc(w.id)}">
        <div class="product-media">
          ${imgHtml(w, { eager: true, alt: `בקבוק ${w.name}${w.winery ? ` מיקב ${w.winery}` : ''}` })}
          ${rec ? `<span class="knot">${icon('knot')}ההמלצה של דורון</span>` : ''}
        </div>
        <div class="product-info">
          <div>
            ${w.winery ? `<p class="product-winery"><a href="/?winery=${encodeURIComponent(w.winery)}" data-winery="${esc(w.winery)}">${esc(w.winery)}</a></p>` : ''}
            <h1 id="productTitle" tabindex="-1">${esc(w.name)}</h1>
            ${meta.length ? `<ul class="product-meta mt-2" role="list">${meta.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
          </div>
          ${w.rating || w.notes ? `
          <div class="product-verdict">
            ${scoreHtml(w, true)}
            <div>
              ${w.notes ? `<p class="note">${esc(w.notes)}</p>` : '<p class="note">דורון עוד לא כתב על היין הזה שורה — שאלו אותו בוואטסאפ.</p>'}
              <p class="product-fine mt-2">הציון והשורה הם של דורון אהרון, אחרי טעימה.</p>
            </div>
          </div>` : ''}
          <div class="product-buy">
            <div class="product-price">
              <span class="price-now num">${fmtPrice(w.sale_price)}</span>
              ${disc ? `<span class="price-was num">מחיר מדף <s>${fmtPrice(w.shelf_price)}</s></span><span class="saving">חיסכון <span class="ltr">${disc}%</span></span>` : ''}
            </div>
            ${w.out_of_stock ? '<p><span class="tag tag-oos">אזל מהמלאי</span></p>' : `
            <div class="product-qty">
              <div class="qty" role="group" aria-label="כמות">
                <button type="button" id="qtyDec" aria-label="פחות בקבוק אחד">${icon('minus')}</button>
                <output id="qtyOut" for="qtyDec qtyInc" aria-live="polite">1</output>
                <button type="button" id="qtyInc" aria-label="עוד בקבוק אחד">${icon('plus')}</button>
              </div>
              <div class="presets" role="group" aria-label="כמויות מהירות">
                <button class="chip" type="button" data-qty="6">שישייה</button>
                <button class="chip" type="button" data-qty="12">ארגז 12 <span class="ltr">+1</span></button>
              </div>
            </div>
            <div class="product-cta">
              <button class="btn btn-primary" type="button" id="productAdd" data-add="${esc(w.id)}" data-qty-from="qtyOut">הוספה לעגלה</button>
              <button class="btn btn-secondary" type="button" id="productWa">${icon('whatsapp')}שאלה או הזמנה בוואטסאפ</button>
            </div>`}
            <p class="product-fine">על כל 12 בקבוקים בהזמנה — <strong>בקבוק מתנה</strong>. משלוח עד הבית באזורי החלוקה; התשלום מסוכם מול דורון בוואטסאפ.</p>
          </div>
        </div>
      </article>
      ${sameWinery.length ? `<section class="related" aria-labelledby="relWinery"><h2 id="relWinery">עוד מ${esc(w.winery)}</h2><div class="grid">${sameWinery.map((x) => cardHtml(x)).join('')}</div></section>` : ''}
      ${sameShelf.length ? `<section class="related" aria-labelledby="relShelf"><h2 id="relShelf">באותו מדף: ${esc(w.category_he || categoryName(w.category))}</h2><div class="grid">${sameShelf.map((x) => cardHtml(x)).join('')}</div></section>` : ''}
      ${w.out_of_stock ? '' : `
      <div class="buybar" id="buybar">
        <div>
          <span class="price-now num">${fmtPrice(w.sale_price)}</span>
          <span class="buybar-name">${esc(w.name)}</span>
        </div>
        <button class="btn btn-primary" type="button" data-add="${esc(w.id)}" data-qty-from="qtyOut">הוספה לעגלה</button>
      </div>`}`;

    document.body.classList.toggle('has-buybar', !w.out_of_stock);
    let qty = 1;
    const out = $('qtyOut');
    const setQty = (n) => { qty = Math.min(120, Math.max(1, n)); if (out) out.textContent = qty; if ($('qtyDec')) $('qtyDec').disabled = qty <= 1; };
    if (out) {
      $('qtyDec').addEventListener('click', () => setQty(qty - 1));
      $('qtyInc').addEventListener('click', () => setQty(qty + 1));
      view.querySelectorAll('[data-qty]').forEach((b) => b.addEventListener('click', () => setQty(Number(b.dataset.qty))));
      setQty(1);
      $('productWa').addEventListener('click', () => {
        const lines = ['שלום Wine Knot,', '', 'מעוניין/ת ב:', cartWineLabel({ name: w.name, vintage: w.vintage })];
        if (w.winery) lines.push(`מיקב: ${w.winery}`);
        lines.push(fmtPrice(w.sale_price));
        window.open(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
      });
    }

    document.title = `${w.name}${w.winery ? ` — ${w.winery}` : ''} | Wine Knot`;
    setMetaDescription(`${w.name}${w.winery ? ` מיקב ${w.winery}` : ''}${w.vintage ? `, בציר ${w.vintage}` : ''}. ציון Wine Knot ${w.rating}. ${w.notes ? `${w.notes}. ` : ''}${fmtPrice(w.sale_price)} עם משלוח עד הבית.`);
    setProductJsonLd(w);
    $('productTitle').focus({ preventScroll: true });
  }
  function setMetaDescription(text) {
    document.querySelector('meta[name="description"]').setAttribute('content', text);
  }
  function setProductJsonLd(w) {
    removeProductJsonLd();
    const img = safeImageUrl(w.image_url);
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: w.name,
      brand: w.winery ? { '@type': 'Brand', name: w.winery } : undefined,
      description: w.notes || undefined,
      image: img ? (img.startsWith('/') ? `${location.origin}${img}` : img) : undefined,
      url: `${location.origin}/wine/${w.id}`,
      category: w.category_he || undefined,
      offers: {
        '@type': 'Offer',
        price: String(w.sale_price),
        priceCurrency: 'ILS',
        availability: w.out_of_stock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: 'Wine Knot' },
      },
    };
    productJsonLd = document.createElement('script');
    productJsonLd.type = 'application/ld+json';
    productJsonLd.textContent = JSON.stringify(data);
    document.head.appendChild(productJsonLd);
  }
  function removeProductJsonLd() {
    if (productJsonLd) { productJsonLd.remove(); productJsonLd = null; }
  }

  function showHome({ restoreScroll = false } = {}) {
    $('view-product').hidden = true;
    $('view-product').innerHTML = '';
    $('view-home').hidden = false;
    document.body.classList.remove('has-buybar');
    removeProductJsonLd();
    document.title = 'Wine Knot | חנות יין בחיפה — הרשימה של דורון';
    setMetaDescription('Wine Knot — חנות יין מחיפה עם משלוח עד הבית. כל יין ברשימה נבחר, דורג וקיבל שורה מדורון אהרון, מומחה ליין כ־30 שנה. יינות ישראליים ומחו״ל, הזמנה בוואטסאפ, בקבוק מתנה על כל ארגז.');
    if (restoreScroll) window.scrollTo({ top: state.homeScrollY, behavior: 'auto' });
  }

  function navigate(url, { push = true } = {}) {
    if (state.route.name === 'home') state.homeScrollY = window.scrollY;
    if (push) history.pushState(null, '', url);
    route({ fromNav: true });
  }
  function route({ fromNav = false, restoreScroll = false } = {}) {
    const wasHome = state.route.name === 'home';
    readUrl();
    syncControls();
    renderShelves();
    if (state.route.name === 'product') {
      renderProduct(state.route.id);
      if (fromNav || !restoreScroll) window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      showHome({ restoreScroll: restoreScroll && !wasHome });
      state.shown = PAGE_SIZE;
      renderCatalog();
      if (fromNav && hasActiveFilters()) scrollToCatalog();
      else if (fromNav && location.hash) {
        const target = document.querySelector(location.hash);
        if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }
  }

  /* ---------------------------------------------------------------- events */
  function setupEvents() {
    // Global delegated clicks: filters links, product links, add-to-cart, chips.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      const btn = e.target.closest('button');

      if (btn && btn.dataset.add) {
        e.preventDefault();
        const w = state.byId.get(String(btn.dataset.add));
        if (!w || w.out_of_stock) return;
        const qtyEl = btn.dataset.qtyFrom ? $(btn.dataset.qtyFrom) : null;
        addToCart(w, qtyEl ? Number(qtyEl.textContent) || 1 : 1);
        return;
      }
      if (btn && btn.dataset.clear) {
        e.preventDefault();
        const key = btn.dataset.clear;
        if (key === 'all') { const sort = state.filters.sort; resetFilters(); state.filters.sort = sort; setFilters({}); }
        else if (key === 'customprice') setFilters({ min_price: '', max_price: '' });
        else setFilters({ [key]: '' });
        return;
      }
      if (!a) return;
      if (a.target === '_blank' || a.origin !== location.origin) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      if (a.dataset.focus) {
        e.preventDefault();
        scrollToCatalog();
        setTimeout(() => $(a.dataset.focus).focus(), 350);
        return;
      }
      if (a.dataset.closeCart != null) closeCart();
      if (a.dataset.closeMenu != null) closeMenu();

      if (a.dataset.wine) {
        e.preventDefault();
        lastProductTrigger = a;
        navigate(a.getAttribute('href'));
        return;
      }
      if ('cat' in a.dataset || 'winery' in a.dataset || 'price' in a.dataset || 'rating' in a.dataset || 'sort' in a.dataset || a.dataset.route === 'home' || a.pathname === '/') {
        e.preventDefault();
        const url = new URL(a.href);
        const goingHomeFromProduct = state.route.name !== 'home';
        if (goingHomeFromProduct) {
          history.pushState(null, '', url.pathname + url.search + url.hash);
          route({ fromNav: true });
          if (!url.search && !url.hash) window.scrollTo({ top: 0, behavior: 'auto' });
          return;
        }
        // On the home view: update filters in place, then scroll.
        const p = url.searchParams;
        const patch = {};
        if ('cat' in a.dataset) { patch.category = a.dataset.cat; }
        if ('winery' in a.dataset) { patch.winery = a.dataset.winery; patch.category = ''; }
        if ('price' in a.dataset) { patch.price = a.dataset.price; patch.category = ''; }
        if ('rating' in a.dataset) { patch.min_rating = a.dataset.rating; patch.category = ''; }
        if ('sort' in a.dataset) { patch.sort = a.dataset.sort; }
        if (a.dataset.route === 'home' || (a.pathname === '/' && !p.toString() && !url.hash)) {
          resetFilters();
          setFilters({}, { replace: false });
          window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
          return;
        }
        if (Object.keys(patch).length) { setFilters(patch, { scroll: true, replace: false }); return; }
        if (url.hash) {
          const target = document.querySelector(url.hash);
          if (target) { history.pushState(null, '', url.pathname + url.search + url.hash); target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); }
        }
      }
    });

    // Image fallbacks (capture phase catches <img> error events).
    document.addEventListener('error', (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG' || !img.closest('.card-media, .pick-media, .product-media')) return;
      const span = document.createElement('span');
      span.className = 'no-img';
      span.textContent = 'תמונה בקרוב';
      img.replaceWith(span);
    }, true);

    // Filters form.
    const form = $('filters');
    form.addEventListener('submit', (e) => e.preventDefault());
    $('filterDetails').querySelector('summary').addEventListener('click', () => { $('filterDetails').dataset.userToggled = '1'; });
    wideQuery.addEventListener('change', syncFilterDisclosure);
    $('fCategory').addEventListener('change', (e) => setFilters({ category: e.target.value }));
    $('fWinery').addEventListener('change', (e) => setFilters({ winery: e.target.value }));
    $('fPrice').addEventListener('change', (e) => setFilters({ price: e.target.value === 'custom' ? '' : e.target.value, min_price: '', max_price: '' }));
    $('fScore').addEventListener('change', (e) => setFilters({ min_rating: e.target.value }));
    $('fVintage').addEventListener('change', (e) => setFilters({ vintage: e.target.value }));
    $('sort').addEventListener('change', (e) => setFilters({ sort: e.target.value }));
    $('viewGrid').addEventListener('click', () => setView('grid'));
    $('viewList').addEventListener('click', () => setView('list'));
    $('moreBtn').addEventListener('click', () => {
      const before = state.shown;
      state.shown += PAGE_SIZE;
      renderCatalog();
      const first = $('winesContainer').querySelectorAll('.card a[data-wine], .list tbody tr a[data-wine]')[before];
      if (first) first.focus({ preventScroll: true });
    });

    // Search inputs (header, toolbar, menu) stay in sync.
    const onSearch = debounce((value) => {
      const q = clean(value).slice(0, SEARCH_MAX_LEN);
      if (q === state.filters.search) return;
      if (state.route.name !== 'home') {
        history.pushState(null, '', q ? `/?search=${encodeURIComponent(q)}` : '/');
        route({ fromNav: true });
        return;
      }
      setFilters({ search: q }, { scroll: false });
    }, 250);
    ['search', 'searchDesktop', 'searchMobile'].forEach((id) => {
      $(id).addEventListener('input', (e) => onSearch(e.target.value));
    });
    const onSubmit = (inputId) => (e) => {
      e.preventDefault();
      const q = clean($(inputId).value).slice(0, SEARCH_MAX_LEN);
      if (state.route.name !== 'home') { history.pushState(null, '', q ? `/?search=${encodeURIComponent(q)}` : '/'); route({ fromNav: true }); }
      else setFilters({ search: q }, { scroll: true });
      if (inputId === 'searchMobile') closeMenu();
    };
    $('headerSearch').addEventListener('submit', onSubmit('searchDesktop'));
    $('menuSearch').addEventListener('submit', onSubmit('searchMobile'));

    // Cart drawer.
    $('cartBtn').addEventListener('click', openCart);
    $('cartClose').addEventListener('click', closeCart);
    $('cartOverlay').addEventListener('click', (e) => { if (e.target === $('cartOverlay')) closeCart(); });
    $('cartItems').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      const id = b.closest('.cart-line').dataset.id;
      const item = state.cart[id];
      if (!item) return;
      if (b.dataset.action === 'dec') setCartQuantity(id, item.quantity - 1);
      if (b.dataset.action === 'inc') setCartQuantity(id, item.quantity + 1);
      if (b.dataset.action === 'remove') setCartQuantity(id, 0);
    });
    $('cartWhatsAppBtn').addEventListener('click', () => {
      const msg = buildWhatsAppMessage();
      if (!msg) return;
      window.open(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    });

    // Menu drawer.
    $('menuBtn').addEventListener('click', openMenu);
    $('menuClose').addEventListener('click', closeMenu);
    $('menuOverlay').addEventListener('click', (e) => { if (e.target === $('menuOverlay')) closeMenu(); });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('cartOverlay').classList.contains('open')) closeCart();
      else if ($('menuOverlay').classList.contains('open')) closeMenu();
    });

    window.addEventListener('popstate', () => {
      const returningToHome = state.route.name === 'product';
      route({ restoreScroll: returningToHome });
      if (returningToHome && lastProductTrigger && document.contains(lastProductTrigger)) lastProductTrigger.focus({ preventScroll: true });
    });
  }
  let lastProductTrigger = null;

  function setView(view) {
    state.view = view;
    localStorage.setItem(VIEW_KEY, view);
    syncControls();
    renderCatalog();
    syncUrl(true);
  }

  /* ---------------------------------------------------------------- age gate */
  function setupAgeGate() {
    if (localStorage.getItem(AGE_KEY) === '1') {
      document.body.classList.remove('age-gate-active');
      return true;
    }
    trapFocus($('ageGate'));
    $('ageGateYes').focus();
    $('ageGateYes').addEventListener('click', () => {
      if (releaseTrap) releaseTrap();
      localStorage.setItem(AGE_KEY, '1');
      document.body.classList.remove('age-gate-active');
      document.dispatchEvent(new Event('wineknot:age-verified'));
      init();
    });
    $('ageGateNo').addEventListener('click', () => {
      $('ageGatePrompt').hidden = true;
      $('ageGateRejected').classList.add('show');
      $('ageGate').querySelector('.age-actions').hidden = true;
      $('ageGate').setAttribute('aria-labelledby', 'ageGateRejected');
    });
    return false;
  }

  /* ---------------------------------------------------------------- init */
  let started = false;
  async function init() {
    if (started) return;
    started = true;
    $('phoneLink').href = `tel:${CONTACT.phone}`;
    $('phoneText').textContent = CONTACT.phone;
    $('waLink').href = `https://wa.me/${CONTACT.whatsapp}`;
    $('emailLink').href = `mailto:${CONTACT.email}`;
    $('emailText').textContent = CONTACT.email;
    updateCartBadge();
    renderCart();
    setupEvents();
    readUrl();
    if (wideQuery.matches) $('filterDetails').open = true;

    try {
      await Promise.all([loadCategories(), loadWines(), loadRecommended()]);
    } catch {
      $('winesContainer').innerHTML = '<div class="empty"><h3>לא הצלחנו לטעון את רשימת היינות</h3><p>נסו לרענן את הדף בעוד רגע. אפשר גם להזמין ישירות בוואטסאפ: <a class="ltr" href="https://wa.me/972508496666" target="_blank" rel="noopener noreferrer">050-8496666</a>.</p></div>';
      $('shelves').innerHTML = '';
      return;
    }

    $('heroCount').textContent = winesWord(state.wines.length);
    populateSelects();
    renderStart();
    renderHeroFeatured();
    renderPicks();
    route({ restoreScroll: false });
    if (state.route.name === 'home' && location.hash) {
      const target = document.querySelector(location.hash);
      if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }));
    }
  }

  if (setupAgeGate()) init();
})();
