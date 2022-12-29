'use strict';

importScripts('/js/defaults.js'); /* global DEFAULTS */

async function onInstalled() {
  // update storage
  const prefs = await chrome.storage.sync.get();
  const toWrite = {};
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (prefs[k] === undefined)
      toWrite[k] = def;
  }
  if (Object.keys(toWrite).length)
    await chrome.storage.sync.set(toWrite);

  // inject tabs
  const [cs] = chrome.runtime.getManifest().content_scripts;
  for (const tab of await chrome.tabs.query({url: cs.matches})) {
    chrome.scripting.executeScript({
      files: cs.js,
      injectImmediately: true,
      target: {
        tabId: tab.id,
        allFrames: cs.all_frames,
      },
    }, () => chrome.runtime.lastError);
  }
}
