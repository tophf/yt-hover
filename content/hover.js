/* global DEFAULTS */
'use strict';

window.INJECTED !== 1 && (() => {
  window.INJECTED = 1;

  const LINK_SELECTOR = 'a[href*="//www.youtube.com/"], a[href*="//youtu.be/"]';
  const isYoutubePage = location.hostname === 'www.youtube.com';

  let observer;
  const observerConfig = {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  };

  let badBubblePath = [];
  let lastLink = null;

  let timer;
  let hoverX = 0;
  let hoverY = 0;
  let hoverUrl = '';
  let hoverDistance = 0;
  let hoverFocus = false;
  /** @type Element */
  let hoverTarget = null;

  const app = window.app = {
    config: {...DEFAULTS},
    hover: {
      /** @param {MouseEvent} e */
      onclick(e) {
        if (e.type === 'click' ||
            e.button === 2 && hoverTarget && withinBounds(hoverTarget, e.target)) {
          stopTimer();
          if (e.target !== app.player.element)
            app.player.remove(e);
        }
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

  chrome.storage.sync.get(app.config, prefs => {
    app.config = {...DEFAULTS, ...prefs};
    if (isYoutubePage && (!app.config.youtube || top !== window))
      return;
    setHoverListener(true);
  });

  function onMutation() {
    setHoverListener(true);
    observer.disconnect();
  }

  function setHoverListener(on) {
    document[`${on ? 'add' : 'remove'}EventListener`](
      'mouseover', onMouseOver, on ? {passive: true} : undefined);
  }

  function onStorageChanged(prefs) {
    Object.keys(prefs).forEach(name => {
      app.config[name] = prefs[name].newValue;
    });
    if (isYoutubePage && prefs.youtube && !!prefs.youtube.oldValue !== !!app.config.youtube)
      setHoverListener(app.config.youtube);
  }

  /** @param {MouseEvent} e */
  function onMouseOver(e) {
    if (timer) {
      removeEventListener('mousemove', onMouseMove);
      removeEventListener('auxclick', app.hover.onclick);
      stopTimer();
    }
    if (app.player.element)
      return;
    const {target} = e;
    const numBad = badBubblePath.indexOf(target) + 1;
    if (numBad) {
      badBubblePath.splice(0, numBad);
    } else {
      const path = e.composedPath();
      const a = isYoutubePage ? findYoutubeAnchor(target, path) : path.find(isAnchor);
      badBubblePath = path.slice(1);
      if (a && processLink(a)) {
        lastLink = a;
        app.hover.x = e.pageX;
        app.hover.y = e.pageY;
        hoverTarget = e.target;
        hoverFocus = document.hasFocus();
        hoverUrl = location.href;
        addEventListener('mousemove', onMouseMove, {passive: true});
        addEventListener('auxclick', app.hover.onclick);
      }
    }

    if (!isYoutubePage) {
      lastLink = document.contains(lastLink) ? lastLink : document.querySelector(LINK_SELECTOR);
      if (!lastLink) {
        setHoverListener(false);
        if (!observer)
          observer = new MutationObserver(onMutation);
        observer.observe(document.body, observerConfig);
      }
    }
  }

  /** @param {MouseEvent} e */
  function onMouseMove({pageX: x, pageY: y}) {
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
    if (id) {
      startTimer({id, isShared, link, time: params.get('t')});
      return true;
    }
  }

  function startTimer(opts) {
    hoverDistance = 0;
    timer = setTimeout(onTimer, app.config.delay, opts);
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = 0;
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
        await app.sendCmd('injectPlayer');
      app.player.create(opts);
    }
  }

  function withinBounds(outer, inner) {
    const bO = outer.getBoundingClientRect();
    const b = inner.getBoundingClientRect();
    return bO.left <= b.left &&
           bO.top <= b.top &&
           bO.right >= b.right &&
           bO.bottom >= b.bottom;
  }

  function selfDestruct() {
    try {
      // do nothing if we're still alive, probably someone tries to "hack" us
      if (chrome.i18n.getUILanguage()) return;
    } catch (e) {}
    if (observer) observer.disconnect();
    removeEventListener(selfEvent, selfDestruct);
    removeEventListener('mousemove', onMouseMove);
    removeEventListener('auxclick', app.hover.onclick);
    setHoverListener(false);
    app.player.remove();
  }
})();
