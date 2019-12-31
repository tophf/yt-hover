'use strict';

window.running === undefined && (() => {

  window.running = true;

  const CLASSNAME = 'ihvyoutube';
  const ASPECT_RATIO = 16 / 9;
  const LINK_SELECTOR = 'a[href*="//www.youtube.com/"], a[href*="//youtu.be/"]';
  const isYoutubePage = location.hostname === 'www.youtube.com';

  let observer;
  const observerConfig = {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  };

  let iframe;
  let timer;
  let config = {...window.DEFAULTS};
  let badBubblePath = [];
  let lastLink = null;

  let hoverX = 0;
  let hoverY = 0;
  let hoverUrl = '';
  let hoverDistance = 0;
  let hoverFocus = false;
  /** @type Element */
  let hoverTarget = null;

  window.dispatchEvent(new Event(chrome.runtime.id));
  window.addEventListener(chrome.runtime.id, selfDestruct);

  chrome.storage.onChanged.addListener(onStorageChanged);

  chrome.storage.local.get(config, prefs => {
    config = {...window.DEFAULTS, ...prefs};
    if (isYoutubePage && (!config.youtube || top !== window))
      return;
    setHoverListener(true);
  });

  function onMutation() {
    setHoverListener(true);
    observer.disconnect();
  }

  function setHoverListener(enable) {
    const method = enable ? 'addEventListener' : 'removeEventListener';
    document[method]('mouseover', onmouseover, enable ? {passive: true} : undefined);
  }

  function setHoverCancelers(enable) {
    const method = enable ? 'addEventListener' : 'removeEventListener';
    if (iframe || !enable) {
      document[method]('click', onclick);
      document[method]('keydown', onkeydown);
    }
  }

  function selfDestruct() {
    // do nothing if we're still alive, probably someone tries to "hack" us
    if (chrome.i18n)
      return;
    iframe = null;
    if (observer)
      observer.disconnect();
    window.removeEventListener(chrome.runtime.id, selfDestruct);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    setHoverListener(false);
    setHoverCancelers(false);
    stopTimer();
  }

  function onStorageChanged(prefs) {
    Object.keys(prefs).forEach(name => {
      config[name] = prefs[name].newValue;
    });
    if (isYoutubePage && !!prefs.youtube.oldValue !== !!prefs.youtube.newValue)
      setHoverListener(config.youtube);
  }

  function createPlayer(id, time, rect, isShared) {
    const [, h, m, s] = /(?:(\d+)h)?(?:(\d+)m)?(\d+)s/.exec(time) || [];
    if (s)
      time = Number(s) + (m || 0) * 60 + (h || 0) * 3600;
    const src = `https://www.youtube.com/embed/${id}?${
      new URLSearchParams({
        fs: 1,
        autoplay: 1,
        enablejsapi: 1,
        // time may be |null| so we can't use a default parameter value
        start: time || 0,
      }).toString()
    }`;
    iframe = Object.assign(document.createElement('iframe'), {
      className: CLASSNAME,
      width: config.width,
      height: config.width / ASPECT_RATIO,
      sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
      allowFullscreen: true,
      // unload the gif loader when player is loaded
      onload() {
        window.setTimeout(() => {
          if (iframe)
            iframe.dataset.loaded = true;
        }, 10000);
      },
    });

    if (config.mode === 1) {
      // center of screen
      iframe.style = `
        position: fixed;
        left: calc(50% - ${config.width / 2 - config['center-x']}px);
        top: calc(50% - ${config.width / ASPECT_RATIO / 2 - config['center-y']}px);
      `;
    } else {
      // relative to the link
      setRelativePos(rect);
    }

    if (!isShared) {
      iframe.src = src;
    } else {
      chrome.runtime.sendMessage({cmd: 'findId', id}, id => {
        if (id)
          iframe.src = src;
        else
          iframe.dataset.error = true;
      });
    }

    iframe.dataset.dark = config.dark;
    document.body.appendChild(iframe);
    setHoverCancelers(true);
  }

  /** @param {DOMRect} rect */
  function setRelativePos(rect) {
    const w = config.width;
    const h = w / ASPECT_RATIO;
    const se = document.scrollingElement;
    const maxLeft = scrollX + innerWidth - w - 10 - (se.scrollHeight > se.offsetHeight ? 30 : 0);
    const left = Math.max(0, Math.min(maxLeft, rect.left + scrollX + config['relative-x']));
    const top = Math.max(0, rect.bottom + scrollY + config['relative-y']);

    iframe.setAttribute('style', `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
    `);

    if (config.scroll) {
      const revealX = left < scrollX || left + w > innerWidth + scrollX;
      const revealTop = top < scrollY;
      const revealBottom = top + h > innerHeight + scrollY;
      if (revealX || revealTop || revealBottom) {
        scrollTo({
          left: revealX ? left : scrollX,
          top: Math.max(0,
            revealTop ? top - 10 :
              revealBottom ? top + h - innerHeight + 10 :
                scrollY),
          behavior: config.smooth ? 'smooth' : 'auto',
        });
      }
    }
  }

  /**
   * @param {MouseEvent} e
   */
  function onmouseover(e) {
    if (timer) {
      document.removeEventListener('mousemove', onmousemove);
      document.removeEventListener('auxclick', onclick);
      stopTimer();
    }
    if (iframe)
      return;
    const {target} = e;
    const numBad = badBubblePath.indexOf(target) + 1;
    if (numBad) {
      badBubblePath.splice(0, numBad);
    } else {
      badBubblePath = e.composedPath().slice(1);
      const a = target.closest('a');
      if (a && processLink(a)) {
        lastLink = a;
        hoverX = e.pageX;
        hoverY = e.pageY;
        hoverTarget = e.target;
        hoverFocus = document.hasFocus();
        hoverUrl = location.href;
        document.addEventListener('mousemove', onmousemove, {passive: true});
        document.addEventListener('auxclick', onclick, {passive: true});
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

  /**
   * @param {MouseEvent} e
   */
  function onmousemove({pageX: x, pageY: y}) {
    hoverDistance += Math.sqrt((x - hoverX) ** 2 + (y - hoverY) ** 2);
    hoverX = x;
    hoverY = y;
  }

  /**
   * @param {MouseEvent} e
   */
  function onclick(e) {
    if (e.type === 'click' ||
        e.button === 2 && hoverTarget && withinBounds(hoverTarget, e.target)) {
      stopTimer();
      if (iframe && !e.target.closest(`.${CLASSNAME}`))
        removePlayer(e);
    }
  }

  /**
   * @param {MouseEvent} e
   */
  function onkeydown(e) {
    if (iframe && e.code === 'Escape')
      removePlayer(e);
  }

  /**
   * @param {HTMLAnchorElement} link
   */
  function processLink(link) {
    const h = link.hostname;
    const isYT = h === 'www.youtube.com' || h === 'youtube.com';
    const isYTbe = h === 'youtu.be';
    if (!isYT && !isYTbe)
      return;

    const p = link.pathname;
    let isShared, isAttribution, isWatch;
    if (isYT) {
      if (p.startsWith('/shared'))
        isShared = true;
      else if (p.startsWith('/attribution_link'))
        isAttribution = true;
      else if (p.startsWith('/watch'))
        isWatch = true;
      else
        return;
    }

    let params = new URLSearchParams(link.search);
    let id;
    if (isYTbe) {
      id = p.split('/')[1];
    } else if (isWatch) {
      id = params.get('v');
    } else if (isAttribution) {
      params = new URLSearchParams(params.get('u').split('?')[1]);
      id = params.get('v');
    } else if (isShared) {
      id = params.get('ci');
    }
    if (id) {
      setTimer(id, params.get('t'), link, isShared);
      return true;
    }
  }

  function setTimer() {
    hoverDistance = 0;
    timer = setTimeout(onTimer, config.delay, ...arguments);
  }

  function onTimer(id, time, link, isShared) {
    if (hoverDistance > config.maxMovement) {
      setTimer.apply(0, arguments);
      return;
    }
    timer = 0;
    document.removeEventListener('mousemove', onmousemove);
    if (hoverFocus !== document.hasFocus() ||
        !hoverTarget.matches(':hover') ||
        !link.matches(':hover') ||
        hoverUrl !== location.href)
      return;

    createPlayer(id, time, link.getBoundingClientRect(), isShared);
    if (config.strike) {
      for (const el of [...$$(`a[href="${link.href}"]`), link])
        el.style['text-decoration'] = 'line-through';
    }
    if (config.history) {
      chrome.runtime.sendMessage({
        url: link.href,
        cmd: 'history',
      });
    }
  }

  function removePlayer(event) {
    event.preventDefault();
    iframe = null;
    for (const el of $$(`.${CLASSNAME}`))
      el.remove();
    setHoverCancelers(false);
    stopTimer();
  }

  function stopTimer() {
    if (timer)
      clearTimeout(timer);
    timer = 0;
  }

  function $$(selector, base = document) {
    return base.querySelectorAll(selector);
  }

  function withinBounds(outer, inner) {
    const bO = outer.getBoundingClientRect();
    const b = inner.getBoundingClientRect();
    return bO.left <= b.left &&
           bO.top <= b.top &&
           bO.right >= b.right &&
           bO.bottom >= b.bottom;
  }
})();
