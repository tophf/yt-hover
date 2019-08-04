'use strict';

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({url: '*://*/*'}, tabs => {
    const code = {code: 'typeof createPlayer'};
    for (const tab of tabs) {
      chrome.tabs.executeScript(tab.id, code, result => {
        if (!chrome.runtime.lastError && result[0] !== 'function') {
          chrome.tabs.executeScript(tab.id, {file: 'defaults.js', allFrames: true}, () => {
            chrome.tabs.executeScript(tab.id, {file: 'content.js', allFrames: true});
          });
        }
      });
    }
  });
});

chrome.runtime.onMessage.addListener(function ({cmd}) {
  switch (cmd) {
    case 'history':
      return cmdHistory(...arguments);
    case 'findId':
      return cmdFindId(...arguments);
  }
});

function cmdHistory(msg) {
  if (!chrome.history) {
    console.warn('Please re-enable "history" checkbox in the options dialog!');
  } else {
    chrome.history.addUrl({
      url: msg.url,
    });
  }
}

function cmdFindId(msg, sender, sendResponse) {
  const req = new XMLHttpRequest();
  req.open('GET', 'https://www.youtube.com/shared?ci=' + msg.id);
  req.responseType = 'document';
  req.onloadend = () => {
    try {
      sendResponse(req.response.querySelector('[itemprop="videoId"]').content);
    } catch (e) {
      sendResponse();
    }
  };
  req.send();
  return true;
}
