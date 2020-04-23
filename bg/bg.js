'use strict';

chrome.runtime.onInstalled.addListener(() => {
  document.body.appendChild(document.createElement('script'))
    .src = '/bg/bg-install.js';
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
  async getVideoInfo(id) {
    const text = await (await fetch(`https://www.youtube.com/get_video_info?${new URLSearchParams({
      el: 'embedded',
      hl: 'en_US',
      html5: 1,
      video_id: id,
    })}`)).text();
    return JSON.parse(decodeURIComponent(text.match(/(^|&)player_response=([^&]*)/)[2]));
  },
};

chrome.runtime.onMessage.addListener(({cmd, args}, sender, sendResponse) => {
  try {
    const fn = commands[cmd];
    const res = fn && fn.apply(sender, args);
    if (res && typeof res.then === 'function') {
      res.then(data => ({data}), error => ({error})).then(sendResponse);
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
        ? reject(chrome.runtime.lastError.message)
        : resolve()));
}
