'use strict';

const DEFAULTS = {
  'relative-x': 0,
  'relative-y': 0,
  'center-x': 0,
  'center-y': 0,
  'delay': 1000,
  'width': 500,
  'mode': 0,
  'strike': true,
  'history': true,
  'scroll': true,
  'smooth': true,
  'dark': false,
  'youtube': false,
};

restore();
$id('save').onclick = save;

function save() {
  const prefs = {};
  for (const k of Object.keys(DEFAULTS)) {
    const el = $id(k);
    prefs[k] = el[getValueName(el)];
  }
  chrome.storage.local.set(prefs, () => {
    $id('status').textContent = 'Options saved.';
    setTimeout(() => ($id('status').textContent = ''), 750);
    restore();
  });
}

function restore() {
  chrome.storage.local.get(DEFAULTS, prefs => {
    for (const [k, v] of Object.entries(prefs)) {
      const el = $id(k);
      el[getValueName(el)] = v;
    }
    if (prefs.history)
      handleHistoryPermission();
  });
}

function handleHistoryPermission() {
  chrome.permissions.contains({permissions: ['history']}, granted => {
    if (!granted) {
      const el = $id('history');
      el.checked = false;
      el.onclick = () => chrome.permissions.request({permissions: ['history']});
    }
  });
}

function getValueName(el) {
  switch (el.type) {
    case 'checkbox':
      return 'checked';
    case 'number':
      return 'valueAsNumber';
    case 'select-one':
      return 'selectedIndex';
    default:
      return 'value';
  }
}

function $id(id) {
  return document.getElementById(id);
}
