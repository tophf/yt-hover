'use strict';

if (window !== top) {
  document.documentElement.append(
    Object.assign(document.createElement('iframe'), {
      allowFullscreen: true,
      src: location.hash.slice(1),
    }),
    Object.assign(document.createElement('style'), {
      textContent: /*language=css*/ `
        body {
          display: none;
        }
        iframe, html {
          width: 100vw;
          height: 100vh;
          margin: 0;
          border: none;
          overflow: hidden;
          background: none;
          outline: none;
        }
      `.replace(/;/g, '!important;'),
    })
  );
  history.replaceState(null, '', location.href.split('#')[0]);
}
