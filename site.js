(() => {
  'use strict';

  const preferenceKey = 'loneti-smile-collector-language';
  const switcher = document.querySelector('[data-language-options]');
  const buttons = switcher.querySelectorAll('[data-language]');
  const localizedContent = document.querySelectorAll('[data-locale]');
  const supported = new Set(['en-US', 'ru-RU']);

  // Keep the publisher's browser selector as the fallback on mobile and other browsers.
  function desktopBrowser(agent) {
    if (/Android|iPhone|iPad|Mobile/i.test(agent)) return null;
    if (/\bEdg\//.test(agent)) return 'edge';
    if (/\bFirefox\//.test(agent)) return 'firefox';
    if (/\bChrome\//.test(agent) && !/\bOPR\//.test(agent)) return 'chrome';
    return null;
  }

  const browser = desktopBrowser(navigator.userAgent || '');
  if (browser) {
    const stores = {
      chrome: 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo',
      edge: 'https://microsoftedge.microsoft.com/addons/detail/iikmkjmpaadaobahmlepeloendndfphd',
      firefox: 'https://addons.mozilla.org/firefox/addon/tampermonkey/',
    };
    for (const link of document.querySelectorAll('[data-install-extension]')) link.href = stores[browser];
  }

  function preferredLanguage() {
    try {
      const saved = localStorage.getItem(preferenceKey);
      if (supported.has(saved)) return saved;
    } catch {
      // The current session can still switch languages.
    }

    for (const locale of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const language = locale?.toLowerCase().split('-')[0];
      if (language === 'ru') return 'ru-RU';
      if (language === 'en') return 'en-US';
    }
    return 'en-US';
  }

  function displayLanguage(locale) {
    document.documentElement.lang = locale;
    switcher.setAttribute('aria-label', locale === 'ru-RU' ? 'Язык' : 'Language');
    for (const content of localizedContent) content.hidden = content.dataset.locale !== locale;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.language === locale));
  }

  switcher.addEventListener('click', event => {
    const button = event.target.closest('button[data-language]');
    if (!button) return;
    const locale = button.dataset.language;
    displayLanguage(locale);
    try {
      localStorage.setItem(preferenceKey, locale);
    } catch {
      // The selected language remains active on this page.
    }
  });

  displayLanguage(preferredLanguage());
  switcher.hidden = false;

  async function showAndroidDownloads() {
    let url = 'https://api.github.com/repos/bedrockbender/loneti-essentials/releases?per_page=100';
    let total = null;

    while (url) {
      const response = await fetch(url);
      if (!response.ok) return;
      for (const release of await response.json()) {
        for (const asset of release.assets) {
          if (asset.name !== 'Loneti-essentials.apk') continue;
          if (!Number.isSafeInteger(asset.download_count) || asset.download_count < 0) return;
          total = (total ?? 0) + asset.download_count;
        }
      }
      url = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    }

    if (total === null) return;
    for (const count of document.querySelectorAll('[data-android-downloads]')) {
      const locale = count.closest('[data-locale]').dataset.locale;
      const number = new Intl.NumberFormat(locale).format(total);
      const plural = new Intl.PluralRules(locale).select(total);
      if (locale === 'ru-RU') {
        const downloads = { one: 'скачивание', few: 'скачивания', many: 'скачиваний' };
        count.textContent = `Всего ${number} ${downloads[plural]}`;
      } else {
        count.textContent = `${number} total ${plural === 'one' ? 'download' : 'downloads'}`;
      }
      count.hidden = false;
    }
  }

  showAndroidDownloads().catch(() => {
    // The count is optional when GitHub is unavailable.
  });
})();
