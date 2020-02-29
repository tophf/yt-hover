'use strict';

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({url: '*://*/*'}, tabs => {
    const code = {code: 'window.INJECTED === 1'};
    const cs = chrome.runtime.getManifest().content_scripts[0];
    const opts = {
      allFrames: cs.all_frames,
      matchAboutBlank: cs.match_about_blank,
    };
    for (const tab of tabs) {
      chrome.tabs.executeScript(tab.id, code, result => {
        if (!chrome.runtime.lastError && !result[0]) {
          for (const file of cs.js)
            chrome.tabs.executeScript(tab.id, {file, ...opts});
        }
      });
    }
  });
});

const commands = {
  addToHistory(url) {
    if (!chrome.history) throw 'Please re-enable "history" checkbox in the options dialog!';
    chrome.history.addUrl({url});
  },
  injectPlayer() {
    return exec(this.tab.id, {
      file: '/content/player.js',
      frameId: this.frameId,
    });
  },
  async findId(id) {
    const text = await (await fetch(`https://www.youtube.com/shared?ci=${id}`)).text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const el = doc.querySelector('[itemprop="videoId"]');
    return el && el.content || null;
  },
};

chrome.runtime.onMessage.addListener(({cmd, args}, sender, sendResponse) => {
  try {
    const fn = commands[cmd];
    const res = fn && fn.apply(sender, args);
    if (res && typeof res.then === 'function') {
      res.then(data => ({data}), error => ({error}))
        .then(sendResponse);
      return true;
    }
    sendResponse({data: res === undefined ? null : res});
  } catch (error) {
    sendResponse({error});
  }
});

function exec(...args) {
  return new Promise((resolve, reject) =>
    chrome.tabs.executeScript(...args, () =>
      chrome.runtime.lastError
        ? reject(chrome.runtime.lastError)
        : resolve()));
}
