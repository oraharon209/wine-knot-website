(function () {
  const CONSENT_KEY = 'wineknot_consent';
  const A11Y_KEY = 'wineknot_a11y';
  const AGE_KEY = 'wineknot_age_verified';

  const defaultConsent = () => ({
    necessary: true,
    analytics: false,
    marketing: false,
    updatedAt: null,
  });

  const defaultA11y = () => ({
    font: 0,
    contrast: false,
    grayscale: false,
    links: false,
    noMotion: false,
  });

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...fallback(), ...JSON.parse(raw) } : fallback();
    } catch {
      return fallback();
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function applyA11y(state) {
    const html = document.documentElement;
    if (state.font) html.setAttribute('data-a11y-font', String(state.font));
    else html.removeAttribute('data-a11y-font');
    html.classList.toggle('a11y-contrast', !!state.contrast);
    html.classList.toggle('a11y-grayscale', !!state.grayscale);
    html.classList.toggle('a11y-highlight-links', !!state.links);
    html.classList.toggle('a11y-no-motion', !!state.noMotion);
  }

  applyA11y(readJson(A11Y_KEY, defaultA11y));

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm8 7.25h-5.25v11.5h-1.7v-5.25h-2.1v5.25H9.25V9.25H4V7.5h16v1.75z"/></svg>';

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function ageBlocksCookies() {
    return document.body.classList.contains('age-gate-active')
      || (document.getElementById('ageGate') && localStorage.getItem(AGE_KEY) !== '1');
  }

  function getConsent() {
    return readJson(CONSENT_KEY, defaultConsent);
  }

  function saveConsent(partial) {
    const next = {
      ...defaultConsent(),
      ...getConsent(),
      ...partial,
      necessary: true,
      updatedAt: new Date().toISOString(),
    };
    writeJson(CONSENT_KEY, next);
    document.dispatchEvent(new CustomEvent('wineknot:consent', { detail: next }));
    return next;
  }

  function hasConsentChoice() {
    return !!getConsent().updatedAt;
  }

  window.WineKnotConsent = {
    get: getConsent,
    allows(category) {
      if (category === 'necessary') return true;
      const c = getConsent();
      return !!c.updatedAt && !!c[category];
    },
    openPreferences() {
      openCookieSettings();
    },
  };

  let cookieBanner;
  let cookieOverlay;
  let a11yPanel;
  let a11yBtn;

  function setBannerVisible(open) {
    if (!cookieBanner) return;
    cookieBanner.classList.toggle('open', open);
    document.body.classList.toggle('has-cookie-banner', open);
    if (open) cookieBanner.removeAttribute('hidden');
    else cookieBanner.setAttribute('hidden', '');
  }

  function hideCookieUi() {
    setBannerVisible(false);
    if (cookieOverlay) {
      cookieOverlay.classList.remove('open');
      cookieOverlay.setAttribute('hidden', '');
    }
  }

  function maybeShowBanner() {
    if (ageBlocksCookies() || hasConsentChoice()) {
      setBannerVisible(false);
      return;
    }
    setBannerVisible(true);
  }

  function openCookieSettings() {
    if (!cookieOverlay) return;
    setBannerVisible(false);
    const c = getConsent();
    cookieOverlay.querySelector('#wkAnalytics').checked = !!c.analytics;
    cookieOverlay.querySelector('#wkMarketing').checked = !!c.marketing;
    cookieOverlay.classList.add('open');
    cookieOverlay.removeAttribute('hidden');
    cookieOverlay.querySelector('.wk-cookie-panel').focus();
  }

  function injectSkip() {
    if (document.querySelector('.wk-skip')) return;
    const target = document.getElementById('main') ? '#main' : '.legal-wrap';
    document.body.prepend(el(`<a class="wk-skip" href="${target}">דלג לתוכן הראשי</a>`));
  }

  function injectA11y() {
    a11yBtn = el(`<button type="button" class="wk-a11y-btn" aria-expanded="false" aria-controls="wkA11yPanel" aria-label="תפריט נגישות">${ICON}</button>`);
    a11yPanel = el(`
      <div class="wk-a11y-panel" id="wkA11yPanel" role="dialog" aria-modal="false" aria-labelledby="wkA11yTitle" hidden>
        <h2 id="wkA11yTitle">נגישות</h2>
        <div class="wk-a11y-actions">
          <button type="button" data-a11y="font-up">הגדלת טקסט</button>
          <button type="button" data-a11y="font-down">הקטנת טקסט</button>
          <button type="button" data-a11y="contrast" aria-pressed="false">ניגודיות גבוהה</button>
          <button type="button" data-a11y="grayscale" aria-pressed="false">גווני אפור</button>
          <button type="button" data-a11y="links" aria-pressed="false">הדגשת קישורים</button>
          <button type="button" data-a11y="motion" aria-pressed="false">עצירת אנימציות</button>
          <button type="button" class="wk-a11y-reset" data-a11y="reset">איפוס הגדרות</button>
        </div>
        <a class="wk-a11y-statement" href="/accessibility.html">הצהרת נגישות</a>
      </div>`);
    document.body.append(a11yBtn, a11yPanel);

    function syncPressed() {
      const s = readJson(A11Y_KEY, defaultA11y);
      a11yPanel.querySelector('[data-a11y="contrast"]').setAttribute('aria-pressed', String(!!s.contrast));
      a11yPanel.querySelector('[data-a11y="grayscale"]').setAttribute('aria-pressed', String(!!s.grayscale));
      a11yPanel.querySelector('[data-a11y="links"]').setAttribute('aria-pressed', String(!!s.links));
      a11yPanel.querySelector('[data-a11y="motion"]').setAttribute('aria-pressed', String(!!s.noMotion));
    }
    syncPressed();

    function togglePanel(open) {
      a11yPanel.classList.toggle('open', open);
      a11yPanel.toggleAttribute('hidden', !open);
      a11yBtn.setAttribute('aria-expanded', String(open));
      if (open) a11yPanel.querySelector('button').focus();
    }

    a11yBtn.addEventListener('click', () => {
      togglePanel(!a11yPanel.classList.contains('open'));
    });

    a11yPanel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a11y]');
      if (!btn) return;
      const s = readJson(A11Y_KEY, defaultA11y);
      switch (btn.dataset.a11y) {
        case 'font-up':
          s.font = Math.min(3, (s.font || 0) + 1);
          break;
        case 'font-down':
          s.font = Math.max(0, (s.font || 0) - 1);
          break;
        case 'contrast':
          s.contrast = !s.contrast;
          break;
        case 'grayscale':
          s.grayscale = !s.grayscale;
          break;
        case 'links':
          s.links = !s.links;
          break;
        case 'motion':
          s.noMotion = !s.noMotion;
          break;
        case 'reset':
          Object.assign(s, defaultA11y());
          break;
        default:
          return;
      }
      writeJson(A11Y_KEY, s);
      applyA11y(s);
      syncPressed();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && a11yPanel.classList.contains('open')) {
        togglePanel(false);
        a11yBtn.focus();
      }
    });
  }

  function injectCookies() {
    cookieBanner = el(`
      <div class="wk-cookie" role="dialog" aria-labelledby="wkCookieTitle" aria-describedby="wkCookieDesc" hidden>
        <div class="wk-cookie-inner">
          <div class="wk-cookie-text">
            <strong id="wkCookieTitle">עוגיות ופרטיות</strong>
            <p id="wkCookieDesc">האתר משתמש באחסון מקומי הכרחי להפעלת החנות (עגלה, אימות גיל והעדפות נגישות). עוגיות אנליטיקה ושיווק יישמרו רק אם תאשרו. פירוט מלא ב<a href="/privacy.html">מדיניות הפרטיות והעוגיות</a>.</p>
          </div>
          <div class="wk-cookie-actions">
            <button type="button" class="wk-btn-accept" data-cookie="accept">קבלת הכל</button>
            <button type="button" class="wk-btn-reject" data-cookie="reject">הכרחיות בלבד</button>
            <button type="button" class="wk-btn-settings" data-cookie="settings">התאמה אישית</button>
          </div>
        </div>
      </div>`);

    cookieOverlay = el(`
      <div class="wk-cookie-overlay" hidden>
        <div class="wk-cookie-panel" role="dialog" aria-modal="true" aria-labelledby="wkCookieSettingsTitle" tabindex="-1">
          <h2 id="wkCookieSettingsTitle">הגדרת עוגיות</h2>
          <p>ניתן לשנות את הבחירה בכל עת דרך הקישור בתחתית האתר. בלי הסכמה לא יופעלו רכיבי מעקב.</p>
          <div class="wk-cookie-opt">
            <label>
              <input type="checkbox" checked disabled>
              הכרחיות
            </label>
            <p>נדרשות להפעלת האתר: אימות גיל 18+, עגלת קניות, העדפות נגישות ושמירת בחירת העוגיות.</p>
          </div>
          <div class="wk-cookie-opt">
            <label>
              <input type="checkbox" id="wkAnalytics">
              אנליטיקה
            </label>
            <p>סטטיסטיקות שימוש לשיפור האתר. כרגע לא פעיל באתר — ההסכמה תישמר אם יתווסף כלי מדידה בעתיד.</p>
          </div>
          <div class="wk-cookie-opt">
            <label>
              <input type="checkbox" id="wkMarketing">
              שיווק
            </label>
            <p>פרסום והתאמת תוכן שיווקי. כרגע לא פעיל באתר — ההסכמה תישמר אם יתווסף כלי שיווק בעתיד.</p>
          </div>
          <div class="wk-cookie-panel-actions">
            <button type="button" class="wk-btn-accept" data-cookie="save">שמירת בחירה</button>
            <button type="button" class="wk-btn-reject" data-cookie="reject">הכרחיות בלבד</button>
          </div>
        </div>
      </div>`);

    document.body.append(cookieBanner, cookieOverlay);

    function acceptAll() {
      saveConsent({ analytics: true, marketing: true });
      hideCookieUi();
    }
    function rejectOptional() {
      saveConsent({ analytics: false, marketing: false });
      hideCookieUi();
    }
    function saveCustom() {
      saveConsent({
        analytics: cookieOverlay.querySelector('#wkAnalytics').checked,
        marketing: cookieOverlay.querySelector('#wkMarketing').checked,
      });
      hideCookieUi();
    }

    document.body.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-cookies]');
      if (openBtn) {
        e.preventDefault();
        openCookieSettings();
        return;
      }
      const action = e.target.closest('[data-cookie]');
      if (!action) return;
      if (action.dataset.cookie === 'accept') acceptAll();
      else if (action.dataset.cookie === 'reject') rejectOptional();
      else if (action.dataset.cookie === 'settings') openCookieSettings();
      else if (action.dataset.cookie === 'save') saveCustom();
    });

    cookieOverlay.addEventListener('click', (e) => {
      if (e.target === cookieOverlay) hideCookieUi();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cookieOverlay.classList.contains('open')) hideCookieUi();
    });
  }

  function boot() {
    injectSkip();
    injectA11y();
    injectCookies();
    maybeShowBanner();
  }

  document.addEventListener('wineknot:age-verified', maybeShowBanner);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
