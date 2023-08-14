/* global DEFAULTS */
'use strict';

const valueProp = ({type}) =>
  type === 'checkbox' ? 'checked' :
    type === 'number' ? 'valueAsNumber' :
      type === 'select-one' ? 'selectedIndex' :
        'value';

document.oninput = ({target: el}) => {
  let value = el[valueProp(el)];
  if (el.id === 'delay') value *= 1000;
  chrome.storage.sync.set({[el.id]: value});
};

document.getElementById('history').onclick = function () {
  if (this.checked && !chrome.history) {
    chrome.permissions.request({permissions: ['history']}, ok => {
      this.checked = ok;
    });
  } else if (!this.checked && chrome.history) {
    chrome.permissions.remove({permissions: ['history']}, () => {
      location.reload();
    });
  }
};

document.getElementById('hotkey').onkeydown = function (e) {
  const key = [
    e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift' && e.key,
  ].filter(Boolean).join('-');
  if (key !== 'Tab' && key !== 'Shift-Tab') {
    e.preventDefault();
    this.value = key;
    chrome.storage.sync.set({[this.id]: key});
  }
};

chrome.storage.sync.get(DEFAULTS, prefs => {
  prefs.delay = isNaN(prefs.delay) ? DEFAULTS.delay : prefs.delay / 1000;
  for (const [k, v] of Object.entries(prefs)) {
    const el = document.getElementById(k);
    if (el)
      el[valueProp(el)] = k === 'history' ? chrome.history && v : v;
  }
});
