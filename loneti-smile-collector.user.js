// ==UserScript==
// @name         LONETI Smile Collector
// @name:en-US   LONETI Smile Collector
// @name:ru-RU   Коллекция смайлов LONETI
// @name:ru      Коллекция смайлов LONETI
// @namespace    loneti-smile-collector
// @version      2.2.2
// @homepageURL  https://bedrockbender.github.io/loneti-smile-collector/
// @downloadURL  https://bedrockbender.github.io/loneti-smile-collector/loneti-smile-collector.user.js
// @updateURL    https://bedrockbender.github.io/loneti-smile-collector/loneti-smile-collector.user.js
// @description  Collect Smiles, organize packs, share .lesp files, and mark Smiles to prevent copying through this collector.
// @description:en-US Collect Smiles, organize packs, share .lesp files, and mark Smiles to prevent copying through this collector.
// @description:ru-RU Собирайте смайлы, создавайте наборы, обменивайтесь файлами .lesp и помечайте смайлы, чтобы запретить копирование через этот скрипт.
// @description:ru Собирайте смайлы, создавайте наборы, обменивайтесь файлами .lesp и помечайте смайлы, чтобы запретить копирование через этот скрипт.
// @match        https://loneti.art/pict*
// @match        https://loneti.art/chat*
// @match        https://loneti.ru/pict*
// @match        https://loneti.ru/chat*
// @match        https://loneti.art/settings*
// @match        https://loneti.ru/settings*
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const russian = {
    "Add this Smile to My emotes": "Добавить этот смайл в «Мои смайлы»",
    "Smile image unavailable": "Изображение смайла недоступно",
    "Add this Smile?": "Добавить этот смайл?",
    "Smile preview": "Предпросмотр смайла",
    "Loading preview…": "Загрузка предпросмотра…",
    "Open My emotes": "Открыть «Мои смайлы»",
    "Cancel": "Отмена",
    "Add to my Smiles": "Добавить в «Мои смайлы»",
    "Close": "Закрыть",
    "Sign in to add a Smile": "Войдите, чтобы добавить смайл",
    "Sign in to LONETI, then select this Smile again.": "Войдите в LONETI и снова выберите этот смайл.",
    "Missing Smile image": "Изображение смайла отсутствует",
    "Unsupported image URL": "Ссылка на изображение имеет неподдерживаемый формат",
    "Already added": "Смайл уже добавлен",
    "You added this Smile from this page.": "Вы уже добавили этот смайл с этой страницы.",
    "Original unavailable": "Оригинал недоступен",
    "The original is needed to check the creator’s sharing preference.": "Нужен оригинал, чтобы проверить, разрешил ли автор копирование.",
    "The original is needed to check the creator’s sharing preference. Select the Smile again to retry.": "Нужен оригинал, чтобы проверить, разрешил ли автор копирование. Выберите смайл ещё раз, чтобы повторить попытку.",
    "Copying disabled": "Копирование отключено",
    "The creator marked this Smile to prevent collection.": "Автор запретил копировать этот смайл.",
    "Save a copy to My emotes?": "Сохранить копию в «Мои смайлы»?",
    "Adding to My emotes…": "Добавление в «Мои смайлы»…",
    "Added to My emotes": "Добавлено в «Мои смайлы»",
    "Your Smile is ready to use.": "Теперь вы можете использовать этот смайл.",
    "Unable to save": "Не удалось сохранить",
    "Save unconfirmed": "Сохранение не подтверждено",
    "Check that you are signed in and have permission to save Smiles.": "Убедитесь, что вы вошли в аккаунт и можете сохранять смайлы.",
    "LONETI declined the save.": "LONETI отклонил сохранение.",
    "Check My emotes before trying again. The request may have reached LONETI.": "Проверьте раздел «Мои смайлы» перед повторной попыткой. Запрос мог дойти до LONETI.",
    "The saved pack list could not be read.": "Не удалось прочитать сохранённый список наборов.",
    "A library update is already running in another tab. Try again when it finishes.": "Список смайлов уже обновляется в другой вкладке. Повторите попытку после завершения.",
    "A full-size original is required to check its copy preference.": "Нужен полноразмерный оригинал, чтобы проверить, разрешено ли копирование.",
    "Could not read My emotes. Check the connection and try again.": "Не удалось загрузить «Мои смайлы». Проверьте подключение и повторите попытку.",
    "The signed-in account changed or the session expired. Reload My emotes.": "Аккаунт сменился или сеанс завершился. Перезагрузите страницу «Мои смайлы».",
    "LONETI returned an unfamiliar Smile card. Reload My emotes.": "LONETI вернул карточку смайла в неизвестном формате. Перезагрузите страницу «Мои смайлы».",
    "A recently added Smile could not be read to verify the previous save. Try again when its image loads.": "Не удалось загрузить недавно добавленный смайл и проверить предыдущее сохранение. Повторите попытку, когда загрузится изображение.",
    "A previous save of this Smile was interrupted. Its new copy could not be verified in My emotes. Send this Smile again?": "Предыдущее сохранение этого смайла прервалось. Не удалось проверить наличие новой копии в «Моих смайлах». Отправить смайл снова?",
    "Stopped before retrying the interrupted save.": "Повторное сохранение отменено.",
    "LONETI accepted the save, but the new image could not be verified. Check My emotes before retrying.": "LONETI принял запрос на сохранение, но проверить новое изображение не удалось. Проверьте раздел «Мои смайлы» перед повторной попыткой.",
    "The verified replacement is no longer in My emotes. Reload the library.": "Новая версия исчезла из раздела «Мои смайлы». Перезагрузите страницу.",
    "The old Smile changed. Reload My emotes.": "Прежний смайл изменился. Перезагрузите страницу «Мои смайлы».",
    "The new edition was verified. Reload My emotes to check whether LONETI removed the old entry.": "Новая версия подтверждена. Перезагрузите страницу «Мои смайлы», чтобы проверить, удалил ли LONETI прежнюю версию.",
    "The old Smile is still in My emotes. Use its checkbox again to retry removal.": "Прежний смайл остался в разделе «Мои смайлы». Чтобы снова попытаться удалить его, измените состояние его флажка.",
    "The library changed during replacement. Reload My emotes.": "Список смайлов изменился во время замены. Перезагрузите страницу «Мои смайлы».",
    "Replace this library entry with a protected Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.": "Заменить этот смайл версией с защитой от копирования? Прежняя версия будет удалена из списка после проверки новой. В уже опубликованных сообщениях останется старое изображение.",
    "Replace this library entry with a shareable Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.": "Заменить этот смайл версией, которую можно копировать? Прежняя версия будет удалена из списка после проверки новой. В уже опубликованных сообщениях останется старое изображение.",
    "This Smile changed. Reload My emotes.": "Этот смайл изменился. Перезагрузите страницу «Мои смайлы».",
    "The replacement image failed verification. The old library entry was kept.": "Новое изображение не прошло проверку. Прежний смайл остался в списке.",
    "Installing Smile {current} of {total}…": "Установка смайла {current} из {total}…",
    "{current} of {total} processed. {reason} Reopen this file to resume.": "Обработано {current} из {total}. {reason} Чтобы продолжить, снова откройте этот файл.",
    "Download {name}": "Скачать «{name}»",
    "Download .lesp": "Скачать .lesp",
    "Password (optional)": "Пароль (необязательно)",
    "Confirm password": "Повторите пароль",
    "Checking Smile {current} of {total}…": "Проверка смайла {current} из {total}…",
    "A file can hold up to {limit} shareable Smiles.": "В файл можно добавить до {limit} смайлов, доступных для копирования.",
    "This pack has no shareable Smiles.": "В этом наборе нет смайлов, доступных для копирования.",
    "Available to share: {count}.": "Доступно для копирования: {count}.",
    "Protected Smiles excluded: {count}.": "Исключено защищённых смайлов: {count}.",
    "Leave the password blank for an open pack.": "Чтобы сохранить набор без пароля, оставьте поле пустым.",
    "Could not prepare this pack. {reason}": "Не удалось подготовить этот набор. {reason}",
    "Could not download this pack.": "Не удалось скачать этот набор.",
    "Android save cancelled.": "Сохранение в Android отменено.",
    "Android is already saving a pack. Finish or cancel that save first.": "Android уже сохраняет набор. Завершите или отмените это сохранение.",
    "The passwords do not match.": "Пароли не совпадают.",
    "Smiles": "Смайлы",
    "{count} Smile downloaded.": "Скачан {count} смайл.",
    "{count} Smiles downloaded.": "Скачано смайлов: {count}.",
    "Install Smile pack": "Установить набор смайлов",
    "Choose a .lesp file": "Выберите файл .lesp",
    "Pack password": "Пароль набора",
    "Preview pack": "Предпросмотр набора",
    "Smiles in the pack: {count}. Matching copies in this pack or {unsorted} will be reused.": "Смайлов в наборе: {count}. Совпадающие копии из этого набора или раздела «{unsorted}» будут использованы повторно.",
    "Install pack": "Установить набор",
    "Installed {name} in My emotes.": "Набор «{name}» установлен в разделе «Мои смайлы».",
    "Could not read this pack.": "Не удалось прочитать этот набор.",
    "A Smile must be 300 × 300 pixels.": "Размер смайла должен быть 300 × 300 пикселей.",
    "Could not read the Smile canvas.": "Не удалось прочитать холст смайла.",
    "Could not mark the Smile output.": "Не удалось поставить отметку о защите смайла.",
    "Prevent copying this Smile": "Защитить этот смайл от копирования",
    "Could not update Smile copy protection.": "Не удалось изменить защиту смайла от копирования.",
    "The pack contains an invalid PNG.": "В наборе есть некорректный файл PNG.",
    "A Smile must be a 300 × 300 PNG.": "Смайл должен быть в формате PNG размером 300 × 300 пикселей.",
    "This pack contains a Smile marked to prevent copying.": "В наборе есть смайл с отметкой о защите от копирования.",
    "The pack contains an invalid or oversized PNG.": "В наборе есть некорректный или слишком большой файл PNG.",
    "Enter a password up to 1024 UTF-8 bytes.": "Введите пароль длиной не более 1024 байт в кодировке UTF-8.",
    "Enter a pack name.": "Введите название набора.",
    "The pack name is too long.": "Название набора слишком длинное.",
    "A pack must contain between 1 and 100 Smiles.": "В наборе должно быть от 1 до 100 смайлов.",
    "A pack may be at most 16 MiB.": "Размер набора не должен превышать 16 МиБ.",
    "A pack may be at most 16 MiB and must contain a LESP header.": "Размер набора не должен превышать 16 МиБ. Файл должен содержать заголовок LESP.",
    "Unsupported LESP pack format.": "Формат набора LESP не поддерживается.",
    "The LESP pack is truncated.": "Файл LESP неполный.",
    "The pack password is incorrect or the pack is damaged.": "Неверный пароль или файл набора повреждён.",
    "The LESP pack metadata is invalid.": "Некорректные метаданные набора LESP.",
    "The LESP pack name is invalid.": "Некорректное название набора LESP.",
    "The LESP pack contains an invalid PNG length.": "В наборе LESP указан некорректный размер файла PNG.",
    "The LESP pack contains unexpected trailing data.": "В конце файла LESP есть лишние данные.",
    "Unsorted": "Без набора",
    "Rename Smile pack": "Переименовать набор смайлов",
    "Name your Smile pack": "Введите название набора смайлов",
    "Enter a pack name between 1 and 80 characters.": "Введите название набора длиной от 1 до 80 символов.",
    "That pack name is already in use. Choose another name.": "Набор с таким названием уже есть. Выберите другое название.",
    "That Smile pack is no longer available.": "Этот набор смайлов больше недоступен.",
    "Could not update the Smile pack.": "Не удалось обновить набор смайлов.",
    "New pack": "Новый набор",
    "Move Smile to pack": "Переместить смайл в набор",
    "Copy protection": "Защита от копирования",
    "Checking copy protection…": "Проверка защиты от копирования…",
    "The old library entry was replaced with the protected edition.": "Смайл заменён версией с защитой от копирования.",
    "The old library entry was replaced with the shareable edition.": "Смайл заменён версией, которую можно копировать.",
    "Copy protection unavailable": "Защита от копирования недоступна",
    "Replace this library entry with the new sharing preference": "Заменить смайл версией с выбранной настройкой копирования",
    "Rename": "Переименовать",
    "Download pack": "Скачать набор",
    "This Smile is protected from collection": "Этот смайл защищён от копирования",
    "Could not process this Smile.": "Не удалось обработать этот смайл."
  };

  function supportedLocale(language) {
    switch (language?.trim().toLowerCase().split(/[-_]/)[0]) {
      case 'ru': return 'ru-RU';
      case 'en': return 'en-US';
      default: return null;
    }
  }

  const locale = supportedLocale(document.documentElement.lang) ||
    ({ 'loneti.ru': 'ru-RU', 'loneti.art': 'en-US' })[location.hostname] ||
    (navigator.languages || [navigator.language]).map(supportedLocale).find(Boolean) || 'en-US';

  function t(source, fields = {}) {
    const template = locale === 'ru-RU' ? (russian[source] ?? source) : source;
    return template.replace(/\{(\w+)\}/g, (placeholder, key) => fields[key] ?? placeholder);
  }

  class LocalizedError extends Error {}
  class SaveRejected extends LocalizedError {}

  function displayError(error, fallback = '') {
    return error instanceof LocalizedError ? error.message : t(fallback);
  }

  const smileSelector = [
    '.list_comments .one_comment .body_comment .smile_body > img',
    '#list_msg .one_msg .smile_msg > img',
  ].join(', ');
  const editorSize = 300;
  const added = new Set();
  let currentDialog = null;
  const onSettings = location.pathname === '/settings';
  const query = new URLSearchParams(location.search);
  if (onSettings && query.get('new') !== 'smile' && query.get('act') !== 'smiles') return;

  const style = document.createElement('style');
  style.textContent = `
    img[data-lsc-smile] { cursor: pointer; }
    img[data-lsc-smile]:is(:hover, :focus-visible) {
      outline: 3px solid #006f79; outline-offset: 2px; border-radius: 4px;
      box-shadow: 0 0 0 3px white, 0 0 0 6px #006f7940;
    }
  `;

  function markSmile(img) {
    if (img.hasAttribute('data-lsc-smile')) return;
    img.setAttribute('data-lsc-smile', '');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-haspopup', 'dialog');
    img.setAttribute('aria-label', t('Add this Smile to My emotes'));
    img.title = t('Add this Smile to My emotes');
    img.tabIndex = 0;
  }

  function markIn(root) {
    if (root.matches(smileSelector)) markSmile(root);
    root.querySelectorAll(smileSelector).forEach(markSmile);
  }

  function setupCollector() {
    document.head.append(style);
    markIn(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.isConnected) markIn(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', selectSmile, true);
    document.addEventListener('keydown', selectSmile, true);
  }

  function selectSmile(event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.matches(smileSelector)) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event.type === 'click' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!currentDialog && !event.repeat) openPreview(img);
  }

  function originalFor(url) {
    if (url.origin !== location.origin || !/^\/pic\/smiles\/[^/]+-sm\.png$/i.test(url.pathname)) {
      return url;
    }
    const original = new URL(url);
    original.pathname = original.pathname.replace(/-sm\.png$/i, '.png');
    return original;
  }

  async function drawSource(url, canvas, signal, cache = 'default') {
    signal.throwIfAborted();
    const request = new AbortController();
    const cancel = () => request.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 12000);
    let bitmap;
    try {
      const response = await fetch(url, { credentials: 'same-origin', cache, signal: request.signal });
      if (!response.ok) throw new LocalizedError(t('Smile image unavailable'));
      bitmap = await createImageBitmap(await response.blob());
      request.signal.throwIfAborted();
      const ctx = canvas.getContext('2d');
      const scale = Math.min(editorSize / bitmap.width, editorSize / bitmap.height);
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      // Match the editor's white-backed PNG and preserve the source proportions.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, editorSize, editorSize);
      ctx.drawImage(bitmap, (editorSize - width) / 2, (editorSize - height) / 2, width, height);
      return bitmap.width === editorSize && bitmap.height === editorSize;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      bitmap?.close();
    }
  }

  function makeDialog() {
    const host = document.createElement('div');
    host.lang = locale;
    const root = host.attachShadow({ mode: 'open' });
    // This template is static. Site messages and errors are inserted as text.
    root.innerHTML = `
      <style>
        dialog { all: initial; position: fixed; inset: 0; margin: auto; box-sizing: border-box;
          width: min(340px, calc(100vw - 24px)); height: fit-content; max-height: calc(100dvh - 24px); overflow: auto;
          padding: 22px; border-radius: 16px; color: #172e34; background: #fff;
          box-shadow: 0 12px 60px #16313940; font: 15px/1.45 system-ui, sans-serif; }
        dialog:not([open]), [hidden] { display: none !important; }
        dialog::backdrop { background: #122a3599; }
        h2 { margin: 0 0 14px; font-size: 21px; line-height: 1.25; }
        .smile-preview { width: min(180px, 100%, 32dvh); position: relative; margin: 0 auto; }
        canvas { display: block; margin: 0 auto 12px; width: 100%; height: auto; box-sizing: border-box;
          border: 1px solid #ccd9da; border-radius: 5px; }
        .smile-preview .lscp-picker-lock { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; pointer-events: none; }
        p { margin: 8px 0 14px; overflow-wrap: anywhere; }
        footer { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; }
        button, a { font: inherit; font-weight: 600; cursor: pointer; }
        button { border: 0; border-radius: 8px; padding: 8px 12px; background: #edf2f2; color: #18383d; }
        button[data-add] { background: #006973; color: white; }
        button:disabled { opacity: .52; cursor: default; }
        a { color: #006973; margin-right: auto; }
        :is(button, a):focus-visible { outline: 2px solid #006973; outline-offset: 2px; }
      </style>
      <dialog aria-labelledby="title" aria-describedby="status">
        <h2 id="title">${t("Add this Smile?")}</h2>
        <div class="smile-preview"><canvas hidden role="img" aria-label="${t("Smile preview")}"></canvas></div>
        <p id="status" role="status">${t("Loading preview…")}</p>
        <footer>
          <a href="/settings?act=smiles" target="_blank" rel="noopener" hidden>${t("Open My emotes")}</a>
          <button data-close type="button" autofocus>${t("Cancel")}</button>
          <button data-add type="button" disabled>${t("Add to my Smiles")}</button>
        </footer>
      </dialog>`;
    document.body.append(host);
    return {
      host, dialog: root.querySelector('dialog'), title: root.querySelector('h2'),
      canvas: root.querySelector('canvas'), status: root.querySelector('p'),
      library: root.querySelector('a'), close: root.querySelector('[data-close]'),
      add: root.querySelector('[data-add]'),
    };
  }

  async function openPreview(img) {
    const ui = makeDialog();
    currentDialog = ui.dialog;
    const loader = new AbortController();
    let saving = false;
    let imageData;
    let key;

    function finish(title, message, showLibrary = false) {
      ui.title.textContent = title;
      ui.status.textContent = message;
      ui.library.hidden = !showLibrary;
      ui.add.hidden = true;
      ui.close.textContent = t('Close');
      ui.close.disabled = false;
      ui.close.focus();
    }

    ui.close.addEventListener('click', () => {
      if (!saving) ui.dialog.close();
    });
    ui.dialog.addEventListener('cancel', event => {
      if (saving) event.preventDefault();
    });
    ui.dialog.addEventListener('close', () => {
      loader.abort();
      currentDialog = null;
      ui.host.remove();
      if (img.isConnected) img.focus({ preventScroll: true });
    }, { once: true });
    ui.dialog.showModal();

    if (!document.querySelector('a#cur_user')) {
      finish(t('Sign in to add a Smile'), t('Sign in to LONETI, then select this Smile again.'));
      return;
    }
    try {
      const src = img.currentSrc || img.getAttribute('src');
      if (!src) throw new LocalizedError(t('Missing Smile image'));
      const displayed = new URL(src, document.baseURI);
      if (!['https:', 'http:'].includes(displayed.protocol)) throw new LocalizedError(t('Unsupported image URL'));
      const original = originalFor(displayed);
      key = original.href;
      if (added.has(key)) {
        finish(t('Already added'), t('You added this Smile from this page.'), true);
        return;
      }
      ui.canvas.width = ui.canvas.height = editorSize;
      const fullSize = await drawSource(original, ui.canvas, loader.signal);
      loader.signal.throwIfAborted();
      ui.canvas.hidden = false;
      if (!fullSize) {
        finish(t('Original unavailable'), t('The original is needed to check the creator’s sharing preference.'));
        return;
      }
      if (hasNoCopyMark(ui.canvas)) {
        ui.canvas.after(makeProtectionLock());
        finish(t('Copying disabled'), t('The creator marked this Smile to prevent collection.'));
        return;
      }
      imageData = ui.canvas.toDataURL('image/png');
      ui.status.textContent = t('Save a copy to My emotes?');
      ui.add.disabled = false;
    } catch {
      if (!loader.signal.aborted) finish(t('Original unavailable'), t('The original is needed to check the creator’s sharing preference. Select the Smile again to retry.'));
      return;
    }

    ui.add.addEventListener('click', async () => {
      if (saving || ui.add.disabled) return;
      saving = true;
      ui.close.disabled = ui.add.disabled = true;
      ui.status.textContent = t('Adding to My emotes…');
      try {
        await saveSmileImage(imageData);
        added.add(key);
        finish(t('Added to My emotes'), t('Your Smile is ready to use.'), true);
      } catch (error) {
        finish(error instanceof SaveRejected ? t('Unable to save') : t('Save unconfirmed'),
          displayError(error, 'Check My emotes before trying again. The request may have reached LONETI.'), true);
      } finally {
        saving = false;
      }
    });
  }


  async function saveSmileImage(imageData) {
    try {
      const response = await fetch('/settings?save=smile', {
        method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ data_img: imageData }), signal: AbortSignal.timeout(20000),
      });
      if ([401, 403].includes(response.status)) throw new SaveRejected(t('Check that you are signed in and have permission to save Smiles.'));
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result?.result === true || result?.result === 'true') return;
      if (result?.result === false || result?.result === 'false' || typeof result?.error === 'string') {
        throw new SaveRejected(result.error || t('LONETI declined the save.'));
      }
      throw new Error();
    } catch (error) {
      if (error instanceof SaveRejected) throw error;
      throw new LocalizedError(t('Check My emotes before trying again. The request may have reached LONETI.'));
    }
  }
  function profilePath(root) {
    const link = root.querySelector('a#cur_user[href]');
    return link ? new URL(link.getAttribute('href'), location.origin).pathname.toLowerCase() : '';
  }

  const profile = profilePath(document);
  const storageKey = 'lsc:packs:v1:' + profile;
  const libraryPage = '/settings?act=smiles';
  const digestCache = new Map();

  function readPackState() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { packs: [], members: {}, pending: {} };
    const state = JSON.parse(raw);
    if (!Array.isArray(state?.packs) || !state.members || typeof state.members !== 'object') {
      throw new LocalizedError(t('The saved pack list could not be read.'));
    }
    state.pending ??= {};
    return state;
  }

  async function changePackState(mutator) {
    await navigator.locks.request(storageKey + ':metadata', () => {
      const state = readPackState();
      mutator(state);
      localStorage.setItem(storageKey, JSON.stringify(state));
    });
    document.dispatchEvent(new Event('lsc-packs-changed'));
  }

  function withLibraryWrite(action) {
    return navigator.locks.request(storageKey + ':upload', { ifAvailable: true }, lock => {
      if (!lock) throw new LocalizedError(t('A library update is already running in another tab. Try again when it finishes.'));
      return action();
    });
  }

  function getLibraryCards(root = document) {
    return Array.from(root.querySelectorAll('#list_smiles .one_smile'))
      .filter(card => !card.hidden && card.style.display !== 'none');
  }

  function libraryEntry(card) {
    const id = card.getAttribute('data-id');
    const src = card.querySelector('img')?.getAttribute('src');
    if (!/^\d+$/.test(id) || !src) return null;
    const url = new URL(src, location.origin);
    if (url.origin !== location.origin) return null;
    return { id, url: originalFor(url).href };
  }

  async function readOwnedCanvas(url, cache) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = editorSize;
    const fullSize = await drawSource(originalFor(new URL(url, location.origin)), canvas, AbortSignal.timeout(15000), cache);
    if (!fullSize) throw new LocalizedError(t('A full-size original is required to check its copy preference.'));
    return canvas;
  }

  async function canvasDigest(canvas) {
    const pixels = canvas.getContext('2d').getImageData(0, 0, editorSize, editorSize).data;
    const hash = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function ownedDigest(entry) {
    // LONETI gives each new Smile its own image URL. Never cache a failed read.
    if (!digestCache.has(entry.url)) digestCache.set(entry.url, await canvasDigest(await readOwnedCanvas(entry.url)));
    return digestCache.get(entry.url);
  }

  async function preparePackImage(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = editorSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, editorSize, editorSize);
    ctx.drawImage(image, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), digest: await canvasDigest(canvas) };
  }

  async function fetchLibrary() {
    const response = await fetch(libraryPage, {
      mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(16000),
    });
    if (!response.ok) throw new LocalizedError(t('Could not read My emotes. Check the connection and try again.'));
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!profile || profilePath(doc) !== profile || !doc.querySelector('#list_smiles')) {
      throw new LocalizedError(t('The signed-in account changed or the session expired. Reload My emotes.'));
    }
    const byId = new Map();
    for (const card of getLibraryCards(doc)) {
      const entry = libraryEntry(card);
      if (!entry) throw new LocalizedError(t('LONETI returned an unfamiliar Smile card. Reload My emotes.'));
      byId.set(entry.id, { ...entry, card });
    }
    return byId;
  }

  function showNewLibraryCards(snapshot) {
    const list = document.getElementById('list_smiles');
    if (!list) return;
    const known = new Set(getLibraryCards().map(card => card.dataset.id));
    for (const entry of snapshot.values()) {
      if (!known.has(entry.id)) {
        list.querySelector('.no_smiles')?.remove();
        list.append(document.importNode(entry.card, true));
      }
    }
  }

  async function findMatch(entries, digest, mustRuleOutMatch = false) {
    let unreadable = false;
    for (const entry of entries) {
      try {
        if ((await ownedDigest(entry)) === digest) return entry;
      } catch {
        unreadable = true;
      }
    }
    if (unreadable && mustRuleOutMatch) throw new LocalizedError(t('A recently added Smile could not be read to verify the previous save. Try again when its image loads.'));
    return null;
  }

  async function recordMember(id, packId, digest) {
    await changePackState(state => {
      if (packId) state.members[id] = packId;
      else delete state.members[id];
      delete state.pending[digest];
    });
  }

  // Native saves return success without a library ID. Match new IDs by pixels,
  // so a simultaneous addition in another browser cannot land in this pack.
  async function uploadEdition(dataUrl, digest, packId, snapshot) {
    const pending = readPackState().pending[digest];
    if (pending) {
      const restored = await findMatch([...snapshot.values()].filter(entry => !pending.before.includes(entry.id)), digest, true);
      if (restored) {
        await recordMember(restored.id, pending.packId, digest);
        if (pending.packId === packId) return { snapshot, entry: restored };
      } else if (!window.confirm(t('A previous save of this Smile was interrupted. Its new copy could not be verified in My emotes. Send this Smile again?'))) {
        throw new LocalizedError(t('Stopped before retrying the interrupted save.'));
      }
    }
    await changePackState(state => { state.pending[digest] = { before: [...snapshot.keys()], packId }; });
    try {
      await saveSmileImage(dataUrl);
    } catch (error) {
      if (error instanceof SaveRejected) await changePackState(state => { delete state.pending[digest]; });
      throw error;
    }
    const after = await fetchLibrary();
    showNewLibraryCards(after);
    const match = await findMatch([...after.values()].filter(entry => !snapshot.has(entry.id)), digest);
    if (!match) throw new LocalizedError(t('LONETI accepted the save, but the new image could not be verified. Check My emotes before retrying.'));
    await recordMember(match.id, packId, digest);
    return { snapshot: after, entry: match };
  }

  async function removeReplacedSmile(previous, replacement) {
    const before = await fetchLibrary();
    if (before.get(replacement.id)?.url !== replacement.url || previous.id === replacement.id) {
      throw new LocalizedError(t('The verified replacement is no longer in My emotes. Reload the library.'));
    }
    if (!before.has(previous.id)) return before;
    if (before.get(previous.id).url !== previous.url) throw new LocalizedError(t('The old Smile changed. Reload My emotes.'));

    let reason = '';
    try {
      const response = await fetch('/settings?del=smile', {
        method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ id_smile: previous.id }), signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const result = await response.json();
        if (typeof result?.error === 'string') reason = result.error;
      }
    } catch {
      // A lost response can follow a successful deletion. Read the library before retrying.
    }
    let after;
    try {
      after = await fetchLibrary();
    } catch {
      throw new LocalizedError(t('The new edition was verified. Reload My emotes to check whether LONETI removed the old entry.'));
    }
    if (after.has(previous.id)) {
      throw new LocalizedError((reason ? reason + ' ' : '') + t('The old Smile is still in My emotes. Use its checkbox again to retry removal.'));
    }
    if (after.get(replacement.id)?.url !== replacement.url) throw new LocalizedError(t('The library changed during replacement. Reload My emotes.'));
    return after;
  }

  async function changeOwnedProtection(entry, desired, packId) {
    const prompt = desired
      ? t('Replace this library entry with a protected Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.')
      : t('Replace this library entry with a shareable Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.');
    if (!window.confirm(prompt)) return false;
    return withLibraryWrite(async () => {
      const snapshot = await fetchLibrary();
      if (snapshot.get(entry.id)?.url !== entry.url) throw new LocalizedError(t('This Smile changed. Reload My emotes.'));
      const canvas = await readOwnedCanvas(entry.url, 'no-store');
      if (hasNoCopyMark(canvas) === desired) return false;
      setNoCopyMark(canvas, desired);
      const digest = await canvasDigest(canvas);
      const state = readPackState();
      const siblings = [...snapshot.values()].filter(item => item.id !== entry.id && (state.members[item.id] || '') === packId);
      let replacement = await findMatch(siblings, digest);
      if (!replacement) {
        replacement = (await uploadEdition(canvas.toDataURL('image/png'), digest, packId, snapshot)).entry;
      }
      const verified = await readOwnedCanvas(replacement.url, 'no-store');
      if (hasNoCopyMark(verified) !== desired || await canvasDigest(verified) !== digest) {
        throw new LocalizedError(t('The replacement image failed verification. The old library entry was kept.'));
      }
      const after = await removeReplacedSmile(entry, replacement);
      showNewLibraryCards(after);
      for (const card of getLibraryCards()) {
        if (card.dataset.id === entry.id) card.remove();
      }
      await changePackState(state => {
        const group = state.members[entry.id] || '';
        if (group) state.members[replacement.id] = group;
        else delete state.members[replacement.id];
        delete state.members[entry.id];
        delete state.pending[digest];
      });
      return true;
    });
  }

  async function installPack(pack, progress) {
    await withLibraryWrite(async () => {
      let snapshot = await fetchLibrary();
      showNewLibraryCards(snapshot);
      let packId;
      await changePackState(state => {
        if (isUnsortedPackName(pack.name)) {
          packId = '';
          return;
        }
        const existing = state.packs.find(item => item.name.toLowerCase() === pack.name.toLowerCase());
        packId = existing?.id || crypto.randomUUID();
        if (!existing) state.packs.push({ id: packId, name: pack.name });
      });
      for (const [index, source] of pack.smiles.entries()) {
        progress(t('Installing Smile {current} of {total}…', { current: index + 1, total: pack.smiles.length }));
        try {
          const { dataUrl, digest } = await preparePackImage(source);
          const state = readPackState();
          const eligible = [...snapshot.values()].filter(entry => !state.members[entry.id] || state.members[entry.id] === packId);
          // Prefer this pack's own copy when Unsorted contains identical artwork.
          eligible.sort((a, b) => Number(state.members[b.id] === packId) - Number(state.members[a.id] === packId));
          const match = await findMatch(eligible, digest);
          if (match) await recordMember(match.id, packId, digest);
          else snapshot = (await uploadEdition(dataUrl, digest, packId, snapshot)).snapshot;
        } catch (error) {
          throw new LocalizedError(t('{current} of {total} processed. {reason} Reopen this file to resume.', {
            current: index, total: pack.smiles.length, reason: displayError(error, 'Could not process this Smile.'),
          }));
        }
      }
    });
  }
  function transferDialog(title) {
    if (currentDialog) return null;
    const ui = makeDialog();
    currentDialog = ui.dialog;
    ui.title.textContent = title;
    ui.status.textContent = '';
    const fields = document.createElement('div');
    ui.status.before(fields);
    ui.fields = fields;
    const style = document.createElement('style');
    style.textContent = '.fields label { display:grid; gap:4px; margin:10px 0; } .fields input { box-sizing:border-box; width:100%; padding:7px; font:inherit; } .samples { display:flex; flex-wrap:wrap; gap:4px; max-height:22vh; overflow:auto; } .samples img { width:44px; height:44px; object-fit:contain; border:1px solid #ccd9da; }';
    ui.dialog.before(style);
    fields.className = 'fields';
    let busy = false;
    ui.setBusy = value => {
      busy = value;
      ui.close.disabled = value;
      ui.add.disabled = value;
      fields.querySelectorAll('input').forEach(input => { input.disabled = value; });
    };
    ui.input = (labelText, type) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = type;
      label.append(labelText, input);
      fields.append(label);
      return input;
    };
    ui.done = message => {
      fields.replaceChildren();
      ui.add.hidden = true;
      ui.close.textContent = t('Close');
      ui.status.textContent = message;
      ui.close.focus();
    };
    ui.close.addEventListener('click', () => { if (!busy) ui.dialog.close(); });
    ui.dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    ui.dialog.addEventListener('close', () => {
      ui.host.remove();
      currentDialog = null;
    }, { once: true });
    ui.dialog.showModal();
    return ui;
  }

  async function openPackExport(name, entries, packName = name) {
    const ui = transferDialog(t('Download {name}', { name }));
    if (!ui) return;
    ui.add.textContent = t('Download .lesp');
    const password = ui.input(t('Password (optional)'), 'password');
    const repeat = ui.input(t('Confirm password'), 'password');
    password.autocomplete = repeat.autocomplete = 'new-password';
    const images = [];
    let skipped = 0;
    try {
      for (const [index, entry] of entries.entries()) {
        if (!ui.dialog.open) return;
        ui.status.textContent = t('Checking Smile {current} of {total}…', { current: index + 1, total: entries.length });
        const canvas = await readOwnedCanvas(entry.url);
        if (hasNoCopyMark(canvas)) skipped++;
        else images.push(canvas.toDataURL('image/png'));
        if (images.length > lespMaxImages) throw new LocalizedError(t('A file can hold up to {limit} shareable Smiles.', { limit: lespMaxImages }));
      }
      if (!images.length) {
        ui.done(t('This pack has no shareable Smiles.'));
        return;
      }
      ui.add.disabled = false;
      ui.status.textContent = [
        t('Available to share: {count}.', { count: images.length }),
        ...(skipped ? [t('Protected Smiles excluded: {count}.', { count: skipped })] : []),
        t('Leave the password blank for an open pack.'),
      ].join(' ');
    } catch (error) {
      ui.done(t('Could not prepare this pack. {reason}', { reason: displayError(error) }).trim());
      return;
    }
    ui.add.addEventListener('click', async () => {
      if (ui.add.disabled || ui.add.hidden) return;
      if (password.value !== repeat.value) {
        ui.status.textContent = t('The passwords do not match.');
        repeat.focus();
        return;
      }
      ui.setBusy(true);
      try {
        const blob = await writePack(packName, images, password.value);
        const filename = (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || t('Smiles')) + '.lesp';
        if (typeof saveAndroidSmilePack === 'function') {
          await saveAndroidSmilePack(blob, filename);
        } else {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 60000);
        }
        ui.setBusy(false);
        ui.done(t(images.length === 1 ? '{count} Smile downloaded.' : '{count} Smiles downloaded.', { count: images.length }));
      } catch (error) {
        ui.setBusy(false);
        if (error?.androidPackExportStatus === 'cancelled') {
          ui.status.textContent = t('Android save cancelled.');
        } else if (error?.androidPackExportStatus === 'busy') {
          ui.status.textContent = t('Android is already saving a pack. Finish or cancel that save first.');
        } else {
          ui.status.textContent = displayError(error, 'Could not download this pack.');
        }
      }
    });
  }

  function openPackInstall() {
    const ui = transferDialog(t('Install Smile pack'));
    if (!ui) return;
    const fileInput = ui.input(t('Choose a .lesp file'), 'file');
    fileInput.accept = '.lesp';
    const password = ui.input(t('Pack password'), 'password');
    password.autocomplete = 'off';
    password.parentElement.hidden = true;
    ui.add.textContent = t('Preview pack');
    let selectedFile;
    let pack;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      selectedFile = file;
      password.value = '';
      password.parentElement.hidden = true;
      ui.add.disabled = true;
      ui.status.textContent = '';
      if (!file) return;
      try {
        const locked = await isLockedPack(file);
        if (selectedFile !== file) return;
        password.parentElement.hidden = !locked;
        ui.add.disabled = false;
        if (locked) password.focus();
      } catch (error) {
        if (selectedFile === file) ui.status.textContent = displayError(error, 'Could not read this pack.');
      }
    });
    ui.add.addEventListener('click', async () => {
      if (ui.add.disabled || ui.add.hidden) return;
      ui.setBusy(true);
      try {
        if (!pack) {
          const validated = await readPack(selectedFile, password.value);
          password.value = '';
          pack = validated;
          ui.title.textContent = displayPackName(pack.name);
          const samples = document.createElement('div');
          samples.className = 'samples';
          for (const source of pack.smiles) {
            const img = document.createElement('img');
            img.src = source;
            img.alt = '';
            samples.append(img);
          }
          ui.fields.replaceChildren(samples);
          ui.status.textContent = t('Smiles in the pack: {count}. Matching copies in this pack or {unsorted} will be reused.', {
            count: pack.smiles.length, unsorted: t('Unsorted'),
          });
          ui.add.textContent = t('Install pack');
          return;
        }
        await installPack(pack, text => { ui.status.textContent = text; });
        ui.setBusy(false);
        ui.done(t('Installed {name} in My emotes.', { name: displayPackName(pack.name) }));
      } catch (error) {
        if (pack) {
          ui.setBusy(false);
          ui.done(displayError(error, 'Could not update the Smile pack.'));
        } else {
          ui.status.textContent = displayError(error, 'Could not read this pack.');
        }
      } finally {
        ui.setBusy(false);
      }
    });
  }

  const lespSize = 300;
  const lespMaxImages = 100;
  const lespMaxImageBytes = 512 * 1024;
  const lespMaxPackBytes = 16 * 1024 * 1024;
  const lespMaxNameBytes = 320;
  const lespMaxNameLength = 80;
  const lespPngPrefix = 'data:image/png;base64,';
  const lespPngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  const lespNoCopySignature = [0x4c, 0x45, 0x53, 0x50, 0x6e, 0xa7, 0x58, 0x3d];
  const lespHeader = [0x4c, 0x45, 0x53, 0x50, 1];
  const lespLockBytes = 28;
  const lespTagBytes = 16;

  function lespMarkPixels(canvas) {
    if (canvas.width !== lespSize || canvas.height !== lespSize) {
      throw new LocalizedError(t('A Smile must be 300 × 300 pixels.'));
    }
    const context = canvas.getContext('2d');
    if (!context) throw new LocalizedError(t('Could not read the Smile canvas.'));
    const pixels = context.getImageData(0, lespSize - 1, lespNoCopySignature.length * 8, 1);
    return { context, pixels };
  }

  function lespMarkMatches(data) {
    return lespNoCopySignature.every((byte, index) => {
      for (let bit = 0; bit < 8; bit += 1) {
        const blue = (index * 8 + bit) * 4 + 2;
        if (data[blue + 1] !== 255 || (data[blue] & 1) !== ((byte >> (7 - bit)) & 1)) return false;
      }
      return true;
    });
  }

  function hasNoCopyMark(canvas) {
    return lespMarkMatches(lespMarkPixels(canvas).pixels.data);
  }

  function setNoCopyMark(canvas, enabled) {
    const { context, pixels } = lespMarkPixels(canvas);
    if (lespMarkMatches(pixels.data) === enabled) return;
    for (let index = 0; index < lespNoCopySignature.length; index += 1) {
      for (let bit = 0; bit < 8; bit += 1) {
        const blue = (index * 8 + bit) * 4 + 2;
        if (pixels.data[blue + 1] !== 255) throw new LocalizedError(t('Could not mark the Smile output.'));
        const flag = enabled ? ((lespNoCopySignature[index] >> (7 - bit)) & 1) : 0;
        pixels.data[blue] = (pixels.data[blue] & 254) | flag;
      }
    }
    context.putImageData(pixels, 0, lespSize - 1);
  }

  function setupEditorProtection() {
    const save = document.getElementById('btn_save_server');
    const canvas = document.getElementById('canv_save');
    const download = document.getElementById('save_disk');
    const preview = document.querySelector('#img_save img');
    if (!save || !canvas || !download || !preview || document.getElementById('lesp-no-copy')) return;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.id = 'lesp-no-copy';
    checkbox.type = 'checkbox';
    label.style.display = 'block';
    label.style.margin = '0.5em 0';
    label.append(checkbox, ' ' + t('Prevent copying this Smile'));
    save.before(label);
    let stampedOutput;

    save.addEventListener('click', (event) => {
      if (save.classList.contains('disable_btn')) return;
      if (!checkbox.checked && (!stampedOutput || download.getAttribute('href') !== stampedOutput)) return;
      try {
        setNoCopyMark(canvas, checkbox.checked);
        const src = canvas.toDataURL('image/png');
        preview.src = src;
        download.setAttribute('href', src);
        stampedOutput = checkbox.checked ? src : undefined;
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.alert(displayError(error, 'Could not update Smile copy protection.'));
      }
    }, true);
  }

  function lespCheckPng(bytes) {
    if (bytes.length < 45 || bytes.length > lespMaxImageBytes ||
        !lespPngSignature.every((byte, index) => bytes[index] === byte)) {
      throw new LocalizedError(t('The pack contains an invalid PNG.'));
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
        view.getUint32(16) !== lespSize || view.getUint32(20) !== lespSize) {
      throw new LocalizedError(t('A Smile must be a 300 × 300 PNG.'));
    }
  }

  async function lespCheckSmile(bytes) {
    lespCheckPng(bytes);
    const blob = new Blob([bytes], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      if (hasNoCopyMark(canvas)) throw new LocalizedError(t('This pack contains a Smile marked to prevent copying.'));
    } finally {
      bitmap.close();
    }
  }

  function lespDecodeDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(lespPngPrefix) ||
        dataUrl.length > lespPngPrefix.length + 4 * Math.ceil(lespMaxImageBytes / 3)) {
      throw new LocalizedError(t('The pack contains an invalid or oversized PNG.'));
    }
    return Uint8Array.from(atob(dataUrl.slice(lespPngPrefix.length)), (char) => char.charCodeAt(0));
  }

  function lespEncodeDataUrl(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return lespPngPrefix + btoa(binary);
  }

  async function lespKey(password, salt) {
    const encoded = new TextEncoder().encode(password);
    if (!encoded.length || encoded.length > 1024) throw new LocalizedError(t('Enter a password up to 1024 UTF-8 bytes.'));
    const material = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function writePack(name, arrayOfPngDataUrls, passwordString = '') {
    if (typeof name !== 'string' || !name.trim()) throw new LocalizedError(t('Enter a pack name.'));
    const trimmedName = name.trim();
    if (trimmedName.length > lespMaxNameLength) throw new LocalizedError(t('The pack name is too long.'));
    const nameBytes = new TextEncoder().encode(trimmedName);
    if (nameBytes.length > lespMaxNameBytes) throw new LocalizedError(t('The pack name is too long.'));
    if (!Array.isArray(arrayOfPngDataUrls) || !arrayOfPngDataUrls.length ||
        arrayOfPngDataUrls.length > lespMaxImages) {
      throw new LocalizedError(t('A pack must contain between 1 and 100 Smiles.'));
    }

    const locked = passwordString.length > 0;
    const headerLength = lespHeader.length + 1 + (locked ? lespLockBytes : 0);
    const images = [];
    let payloadLength = 4 + nameBytes.length;
    for (const dataUrl of arrayOfPngDataUrls) {
      const image = lespDecodeDataUrl(dataUrl);
      payloadLength += 4 + image.length;
      if (headerLength + payloadLength + (locked ? lespTagBytes : 0) > lespMaxPackBytes) {
        throw new LocalizedError(t('A pack may be at most 16 MiB.'));
      }
      await lespCheckSmile(image);
      images.push(image);
    }

    const payload = new Uint8Array(payloadLength);
    const payloadView = new DataView(payload.buffer);
    payloadView.setUint16(0, nameBytes.length);
    payloadView.setUint16(2, images.length);
    payload.set(nameBytes, 4);
    let offset = 4 + nameBytes.length;
    for (const image of images) {
      payloadView.setUint32(offset, image.length);
      payload.set(image, offset + 4);
      offset += 4 + image.length;
    }

    const header = new Uint8Array(headerLength);
    header.set(lespHeader);
    header[5] = Number(locked);
    if (!locked) return new Blob([header, payload], { type: 'application/octet-stream' });

    crypto.getRandomValues(header.subarray(6));
    const key = await lespKey(passwordString, header.subarray(6, 22));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: header.subarray(22), additionalData: header },
      key,
      payload
    );
    return new Blob([header, ciphertext], { type: 'application/octet-stream' });
  }

  async function lespInspectPack(file) {
    if (file.size < 10 || file.size > lespMaxPackBytes) {
      throw new LocalizedError(t('A pack may be at most 16 MiB and must contain a LESP header.'));
    }
    const prefix = new Uint8Array(await file.slice(0, 6).arrayBuffer());
    if (!lespHeader.every((byte, index) => prefix[index] === byte) || prefix[5] > 1) {
      throw new LocalizedError(t('Unsupported LESP pack format.'));
    }
    const locked = prefix[5] === 1;
    const headerLength = prefix.length + (locked ? lespLockBytes : 0);
    if (file.size < headerLength + 4 + (locked ? lespTagBytes : 0)) {
      throw new LocalizedError(t('The LESP pack is truncated.'));
    }
    return { locked, headerLength };
  }

  async function isLockedPack(file) {
    return (await lespInspectPack(file)).locked;
  }

  async function readPack(file, passwordString = '') {
    const { locked, headerLength } = await lespInspectPack(file);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    let payload = fileBytes.subarray(headerLength);
    if (locked) {
      const key = await lespKey(passwordString, fileBytes.subarray(6, 22));
      try {
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fileBytes.subarray(22, headerLength), additionalData: fileBytes.subarray(0, headerLength) },
          key,
          payload
        );
        payload = new Uint8Array(plaintext);
      } catch {
        throw new LocalizedError(t('The pack password is incorrect or the pack is damaged.'));
      }
    }

    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const nameLength = view.getUint16(0);
    const count = view.getUint16(2);
    if (!nameLength || nameLength > lespMaxNameBytes || 4 + nameLength > payload.length ||
        !count || count > lespMaxImages) throw new LocalizedError(t('The LESP pack metadata is invalid.'));

    const name = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload.subarray(4, 4 + nameLength)).trim();
    if (!name || name.length > lespMaxNameLength) throw new LocalizedError(t('The LESP pack name is invalid.'));
    const images = [];
    let offset = 4 + nameLength;
    for (let index = 0; index < count; index += 1) {
      if (offset + 4 > payload.length) throw new LocalizedError(t('The LESP pack is truncated.'));
      const size = view.getUint32(offset);
      offset += 4;
      if (!size || size > lespMaxImageBytes || offset + size > payload.length) {
        throw new LocalizedError(t('The LESP pack contains an invalid PNG length.'));
      }
      images.push(payload.subarray(offset, offset + size));
      offset += size;
    }
    if (offset !== payload.length) throw new LocalizedError(t('The LESP pack contains unexpected trailing data.'));
    for (const image of images) await lespCheckSmile(image);
    return { name, smiles: images.map(lespEncodeDataUrl) };
  }

  const packPickerSelector = '.cont_add_smile .list_smile';
  const smileIdOrder = new Intl.Collator('en', { numeric: true });

  // Both views get their own server list. Put higher numeric Smile IDs first in each.
  function newestSmileFirst(leftId, rightId) {
    return smileIdOrder.compare(rightId, leftId);
  }

  // Keep the original nodes and their handlers. Leave nodes in place on repeat renders.
  function arrangePackChildren(parent, ordered) {
    let next = null;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const node = ordered[i];
      if (node.parentNode !== parent || node.nextElementSibling !== next) parent.insertBefore(node, next);
      next = node;
    }
  }

  // LESP v1 stores the reserved name in English, independent of the UI locale.
  const packUnsortedName = 'Unsorted';

  function isUnsortedPackName(name) {
    return name.toLowerCase() === packUnsortedName.toLowerCase();
  }

  function displayPackName(name) {
    return isUnsortedPackName(name) ? t('Unsorted') : name;
  }
  const packProtectionChecks = new Map();
  let renderPackLibrary = () => {};

  function refreshPackLibrary() {
    renderPackLibrary();
  }

  function makePackElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function makePackButton(text, action, className = 'lscp-button') {
    const button = makePackElement('button', className, text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }

  function installPackStyles() {
    if (document.querySelector('#lscp-pack-styles')) return;
    const style = document.createElement('style');
    style.id = 'lscp-pack-styles';
    style.textContent = `
      .lscp-install { margin-inline-start: 8px; cursor: pointer; }
      .lscp-toolbar, .lscp-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      .lscp-toolbar { margin: 12px 0; }
      .lscp-button { padding: 4px 10px; border: 1px solid #aaa; border-radius: 5px;
        background: white; color: #222; font: inherit; font-size: 14px; cursor: pointer; }
      .lscp-button:hover:enabled { background: #f0f4ef; border-color: #6a8168; }
      .lscp-button:disabled { opacity: .5; cursor: default; }
      .lscp-pack { margin-block: 6px; border: 1px solid #d2d2d2; border-radius: 4px; text-align: start; }
      .lscp-pack > summary { cursor: pointer; padding: 7px 10px; overflow-wrap: anywhere; font-weight: 600; }
      .lscp-pack > .lscp-actions { padding: 4px 10px; }
      .lscp-library-cards { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 8px; }
      .lscp-library-card { display: grid; gap: 6px; width: max-content; max-width: 100%; }
      .lscp-library-card[hidden] { display: none; }
      .lscp-library-card > .one_smile { margin: 0; }
      .lscp-library-card > select { max-width: 166px; }
      .lscp-library-card > label { display: flex; align-items: start; gap: 4px; font-size: 12px; }
      .lscp-library-card > label > input { flex: none; }
      .lscp-library-card > label > span { max-width: 132px; }
      .lscp-picker-pack { margin-inline: 4px; }
      .lscp-picker-cards { display: flow-root; }
      .list_smile .one_smile:has(> .lscp-picker-lock) { position: relative; }
      .lscp-picker-lock { position: absolute; inset-block-start: 1px; inset-inline-end: 1px;
        width: 16px; height: 16px; line-height: 0; pointer-events: none; }
      .lscp-picker-lock svg { width: 100%; height: 100%; }
    `;
    document.head.append(style);
  }

  function makePackGroup(className, open) {
    const details = makePackElement('details', className);
    details.open = open;
    const summary = document.createElement('summary');
    details.append(summary);
    return { details, summary };
  }

  function requestPackName(currentName = '') {
    const name = window.prompt(currentName ? t('Rename Smile pack') : t('Name your Smile pack'), currentName);
    if (name === null) return null;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) {
      window.alert(t('Enter a pack name between 1 and 80 characters.'));
      return null;
    }
    return trimmed;
  }

  function checkPackName(state, name, exceptId) {
    const key = name.toLowerCase();
    if (isUnsortedPackName(name) || key === russian['Unsorted'].toLowerCase() || state.packs.some(pack => pack.id !== exceptId && pack.name.toLowerCase() === key)) {
      throw new LocalizedError(t('That pack name is already in use. Choose another name.'));
    }
  }

  function assignSmilePack(smileId, packId) {
    return changePackState(state => {
      if (!packId) {
        delete state.members[smileId];
        return;
      }
      if (!state.packs.some(pack => pack.id === packId)) {
        throw new LocalizedError(t('That Smile pack is no longer available.'));
      }
      state.members[smileId] = packId;
    });
  }

  function readLibraryProtection(entry) {
    if (!packProtectionChecks.has(entry.url)) {
      packProtectionChecks.set(entry.url, readOwnedCanvas(entry.url).then(
        canvas => hasNoCopyMark(canvas),
        () => null
      ));
    }
    return packProtectionChecks.get(entry.url);
  }

  function setupPackLibrary() {
    const list = document.querySelector('#list_smiles');
    if (!list) return;

    installPackStyles();
    const toolbar = makePackElement('div', 'lscp-toolbar');
    const status = makePackElement('span', 'lscp-pack-status');
    status.setAttribute('role', 'status');
    const showError = error => {
      status.textContent = displayError(error, 'Could not update the Smile pack.');
    };
    toolbar.append(makePackButton(t('New pack'), () => {
      const name = requestPackName();
      if (name === null) return;
      status.textContent = '';
      changePackState(state => {
        checkPackName(state, name);
        state.packs.push({ id: crypto.randomUUID(), name });
      }).catch(showError);
    }), status);
    list.before(toolbar);

    const drawLink = Array.from(list.parentElement.querySelectorAll('a[href]')).find(link => {
      const url = new URL(link.href, location.href);
      return url.origin === location.origin && url.pathname === '/settings' &&
        url.searchParams.get('new') === 'smile';
    });
    const install = makePackButton(t('Install pack'), openPackInstall, 'btn btn_green lscp-install');
    if (drawLink) drawLink.after(install);
    else toolbar.prepend(install);

    const groups = new Map();
    const tileByCard = new Map();
    const pendingProtection = new Set();
    const tileByWrapper = new WeakMap();
    const protectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          protectionObserver.unobserve(entry.target);
          checkProtection(tileByWrapper.get(entry.target));
        }
      }, { rootMargin: '100px' })
      : null;

    function queueProtection(tile) {
      if (tile.checked) return;
      if (protectionObserver) protectionObserver.observe(tile.wrapper);
      else checkProtection(tile);
    }

    function buildTile(card, entry) {
      const wrapper = makePackElement('div', 'lscp-library-card');
      const move = document.createElement('select');
      move.setAttribute('aria-label', t('Move Smile to pack'));
      move.title = t('Move Smile to pack');
      move.addEventListener('change', async () => {
        move.disabled = true;
        status.textContent = '';
        try {
          const destination = move.value;
          await assignSmilePack(entry.id, destination);
          const group = groups.get(destination);
          if (group) group.details.open = true;
        } catch (error) {
          showError(error);
          refreshPackLibrary();
        } finally {
          move.disabled = false;
        }
      });

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = true;
      checkbox.setAttribute('aria-label', t('Copy protection'));
      const caption = makePackElement('span', '', t('Checking copy protection…'));
      label.append(checkbox, caption);

      const tile = { wrapper, move, checkbox, caption, entry, protected: null, checked: false };
      checkbox.addEventListener('change', async () => {
        const desired = checkbox.checked;
        checkbox.checked = tile.protected;
        if (pendingProtection.has(entry.id)) return;
        pendingProtection.add(entry.id);
        checkbox.disabled = true;
        move.disabled = true;
        status.textContent = '';
        try {
          if (await changeOwnedProtection(entry, desired, move.value)) {
            status.textContent = desired
              ? t('The old library entry was replaced with the protected edition.')
              : t('The old library entry was replaced with the shareable edition.');
          }
        } catch (error) {
          showError(error);
        } finally {
          pendingProtection.delete(entry.id);
          checkbox.disabled = false;
          move.disabled = false;
        }
      });

      wrapper.append(card, move, label);
      tileByWrapper.set(wrapper, tile);
      return tile;
    }

    function checkProtection(tile) {
      if (tile.checked) return;
      tile.checked = true;
      readLibraryProtection(tile.entry).then(protectedSmile => {
        tile.protected = protectedSmile;
        tile.checkbox.checked = protectedSmile === true;
        tile.checkbox.disabled = protectedSmile === null || pendingProtection.has(tile.entry.id);
        tile.caption.textContent = protectedSmile === null ? t('Copy protection unavailable') : t('Copy protection');
        tile.checkbox.title = protectedSmile === null ? '' : t('Replace this library entry with the new sharing preference');
      });
    }

    function buildGroup(id) {
      const group = makePackGroup('lscp-pack', !id);
      const actions = makePackElement('div', 'lscp-actions');
      group.cards = makePackElement('div', 'lscp-library-cards');
      if (id) {
        actions.append(makePackButton(t('Rename'), () => {
          const name = requestPackName(group.name);
          if (name === null || name === group.name) return;
          status.textContent = '';
          changePackState(state => {
            const pack = state.packs.find(pack => pack.id === id);
            if (!pack) throw new LocalizedError(t('That Smile pack is no longer available.'));
            checkPackName(state, name, id);
            pack.name = name;
          }).catch(showError);
        }));
      }
      group.download = makePackButton(t('Download pack'), () => openPackExport(group.name, group.entries, id ? group.name : packUnsortedName));
      actions.append(group.download);
      group.details.append(actions, group.cards);
      group.details.addEventListener('toggle', () => {
        if (!group.details.open) return;
        for (const tile of group.tiles) queueProtection(tile);
      });
      return group;
    }

    const observer = new MutationObserver(() => renderPackLibrary());
    function observeLibrary() {
      observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src', 'data-id', 'hidden'] });
    }

    renderPackLibrary = () => {
      observer.disconnect();
      try {
        const state = readPackState();
        const namedPacks = new Map(state.packs.map(pack => [pack.id, pack.name]));
        const groupedTiles = new Map(['', ...namedPacks.keys()].map(id => [id, []]));
        const cards = getLibraryCards(list);
        for (const emptyMessage of list.querySelectorAll('.no_smiles')) {
          emptyMessage.hidden = cards.length > 0;
        }
        const currentCards = new Set(cards);
        for (const [card, tile] of tileByCard) {
          if (currentCards.has(card)) continue;
          protectionObserver?.unobserve(tile.wrapper);
          if (list.contains(card)) {
            tile.wrapper.hidden = true;
          } else {
            tile.wrapper.remove();
            tileByCard.delete(card);
          }
        }
        const options = [{ id: '', name: t('Unsorted') }, ...state.packs];
        const optionsKey = JSON.stringify(options);
        for (const card of cards) {
          const entry = libraryEntry(card);
          if (!entry) continue;
          let tile = tileByCard.get(card);
          if (tile && (tile.entry.id !== entry.id || tile.entry.url !== entry.url)) {
            const previous = tile;
            tile = buildTile(card, entry);
            protectionObserver?.unobserve(previous.wrapper);
            previous.wrapper.remove();
            tileByCard.set(card, tile);
          }
          if (!tile) {
            tile = buildTile(card, entry);
            tileByCard.set(card, tile);
          }
          tile.wrapper.hidden = false;
          if (tile.optionsKey !== optionsKey) {
            tile.move.replaceChildren(...options.map(({ id, name }) => new Option(name, id)));
            tile.optionsKey = optionsKey;
          }
          const savedId = state.members[entry.id];
          const groupId = namedPacks.has(savedId) ? savedId : '';
          tile.move.value = groupId;
          groupedTiles.get(groupId).push(tile);
        }
        for (const [id, tiles] of groupedTiles) {
          tiles.sort((a, b) => newestSmileFirst(a.entry.id, b.entry.id));
          if (!groups.has(id)) groups.set(id, buildGroup(id));
          const group = groups.get(id);
          group.name = namedPacks.get(id) ?? t('Unsorted');
          group.tiles = tiles;
          group.entries = tiles.map(tile => tile.entry);
          group.summary.textContent = `${group.name} (${tiles.length})`;
          group.download.disabled = !tiles.length;
          group.cards.hidden = !tiles.length;
          if (group.details.parentElement !== list) list.append(group.details);
          arrangePackChildren(group.cards, tiles.map(tile => tile.wrapper));
          if (group.details.open) tiles.forEach(queueProtection);
        }
        for (const [id, group] of groups) {
          if (groupedTiles.has(id)) continue;
          group.details.remove();
          groups.delete(id);
        }
      } catch (error) {
        showError(error);
      } finally {
        observeLibrary();
      }
    };

    document.addEventListener('lsc-packs-changed', refreshPackLibrary);
    refreshPackLibrary();
  }

  function makeProtectionLock() {
    const badge = makePackElement('span', 'lscp-picker-lock');
    badge.title = t('This Smile is protected from collection');
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', badge.title);
    badge.innerHTML = `<svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path d="M6 9V6a4 4 0 0 1 8 0v3" fill="none" stroke="#fff" stroke-width="3.7"/>
      <path d="M6 9V6a4 4 0 0 1 8 0v3" fill="none" stroke="#111" stroke-width="1.6"/>
      <rect x="3.4" y="8" width="13.2" height="10" rx="2" fill="#111" stroke="#fff" stroke-width="1.1"/>
      <path d="M10 12v2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`;
    return badge;
  }

  function setupPackPickers() {
    const pickerGroups = new WeakMap();
    const pickerEntries = '.one_smile[data-id]';
    const checkedUrls = new WeakMap();
    let scheduled = false;

    async function labelPickerSmile(card) {
      const entry = libraryEntry(card);
      if (!entry || checkedUrls.get(card) === entry.url) return;
      checkedUrls.set(card, entry.url);
      card.querySelector(':scope > .lscp-picker-lock')?.remove();
      const protectedSmile = await readLibraryProtection(entry);
      if (!protectedSmile || !card.isConnected || libraryEntry(card)?.url !== entry.url) return;
      card.append(makeProtectionLock());
    }

    const badgeObserver = new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) {
          badgeObserver.unobserve(target);
          labelPickerSmile(target);
        }
      }
    });

    function renderPicker(list, state) {
      const entries = Array.from(list.querySelectorAll(pickerEntries));
      entries.sort((a, b) => newestSmileFirst(a.dataset.id, b.dataset.id));
      for (const card of entries) {
        if (checkedUrls.get(card) !== libraryEntry(card)?.url) badgeObserver.observe(card);
      }
      const groups = pickerGroups.get(list) ?? new Map();
      pickerGroups.set(list, groups);
      for (const group of groups.values()) {
        if (group.details.parentElement !== list) group.cards.replaceChildren();
      }
      const byId = new Map(state.packs.map(pack => [pack.id, []]));
      byId.set('', []);
      for (const entry of entries) {
        const packId = state.members[entry.getAttribute('data-id')];
        (byId.get(packId) ?? byId.get('')).push(entry);
      }

      const scrollTop = list.scrollTop;
      const available = [{ id: '', name: t('Unsorted') }, ...state.packs];
      const showGroups = state.packs.length > 0;
      const visibleGroups = new Set();
      for (const { id, name } of available) {
        const cards = byId.get(id);
        if (!cards.length) continue;
        if (!showGroups) {
          arrangePackChildren(list, cards);
          continue;
        }
        visibleGroups.add(id);
        if (!groups.has(id)) {
          const group = makePackGroup('lscp-pack lscp-picker-pack', !id);
          group.cards = makePackElement('div', 'lscp-picker-cards');
          const actions = makePackElement('div', 'lscp-actions');
          actions.append(makePackButton(t('Download pack'), () => openPackExport(group.name, group.entries, id ? group.name : packUnsortedName)));
          group.details.append(actions, group.cards);
          groups.set(id, group);
        }
        const group = groups.get(id);
        group.name = name;
        group.entries = cards.map(libraryEntry).filter(Boolean);
        const title = `${name} (${cards.length})`;
        if (group.summary.textContent !== title) group.summary.textContent = title;
        arrangePackChildren(group.cards, cards);
      }
      for (const [id, group] of groups) {
        if (!visibleGroups.has(id)) group.details.remove();
        if (!byId.has(id)) groups.delete(id);
      }
      arrangePackChildren(list, Array.from(visibleGroups, id => groups.get(id).details));
      list.scrollTop = scrollTop;
    }

    function renderPickers() {
      scheduled = false;
      const lists = document.querySelectorAll(packPickerSelector);
      if (!lists.length) return;
      let state;
      try {
        state = readPackState();
      } catch {
        return;
      }
      installPackStyles();
      for (const list of lists) renderPicker(list, state);
    }

    function schedulePickers() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(renderPickers);
    }

    function containsPicker(node) {
      return node instanceof Element && (node.matches(packPickerSelector) || node.querySelector(packPickerSelector));
    }

    new MutationObserver(records => {
      if (records.some(({ target, addedNodes }) => {
        if (target instanceof Element && target.matches(packPickerSelector)) return true;
        return Array.from(addedNodes).some(containsPicker);
      })) schedulePickers();
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('lsc-packs-changed', schedulePickers);
    schedulePickers();
  }


  if (!onSettings) setupCollector();
  if (profile) {
    window.addEventListener('storage', event => {
      if (event.key === storageKey || event.key === null) document.dispatchEvent(new Event('lsc-packs-changed'));
    });
    if (onSettings) {
      if (query.get('new') === 'smile') setupEditorProtection();
      if (query.get('act') === 'smiles') setupPackLibrary();
    } else {
      setupPackPickers();
    }
  }
})();
