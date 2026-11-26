(() => {
  'use strict';

  const preferenceKey = 'loneti-smile-collector-language';
  const switcher = document.querySelector('[data-language-options]');
  const buttons = switcher.querySelectorAll('[data-language]');
  const localizedContent = document.querySelectorAll('[data-locale]');
  const supported = new Set(['en-US', 'ru-RU']);

  // Keep the publisher's browser selector as the fallback on mobile and other browsers.
  function extensionStore(agent) {
    if (/Android|iPhone|iPad|Mobile/i.test(agent)) return null;
    if (/\bEdg\//.test(agent)) return 'https://microsoftedge.microsoft.com/addons/detail/iikmkjmpaadaobahmlepeloendndfphd';
    if (/\bFirefox\//.test(agent)) return 'https://addons.mozilla.org/firefox/addon/tampermonkey/';
    if (/\bChrome\//.test(agent) && !/\bOPR\//.test(agent)) {
      return 'https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo';
    }
    return null;
  }

  const store = extensionStore(navigator.userAgent || '');
  if (store) {
    for (const link of document.querySelectorAll('[data-install-extension]')) link.href = store;
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
})();
