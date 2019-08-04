'use strict';

const CLASSNAME = 'ihvyoutube';
const ASPECT_RATIO = 16 / 9;

var iframe;
var timer;
var badBubblePath = [];

var config = {
  'relative-x': 0,
  'relative-y': 0,
  'center-x': 0,
  'center-y': 0,
  'delay': 1000,
  'width': 500,
  'mode': 0,
  'strike': true,
  'history': true,
  'scroll': true,
  'smooth': true,
  'dark': false,
  youtube: false
};

chrome.storage.onChanged.addListener(prefs => {
  Object.keys(prefs).forEach(name => {
    config[name] = prefs[name].newValue;
  });
});

chrome.storage.local.get(config, prefs => {
  config = prefs;
  if (location.hostname === 'www.youtube.com' && (!config.youtube || top !== window))
    return;
  document.addEventListener('mouseover', mouseover, {passive: true});
  document.addEventListener('click', click);
});

var smoothScroll = (function() {
  let timeLapsed = 0;
  let id, sx, sy, dx, dy, callback;

  const easingPattern = time => (time < 0.5) ?
    (8 * time * time * time * time) :
    (1 - 8 * (--time) * time * time * time);

  function step() {
    timeLapsed += 16;
    const percentage = timeLapsed / 400;
    if (percentage > 1) {
      window.scrollTo(sx + dx, sy + dy);
      return callback();
    }
    window.scrollTo(
      Math.floor(sx + (dx * easingPattern(percentage))),
      Math.floor(sy + (dy * easingPattern(percentage)))
    );
    id = window.setTimeout(step, 16);
  }

  return function(x, y, c) {
    clearTimeout(id);
    callback = c;
    timeLapsed = 0;
    sx = document.body.scrollLeft + document.documentElement.scrollLeft;
    sy = document.body.scrollTop + document.documentElement.scrollTop;
    dx = Math.max(0, x - sx);
    dy = Math.max(0, y - sy);
    if (dx === 0 && dy === 0) {
      return c();
    }
    step();
  };
})();

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

  let startPlaying = true;
  if (config.mode === 1) { // center of screen
    iframe.style = `
      position: fixed;
      left: calc(50% - ${config.width / 2 - config['center-x']}px);
      top: calc(50% - ${config.width / ASPECT_RATIO / 2 - config['center-y']}px);
    `;
  }
  else {
    const {x, y, left, top} = calcRelativePos(rect);
    iframe.setAttribute('style', `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
    `);
    if (config.scroll) {
      if (config.smooth) {
        smoothScroll(x, y, play);
        startPlaying = false;
      } else {
        window.scrollTo(x, y);
      }
    }
  }
  if (startPlaying)
    play();
  iframe.dataset.dark = config.dark;
  document.body.appendChild(iframe);
  document.addEventListener('keydown', keydown);

  function play() {
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
  }
}

/**
 * @param {DOMRect} rect
 * @return {{x?: number, y?: number, top: number, left: number}}
 */
function calcRelativePos(rect) {
  const body = document.body;
  const html = document.documentElement;

  const x1 = Math.max(0, rect.left + body.scrollLeft + html.scrollLeft + config['relative-x']);
  const y1 = Math.max(0, rect.bottom + body.scrollTop + html.scrollTop + config['relative-y']);
  const x2 = x1 + config.width;
  const y2 = y1 + config.width / ASPECT_RATIO;

  const vw = Math.max(html.scrollWidth, body.scrollWidth);
  const vh = Math.max(html.scrollHeight, body.scrollHeight);

  const left = x2 <= vw - 10 ? x1 : vw - config.width - 10;
  const top = y2 <= vh - 10 ? y1 : vh - config.width / ASPECT_RATIO - 10;

  let x, y;
  if (config.scroll) {
    x = Math.max(body.scrollLeft, left + config.width - html.clientWidth + 10);
    y = Math.max(body.scrollTop, top + config.width / ASPECT_RATIO - html.clientHeight + 10);
  }

  return {x, y, left, top};
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
    if (a) processLink(a);
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
