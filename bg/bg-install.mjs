updateStorage()
  .then(injectTabs);

function updateStorage() {
  return new Promise(resolve => {
    chrome.storage.sync.get(async prefs => {
      const toWrite = {};
      for (const [k, def] of Object.entries((await import('/js/defaults.mjs')).default)) {
        if (prefs[k] === undefined)
          toWrite[k] = def;
      }
      if (Object.keys(toWrite).length) {
        chrome.storage.sync.set(toWrite, resolve);
      } else {
        resolve();
      }
    });
  });
}

function injectTabs() {
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
          for (const file of cs.js) {
            chrome.tabs.executeScript(tab.id, {file, ...opts});
          }
        }
      });
    }
  });
}
