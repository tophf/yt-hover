/* global app */

const ASPECT_RATIO = 16 / 9;
const MIN_WIDTH = 200;
const PROGRESS_CURSOR = 'progress';
const {STYLES} = await import(chrome.runtime.getURL('/content/player-styles.mjs'));
for (const k in STYLES)
  STYLES[k] = cssImportant(STYLES[k]);

const {app} = window;

let dom = {
  /** @type HTMLIFrameElement | HTMLVideoElement */
  actor: null,
  /** @type string */
  oldCursor: null,
  /** @type HTMLElement */
  player: null,
  /** @type HTMLElement */
  resizers: null,
  /** @type HTMLStyleElement */
  style: null,
};

const shifter = {
  SUPPRESSED_EVENTS: [
    'mouseenter',
    'mouseleave',
    'mouseover',
  ],
  /** @param {MouseEvent} e */
  onMouseDown(e) {
    shifter.consume(e);
    const data = (e || shifter).target === dom.player ? shifter.move : shifter.resize;
    const method = `${e ? 'add' : 'remove'}EventListener`;
    document[method]('mousemove', data.handler);
    document[method]('mouseup', shifter.onMouseUp);
    document[method]('selectionchange', shifter.onSelection);
    for (const type of shifter.SUPPRESSED_EVENTS)
      window[method](type, shifter.consume, true);
    dom.resizers.classList.toggle('moving', !!e);
    if (e) {
      data.x0 = data.x;
      data.y0 = data.y;
      data.clientX = e.clientX;
      data.clientY = e.clientY;
      shifter.data = data;
      shifter.target = this;
      const cursor = STYLES.cursor.replace('%', data.cursor);
      shifter.cursorStyle = cssAppend(cursor);
      shifter.fence = document.body.appendChild($div()).attachShadow({mode: 'closed'});
      shifter.fence.appendChild($create('style', STYLES.fence + cursor));
    }
  },
  /** @param {MouseEvent} e */
  onMouseUp(e) {
    shifter.consume(e);
    shifter.onMouseDown(false);
    shifter.target = null;
    addEventListener('click', shifter.consumeClick, true);
    if (app.config.native) {
      const {clientX, clientY} = shifter.move;
      if (clientX === e.clientX &&
          clientY === e.clientY)
        dom.actor[dom.actor.paused ? 'play' : 'pause']();
    }
  },
  onSelection() {
    const sel = getSelection();
    if (!sel.empty()) sel.removeAllRanges();
  },
  consume(e) {
    if (e instanceof Event) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  },
  consumeClick(e) {
    shifter.consume(e);
    shifter.fence.host.remove();
    dom.style.sheet.deleteRule(shifter.cursorStyle._ruleIndex);
    removeEventListener('click', shifter.consumeClick, true);
  },
  stop: () => {
    shifter.data.handler(shifter.data);
    shifter.onMouseUp();
  },
  move: {
    x: 0,
    y: 0,
    cursor: 'move',
    /** @param {MouseEvent} e */
    handler(e) {
      shifter.consume(e);
      const {move} = shifter;
      const {x0, y0, clientX, clientY} = move;
      move.to(x0 + e.clientX - clientX, y0 + e.clientY - clientY);
    },
    init() {
      const {move} = shifter;
      move.x = move.y = 0;
      move.style = cssAppend(':host {}');
    },
    to(x, y) {
      const {move} = shifter;
      move.x = x;
      move.y = y;
      cssProps({transform: `translate(${x}px,${y}px)`}, move.style);
    },
  },
  resize: {
    get cursor() {
      const cl = shifter.target.classList;
      return `n${cl.contains('left') ^ cl.contains('top') ? 'e' : 'w'}-resize`;
    },
    /** @param {MouseEvent} e */
    handler(e) {
      shifter.consume(e);
      const {move, resize, target: {classList}} = shifter;
      const isLeft = classList.contains('left');
      const isTop = classList.contains('top');
      const wRaw = resize.x0 + (e.clientX - resize.clientX) * (isLeft ? -1 : 1);
      const w = Math.min(Math.max(wRaw, MIN_WIDTH), innerWidth, innerHeight * ASPECT_RATIO);
      const h = calcHeight(w);
      const dx = w - resize.x;
      const dy = h - resize.y;
      if (dx || dy) {
        move.to(move.x - dx * isLeft, move.y - dy * isTop);
        resize.to(w, h);
      }
    },
    init() {
      const {resize} = shifter;
      resize.style = cssAppend(cssImportant(/*language=CSS*/ `
        :host {
          width: ${resize.x = app.config.width}px;
          height: ${resize.y = calcHeight(app.config.width)}px;
        }`));
    },
    to(w, h) {
      const {resize} = shifter;
      resize.x = w;
      resize.y = h;
      cssProps({width: `${w}px`, height: `${h}px`}, resize.style);
    },
  },
};

app.player = {
  get element() {
    return dom.player;
  },
  /**
   * @param {Object} opts
   * @param {string} opts.id
   * @param {boolean} opts.isShared
   * @param {HTMLAnchorElement} opts.link
   * @param {string} opts.time
   */
  async create(opts) {
    createDom(opts);
    await setSource(opts);
    document.body.appendChild(dom.player);
    setTimeout(() => cssAppend(STYLES.fadein), 250);
    shifter.move.init();
    shifter.resize.init();
    setHoverCancelers(true);
    if (app.config.strike) strikeLinks(opts.link);
    if (app.config.history) app.sendCmd('addToHistory', opts.link.href);
  },
  remove() {
    setHoverCancelers(false);
    app.hover.stopTimer();
    if (dom.player) {
      if (shifter.target) shifter.stop();
      dom.player.remove();
      dom = {};
    }
  },
};

function createDom({link}) {
  const onmousedown = shifter.onMouseDown;
  let thisStyle;
  dom.player = $div({onmousedown});
  dom.style = thisStyle = $create('style',
    STYLES.main +
    (app.config.dark ? STYLES.dark : '') +
    cssImportant(app.config.mode === 1 ? calcCenterPos() : calcRelativePos(link)));
  dom.actor = app.config.native ? createDomVideo() : createDomFrame();
  dom.actor.onload = () => setTimeout(() => cssAppend(STYLES.loaded, thisStyle), 10e3);
  dom.resizers = $div({id: 'resizers'}, [
    $div({className: 'top left', onmousedown}),
    $div({className: 'top right', onmousedown}),
    $div({className: 'bottom right', onmousedown}),
    $div({className: 'bottom left', onmousedown}),
  ]);
  dom.player.attachShadow({mode: 'closed'})
    .append(dom.style, dom.actor, dom.resizers);
}

function createDomFrame() {
  return $create('iframe', {
    allowFullscreen: true,
    sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
    src: location.host === 'www.youtube.com' ? 'https://blank.org/#' : '',
  });
}

function createDomFrameFallback() {
  const frame = createDomFrame();
  const video = dom.actor;
  frame.onload = video.onload;
  video.onload = video.oncanplay = video.onerror = null;
  video.replaceWith(frame);
  dom.actor = frame;
}

function createDomVideo() {
  return $create('video', {
    autoplay: true,
    controls: true,
    volume: app.config.volume,
    onvolumechange() {
      chrome.storage.sync.set({volume: this.volume});
    },
  });
}

async function setSource({id, link, time, isShared}) {
  const thisStyle = dom.style;
  const start = calcStartTime(time);
  const timer = setTimeout(showProgress, 0, link);
  try {
    if (isShared)
      id = await app.sendCmd('findId', id);
    if (!id)
      throw 'Video ID not found';
    if (app.config.native && await setNativeSource(id)) {
      dom.actor.currentTime = start;
    } else {
      dom.actor.src += `https://www.youtube.com/embed/${id}?${new URLSearchParams({
        start,
        fs: 1,
        autoplay: 1,
        enablejsapi: 1,
      })}`;
    }
  } catch (e) {
    console.error(e);
    cssAppend(STYLES.error, thisStyle);
  }
  clearTimeout(timer);
  hideProgress(link);
}

async function setNativeSource(id) {
  let timer;
  try {
    const el = dom.actor;
    const data = await app.sendCmd('getVideoInfo', id);
    await new Promise((resolve, reject) => {
      timer = setTimeout(reject, 2000);
      el.append(...data.map(item => $create('source', item)));
      el.oncanplay = () => {
        clearTimeout(timer);
        setTimeout(() => el.play().catch(() => {}));
        resolve();
      };
      el.onerror = reject;
    });
    return true;
  } catch (e) {
    clearTimeout(timer);
    createDomFrameFallback();
  }
}

function calcCenterPos() {
  return /*language=CSS*/ `
  :host {
    position: fixed;
    left: calc(50% - ${app.config.width / 2 - app.config['center-x']}px);
    top: calc(50% - ${app.config.width / ASPECT_RATIO / 2 - app.config['center-y']}px);
  }`;
}

function calcRelativePos(link) {
  const rect = link.getBoundingClientRect();
  const w = app.config.width;
  const h = w / ASPECT_RATIO;
  const se = document.scrollingElement || document.body;
  const maxLeft = scrollX + innerWidth - w - 10 - (se.scrollHeight > innerHeight ? 30 : 0);
  const left = Math.max(0, Math.min(maxLeft, rect.left + scrollX + app.config['relative-x']));
  const top = Math.max(0, rect.bottom + scrollY + app.config['relative-y']);
  if (app.config.scroll) {
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
        behavior: app.config.smooth ? 'smooth' : 'auto',
      });
    }
  }
  return /*language=CSS*/ `
  :host {
    position: absolute;
    left: ${left}px;
    top: ${top}px;
  }`;
}

function calcStartTime(time) {
  const [, h, m, s] = /(?:(\d+)h)?(?:(\d+)m)?(\d+)s/.exec(time) || [];
  return (s | 0) + (m | 0) * 60 + (h | 0) * 3600;
}

function calcHeight(width) {
  return Math.round(width / ASPECT_RATIO);
}

/** @param {KeyboardEvent} e */
function onkeydown(e) {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (shifter.target) {
      shifter.stop();
    } else {
      app.player.remove();
    }
  }
}

function setHoverCancelers(enable) {
  const method = `${enable ? 'add' : 'remove'}EventListener`;
  if (dom.player || !enable) {
    document[method]('click', app.hover.onclick);
    document[method]('keydown', onkeydown);
  }
}

function strikeLinks(link) {
  for (const el of [...document.querySelectorAll(`a[href="${link.href}"]`), link]) {
    el.style['text-decoration'] = 'line-through';
  }
}

function $create(tag, props, children) {
  const el = document.createElement(tag);
  if (Array.isArray(props)) {
    children = props;
  } else if (typeof props === 'string') {
    el.textContent = props;
  } else if (props instanceof Node) {
    el.appendChild(props);
  } else if (props) {
    Object.assign(el, props);
  }
  if (children) el.append(...children);
  return el;
}

function $div() {
  return $create('div', ...arguments);
}

function cssImportant(str) {
  return str.replace(/;\s*/g, '!important;');
}

function cssAppend(rule, elStyle = dom.style) {
  const {sheet} = elStyle || 0;
  if (sheet) {
    const i = sheet.insertRule(rule, sheet.cssRules.length);
    return Object.assign(sheet.cssRules[i].style, {_ruleIndex: i});
  } else if (elStyle) {
    elStyle.textContent += rule;
  }
}

/**
 * @param {Object<string, string>} props
 * @param {CSSStyleDeclaration} style
 */
function cssProps(props, style) {
  for (const [name, value] of Object.entries(props))
    style.setProperty(name, value, 'important');
}

function showProgress({style, style: {cursor}}) {
  style.setProperty('cursor', PROGRESS_CURSOR, 'important');
  dom.oldCursor = cursor;
}

function hideProgress(link) {
  const {style} = link;
  if (style.cursor === PROGRESS_CURSOR)
    style.cursor = dom.oldCursor;
  if (!style.length)
    link.removeAttribute('style');
}
