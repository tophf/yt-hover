'use strict';

window.running === undefined && (() => {

  window.running = true;

  const CLASSNAME = 'ihvyoutube';
  const ASPECT_RATIO = 16 / 9;
  const LINK_SELECTOR = 'a[href*="//www.youtube.com/"], a[href*="//youtu.be/"]';
  const isYoutubePage = location.hostname === 'www.youtube.com';

  const observer = new MutationObserver(() => {
    document.addEventListener('mouseover', mouseover, {passive: true});
    observer.disconnect();
  });
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
  const hover = {
    x: 0,
    y: 0,
    curX: 0,
    curY: 0,
    focus: false,
    /** @type Element */
    target: null,
  };

  window.dispatchEvent(new Event(chrome.runtime.id));
  window.addEventListener(chrome.runtime.id, selfDestruct);

  chrome.storage.onChanged.addListener(onStorageChanged);

  chrome.storage.local.get(config, prefs => {
    config = {...window.DEFAULTS, ...prefs};
    if (isYoutubePage && (!config.youtube || top !== window))
      return;
    registerListeners();
  });

  function registerListeners() {
    document.addEventListener('mouseover', mouseover, {passive: true});
    document.addEventListener('click', click);
    if (iframe)
      document.addEventListener('keydown', keydown);
  }

  function selfDestruct() {
    // do nothing if we're still alive, probably someone tries to "hack" us
    if (chrome.i18n)
      return;
    iframe = null;
    observer.disconnect();
    window.removeEventListener(chrome.runtime.id, selfDestruct);
    document.removeEventListener('mouseover', mouseover);
    document.removeEventListener('click', click);
    document.removeEventListener('keydown', keydown);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    clearTimeout(timer);
  }

  function onStorageChanged(prefs) {
    Object.keys(prefs).forEach(name => {
      config[name] = prefs[name].newValue;
    });
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
    registerListeners();
  }

  /** @param {DOMRect} rect */
  function setRelativePos(rect) {
    const w = config.width;
    const h = w / ASPECT_RATIO;
    const maxLeft = scrollX + innerWidth - w - 10;
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
  function mouseover(e) {
    if (timer) {
      document.removeEventListener('mousemove', mousemove);
      clearTimeout(timer);
      timer = 0;
    }
    if (iframe)
      return;

    const target = e.target;
    const numBad = badBubblePath.indexOf(target) + 1;
    if (numBad) {
      badBubblePath.splice(0, numBad);
    } else {
      badBubblePath = e.composedPath().slice(1);
      const a = target.closest('a');
      if (a && processLink(a)) {
        lastLink = a;
        hover.x = e.pageX;
        hover.y = e.pageY;
        hover.target = e.target;
        hover.focus = document.hasFocus();
        document.addEventListener('mousemove', mousemove, {passive: true});
      }
    }

    if (!isYoutubePage) {
      lastLink = document.contains(lastLink) ? lastLink : document.querySelector(LINK_SELECTOR);
      if (!lastLink) {
        document.removeEventListener('mouseover', mouseover);
        observer.observe(document.body, observerConfig);
      }
    }
  }

  /**
   * @param {MouseEvent} e
   */
  function mousemove(e) {
    hover.curX = e.pageX;
    hover.curY = e.pageY;
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
      timer = setTimeout(mouseoverTimer, config.delay, id, params.get('t'), link, isShared);
      return true;
    }
  }

  function mouseoverTimer(id, time, link, isShared) {
    if (Math.abs(hover.curX - hover.x) > config.maxMovement ||
        Math.abs(hover.curY - hover.y) > config.maxMovement) {
      hover.x = hover.curX;
      hover.y = hover.curY;
      timer = setTimeout(mouseoverTimer, config.delay, ...arguments);
      return;
    }
    timer = 0;
    document.removeEventListener('mousemove', mousemove);
    if (hover.focus !== document.hasFocus() ||
        !hover.target.matches(':hover') ||
        !link.matches(':hover'))
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

  function click(e) {
    clearTimeout(timer);
    if (iframe && !e.target.closest(`.${CLASSNAME}`)) {
      iframe = null;
      for (const el of $$(`.${CLASSNAME}`))
        el.remove();
      e.preventDefault();
      document.removeEventListener('keydown', keydown);
    }
  }

  function keydown(e) {
    if (iframe && e.code === 'Escape') {
      document.body.dispatchEvent(new Event('click', {bubbles: true}));
      e.preventDefault();
    }
  }

  function $$(selector, base = document) {
    return base.querySelectorAll(selector);
  }

})();
