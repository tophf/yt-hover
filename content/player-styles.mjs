const BORDER_WIDTH = '4px';
export const STYLES = {
  //language=CSS
  main: `
    :host {
      all: initial;
      border: ${BORDER_WIDTH} solid #3338;
      box-sizing: content-box;
      background: #000 center center no-repeat;
      z-index: 2147483647;
      cursor: move;
      opacity: 0;
      transition: opacity .25s;
    }
    iframe, video {
      width: 100%;
      height: 100%;
      border: none;
      overflow: hidden;
      background: none;
      position: relative;
      outline: none;
    }
    #resizers {
      position: absolute;
      pointer-events: none;
      top: -${BORDER_WIDTH};
      left: -${BORDER_WIDTH};
      right: -${BORDER_WIDTH};
      bottom: -${BORDER_WIDTH};
    }
    #resizers.moving {
      pointer-events: auto;
    }
    #resizers * {
      position: absolute;
      pointer-events: auto;
      width: ${BORDER_WIDTH};
      height: ${BORDER_WIDTH};
    }
    .top.left  {
      cursor: nw-resize;
    }
    .top.right  {
      right: 0;
      cursor: ne-resize;
    }
    .bottom.right {
      right: 0;
      bottom: 0;
      cursor: se-resize;
    }
    .bottom.left  {
      bottom: 0;
      cursor: sw-resize;
    }
  `,
  cursor: ':host { cursor: %; }',
  //language=CSS
  dark: `
    :host {
      box-shadow: 0 0 0 90000px #000;
      border-color: transparent;
    }
  `,
  //language=CSS
  error: `
    :host {
      background: darkred;
    }
  `,
  //language=CSS
  fadein: `
    :host {
      opacity: 1;
    }
  `,
  //language=CSS
  loaded: `
    :host {
      background-image: none;
    }
  `,
  //language=CSS
  fence: `
    :host {
      all: initial;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2147483646;
      user-select: none;
      -moz-user-select: none;
      /*cursor*/;
    }
  `,
};
