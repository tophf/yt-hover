'use strict';

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.cmd === 'history') {
    chrome.history.addUrl({
      url: request.url
    });
  }
  else if (request.cmd === 'find-id') {
    const req = new XMLHttpRequest();
    req.open('GET', 'https://www.youtube.com/shared?ci=' + request.id);
    req.responseType = 'document';
    req.onload = () => {
      try {
        response(req.response.querySelector('[itemprop="videoId"]').content);
      }
      catch (e) {
        response();
      }
    };
    req.onerror = () => response();
    req.send();
    return true;
  }
});
