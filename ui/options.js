/* global DEFAULTS */
'use strict';

const VALUE_SOURCE = {
  'checkbox': 'checked',
  'number': 'valueAsNumber',
  'select-one': 'selectedIndex',
};

const $id = id => document.getElementById(id);
const $getValue = el => el[VALUE_SOURCE[el.type] || 'value'];
const $setValue = (el, value) => (el[VALUE_SOURCE[el.type] || 'value'] = value);

const save = ({target: el}) => {
  let value = $getValue(el);
  if (el.id === 'delay') value *= 1000;
  chrome.storage.local.set({[el.id]: value});
};

addEventListener('change', save);
addEventListener('input', save);

Object.assign($id('history'), {
  onclick() {
    if (this.checked && !chrome.history)
      chrome.permissions.request({permissions: ['history']}, ok => (this.checked = ok));
    else if (!this.checked && chrome.history)
      chrome.permissions.remove({permissions: ['history']}, () => location.reload());
  },
});

chrome.storage.local.get(DEFAULTS, prefs => {
  prefs.delay = isNaN(prefs.delay) ? DEFAULTS.delay : prefs.delay / 1000;
  for (const [k, v] of Object.entries(prefs))
    $setValue($id(k), k === 'history' ? chrome.history && v : v);
});
