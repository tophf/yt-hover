'use strict';

self.oninstall = () => importScripts('bg-install.js'); /* global onInstalled */
chrome.runtime.onMessage.addListener(onMessage);

const COMMANDS = {
  addToHistory(url) {
    if (!chrome.history) throw 'Please re-enable "history" checkbox in the options dialog!';
    return chrome.history.addUrl({url});
  },
  async findId(id) {
    const text = await (await fetch(`https://www.youtube.com/shared?ci=${id}`)).text();
    return text.match(/<meta\s+itemprop="videoId"\s*content="([-\w]+)"\s*>/i)?.[1] || null;
  },
  async getVideoInfo(id) {
    const text = await (await fetch(`https://www.youtube.com/get_video_info?${new URLSearchParams({
      el: 'embedded',
      hl: 'en_US',
      html5: 1,
      video_id: id,
    })}`)).text();
    const info = JSON.parse(decodeURIComponent(text.match(/(^|&)player_response=([^&]*)/)[2]));
    const data = info.streamingData;
    const fmts = (data.formats || data.adaptiveFormats)
      .sort((a, b) => b.width - a.width || b.height - a.height);
    return fmts.map(extractStream);
  },
};

function onMessage({cmd, args}, sender, sendResponse) {
  try {
    const fn = COMMANDS[cmd];
    const res = fn && fn.apply(sender, args);
    if (res instanceof Promise) {
      res.then(data => sendResponse({data}), error => sendResponse({error}));
      return true;
    }
    sendResponse({data: res === undefined ? null : res});
  } catch (error) {
    sendResponse({error});
  }
}

function extractStream(f) {
  const codec = f.mimeType.match(/codecs="([^.]+)|$/)[1] || '';
  const type = f.mimeType.split(/[/;]/)[1];
  let src = f.url;
  if (!src && f.cipher) {
    const cipher = new URLSearchParams(f.cipher);
    const s = cipher.get('s');
    const sp = s && `&${cipher.get('sp') || 'sig'}=${decodeSignature(s)}`;
    src = cipher.get('url') + (sp || '');
  }
  const title = [
    f.quality,
    f.qualityLabel !== f.quality ? f.qualityLabel : '',
    type + (codec ? `:${codec}` : ''),
  ].filter(Boolean).join(', ');
  return {src, title};
}

function decodeSignature(s) {
  const a = s.split('');
  a.reverse();
  swap(a, 24);
  a.reverse();
  swap(a, 41);
  a.reverse();
  swap(a, 2);
  return a.join('');
}

function swap(a, b) {
  const c = a[0];
  a[0] = a[b % a.length];
  a[b % a.length] = c;
}
