'use strict';

window.INJECTED !== 1 && (() => {
  window.INJECTED = 1;

  const LINK_SELECTOR = 'a[href*="//www.youtube.com/"], a[href*="//youtu.be/"]';
  const isYoutubePage = location.hostname === 'www.youtube.com';

  const observerConfig = {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  };
  let observer;

  let lastLink = null;
  let timer;
  let hotkey;
  let hoverX = Infinity;
  let hoverY = Infinity;
  let hoverUrl = '';
  let hoverDistance = 0;
  let hoverFocus = false;
  /** @type Element */
  let hoverTarget = null;

  const app = window.app = {
    isYoutubePage,
    /** @type YT.Config */
    config: {},
    hover: {
      /** @param {MouseEvent} e */
      onclick(e) {
        stopTimer();
        if (e.button !== 2 && e.target !== app.player.element)
          app.player.remove(e);
        hoverX = e.pageX;
        hoverY = e.pageY;
      },
      stopTimer,
    },
    player: {
      remove: () => {},
    },
    sendCmd(cmd, ...args) {
      return new Promise((resolve, reject) =>
        chrome.runtime.sendMessage({cmd, args}, r =>
          chrome.runtime.lastError || 'error' in r ?
            reject((chrome.runtime.lastError || 0).message || r.error) :
            resolve(r.data)));
    },
  };

  const isAnchor = el =>
    el.localName === 'a';
  const isThumbnailYT = el =>
    el.localName === 'ytd-thumbnail';
  const isMovingThumbnailYT = el =>
    el.localName === 'ytd-moving-thumbnail-renderer' ||
    el.localName === 'ytd-thumbnail-overlay-toggle-button-renderer';
  const findYoutubeAnchor = (el, path) => {
    if (el.localName === 'a' ||
        el.localName === 'img' ||
        path.some(isMovingThumbnailYT) ||
        !path.some(isThumbnailYT))
      return path.find(isAnchor);
  };

  const selfEvent = chrome.runtime.id;
  dispatchEvent(new Event(selfEvent));
  addEventListener(selfEvent, selfDestruct);

  chrome.storage.onChanged.addListener(onStorageChanged);

  chrome.storage.sync.get(prefs => {
    app.config = prefs;
    toggleListener(true);
  });

  function onMutation() {
    toggleListener(true);
    observer.disconnect();
  }

  function toggleListener(on) {
    const onOff = `${on ? 'add' : 'remove'}EventListener`;
    if ((hotkey = app.config.hotkeyOn && app.config.hotkey)) {
      window[onOff]('keydown', maybeStart, true);
    } else
      window[onOff]('mouseover', maybeStart, on ? {passive: true} : undefined);
  }

  function onStorageChanged(prefs) {
    const hk = !hotkey !== !(prefs.hotkeyOn?.newValue && prefs.hotkey?.newValue);
    if (hk)
      toggleListener(false);
    for (const [k, v] of Object.entries(prefs))
      app.config[k] = v.newValue;
    if (hk)
      toggleListener(true);
  }

  function getKeyName(e) {
    const mod =
      (e.ctrlKey ? 'Ctrl-' : '') +
      (e.altKey ? 'Alt-' : '') +
      (e.shiftKey ? 'Shift-' : '');
    return e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift'
      ? mod.slice(0, -1)
      : mod + e.key;
  }

  /** @param {MouseEvent|KeyboardEvent} e */
  function maybeStart(e) {
    if (timer)
      stopAll();
    const isHotkey = e.key && hotkey && hotkey === getKeyName(e);
    if (app.player.element ||
        e.shiftKey && hotkey !== 'Shift' ||
        e.repeat ||
        (e.key ? !isHotkey : e.pageX === hoverX && e.pageY === hoverY))
      return;
    if (isHotkey)
      e.preventDefault();
    hoverX = e.pageX;
    hoverY = e.pageY;
    const path = isHotkey ? [...document.querySelectorAll(':hover')] : e.composedPath();
    const target = isHotkey && path[path.length - 1] || e.target;
    const a = isYoutubePage ? findYoutubeAnchor(target, path) : path.find(isAnchor);
    const info = a && processLink(a);
    if (info) {
      e.stopPropagation();
      lastLink = a;
      hoverTarget = target;
      hoverFocus = document.hasFocus();
      hoverUrl = location.href;
      hoverDistance = 0;
      if (e.key) {
        onTimer(info);
      } else {
        startTimer(info);
        addEventListener('mousemove', onMouseMove, {passive: true});
        addEventListener('mousedown', app.hover.onclick);
      }
    }

    if (!isYoutubePage) {
      lastLink = document.contains(lastLink) ? lastLink : document.querySelector(LINK_SELECTOR);
      if (!lastLink) {
        toggleListener(false);
        if (!observer)
          observer = new MutationObserver(onMutation);
        observer.observe(document.body, observerConfig);
      }
    }
  }

  /** @param {MouseEvent} e */
  function onMouseMove({target, pageX: x, pageY: y}) {
    if (isYoutubePage && target.closest('a [overlay-style], a [system-icons]')) {
      stopAll();
      return;
    }
    hoverDistance += Math.sqrt((x - hoverX) ** 2 + (y - hoverY) ** 2);
    hoverX = x;
    hoverY = y;
  }

  /** @param {HTMLAnchorElement} link */
  function processLink(link) {
    const h = link.hostname;
    const isYT = h === 'www.youtube.com' || h === 'youtube.com';
    const isYTbe = h === 'youtu.be';
    if (!isYT && !isYTbe)
      return;
    const p = link.pathname;
    const isShared = isYT && p.startsWith('/shared');
    let params = new URLSearchParams(link.search);
    let id;
    if (isYTbe) {
      id = p.split('/')[1];
    } else if (p.startsWith('/embed/')) {
      id = p.split('/')[2];
    } else if (p.startsWith('/watch')) {
      id = params.get('v');
    } else if (p.startsWith('/attribution_link')) {
      params = new URLSearchParams(params.get('u').split('?')[1]);
      id = params.get('v');
    } else if (isShared) {
      id = params.get('ci');
    }
    return id && {id, isShared, link, time: params.get('t')};
  }

  function startTimer(opts) {
    hoverDistance = 0;
    timer = setTimeout(onTimer, app.config.delay, opts);
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = 0;
  }

  function stopAll() {
    removeEventListener('mousemove', onMouseMove);
    removeEventListener('mousedown', app.hover.onclick);
    stopTimer();
  }

  async function onTimer(opts) {
    if (hoverDistance > app.config.maxMovement) {
      startTimer(opts);
      return;
    }
    timer = 0;
    document.removeEventListener('mousemove', onMouseMove);
    if (hoverFocus === document.hasFocus() &&
        hoverTarget.matches(':hover') &&
        opts.link.matches(':hover') &&
        hoverUrl === location.href) {
      if (!app.player.create)
        await import(chrome.runtime.getURL('/content/player.mjs'));
      app.player.create(opts);
    }
  }

  function selfDestruct() {
    try {
      // do nothing if we're still alive, probably someone tries to "hack" us
      if (chrome.i18n.getUILanguage()) return;
    } catch (e) {}
    if (observer) observer.disconnect();
    removeEventListener(selfEvent, selfDestruct);
    stopAll();
    toggleListener(false);
    app.player.remove();
  }
})();
