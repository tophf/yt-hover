'use strict';

window.running === undefined && (() => {

  window.running = true;

  const CLASSNAME = 'ihvyoutube';
  const ASPECT_RATIO = 16 / 9;

  let iframe;
  let timer;
  let badBubblePath = [];

  let config = {...window.DEFAULTS};

  window.dispatchEvent(new Event(chrome.runtime.id));
  window.addEventListener(chrome.runtime.id, function unregisterListeners() {
    // do nothing if we're still alive, probably someone tries to "hack" us
    if (chrome.i18n)
      return;
    window.removeEventListener(chrome.runtime.id, unregisterListeners);
    document.removeEventListener('mouseover', mouseover);
    document.removeEventListener('click', click);
    document.removeEventListener('keydown', keydown);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    clearTimeout(timer);
  });

  chrome.storage.onChanged.addListener(onStorageChanged);

  chrome.storage.local.get(config, prefs => {
    config = prefs;
    if (location.hostname === 'www.youtube.com' && (!config.youtube || top !== window))
      return;
    registerListeners();
  });

  function registerListeners() {
    document.addEventListener('mouseover', mouseover, {passive: true});
    document.addEventListener('click', click);
    if (iframe)
      document.addEventListener('keydown', keydown);
  }

  function onStorageChanged(prefs) {
    Object.keys(prefs).forEach(name => {
      config[name] = prefs[name].newValue;
    });
  }

  function createPlayer(id, time = '0', rect, isShared) {
    const [, h, m, s] = /(?:(\d+)h)?(?:(\d+)m)?(\d+)s/.exec(time) || [];
    if (s)
      time = Number(s) + (m || 0) * 60 + (h || 0) * 3600;
    const src = `https://www.youtube.com/embed/${id}?${
      new URLSearchParams({
        fs: 1,
        autoplay: 1,
        enablejsapi: 1,
        start: time,
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
    const body = document.body;
    const html = document.documentElement;

    const w = config.width;
    const h = w / ASPECT_RATIO;

    const x1 = Math.max(0, rect.left + body.scrollLeft + html.scrollLeft + config['relative-x']);
    const y1 = Math.max(0, rect.bottom + body.scrollTop + html.scrollTop + config['relative-y']);
    const vw = Math.max(html.scrollWidth, body.scrollWidth);
    const vh = Math.max(html.scrollHeight, body.scrollHeight);

    const left = x1 + w <= vw - 10 ? x1 : vw - w - 10;
    const top = y1 + h <= vh - 10 ? y1 : vh - h - 10;

    iframe.setAttribute('style', `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
    `);

    if (config.scroll) {
      window.scrollTo({
        left: Math.max(body.scrollLeft, left + w - html.clientWidth + 10),
        top: Math.max(body.scrollTop, top + h - html.clientHeight + 10),
        behavior: config.smooth ? 'smooth' : 'auto',
      });
    }
  }

  function mouseover(e) {
    if (timer) {
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
      badBubblePath = e.path.slice(1);
      const a = target.closest('a');
      if (a)
        processLink(a);
    }
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
    if (id)
      timer = setTimeout(mouseoverTimer, config.delay, id, params.get('t'), link, isShared);
  }

  function mouseoverTimer(id, time, link, isShared) {
    const rect = link.getBoundingClientRect();
    createPlayer(id, time, rect, isShared);
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
