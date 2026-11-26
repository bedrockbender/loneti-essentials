(() => {
  function addLanguageLink() {
    const menu = document.querySelector('#drop_user');
    const settings = document.querySelector('.lcol_set .list_sets');
    const footer = !menu && document.querySelector('#footer .info-links');

    function link() {
      const anchor = document.createElement('a');
      anchor.href = 'loneti-essentials://language';
      anchor.textContent = 'Язык / Language';
      return anchor;
    }

    if (menu) menu.insertBefore(link(), menu.lastElementChild);
    for (const list of [settings, footer].filter(Boolean)) {
      const item = document.createElement('div');
      const anchor = link();
      item.className = list === settings ? 'one_set' : 'info-links__link-box';
      if (list === footer) anchor.className = 'info-links__link';
      item.append(anchor);
      list.append(item);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addLanguageLink, { once: true });
  } else {
    addLanguageLink();
  }
})();
