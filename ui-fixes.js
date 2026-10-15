(() => {
  'use strict';

  const notesList = document.getElementById('notesList');
  const emptyState = document.getElementById('emptyState');
  const noteView = document.getElementById('noteView');
  const readMode = document.getElementById('readMode');
  const readBody = document.getElementById('readBody');
  if (!notesList || !emptyState || !noteView || !readMode || !readBody) return;

  function sectionHeading(label) {
    return Array.from(notesList.querySelectorAll('.note-list-heading'))
      .find(node => node.textContent.trim() === label) || null;
  }

  function makeEmptySection(label) {
    const section = document.createElement('section');
    section.className = 'note-list-section persistent-empty-section';
    const heading = document.createElement('div');
    heading.className = 'note-list-heading';
    heading.textContent = label;
    const list = document.createElement('div');
    list.className = 'note-section-list';
    section.append(heading, list);
    return section;
  }

  let sectionRepairing = false;
  function ensureSections() {
    if (sectionRepairing || !emptyState.hidden) return;
    sectionRepairing = true;
    try {
      if (!sectionHeading('Pinned')) notesList.prepend(makeEmptySection('Pinned'));
      if (!sectionHeading('Notes')) notesList.append(makeEmptySection('Notes'));
    } finally {
      sectionRepairing = false;
    }
  }

  new MutationObserver(() => queueMicrotask(ensureSections))
    .observe(notesList, { childList: true });
  ensureSections();

  const elementTarget = target => {
    if (!target) return null;
    return target.nodeType === 1 ? target : target.parentElement || null;
  };

  let checkTouch = null;
  function checkboxHit(target, clientX) {
    const el = elementTarget(target);
    const row = el && el.closest ? el.closest('.read-line.check') : null;
    if (!row || !readMode.contains(row)) return null;
    const button = row.querySelector('.check-toggle');
    if (!button) return null;
    const rect = row.getBoundingClientRect();
    return clientX <= rect.left + 52 ? button : null;
  }

  noteView.addEventListener('touchstart', event => {
    if (readMode.hidden || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const button = checkboxHit(event.target, touch.clientX);
    if (!button) return;
    checkTouch = { button, x: touch.clientX, y: touch.clientY, moved: false };
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });

  noteView.addEventListener('touchmove', event => {
    if (!checkTouch || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (Math.abs(touch.clientX - checkTouch.x) > 12 || Math.abs(touch.clientY - checkTouch.y) > 12) {
      checkTouch.moved = true;
    }
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });

  noteView.addEventListener('touchend', event => {
    if (!checkTouch || !event.changedTouches.length) return;
    const state = checkTouch;
    checkTouch = null;
    event.stopImmediatePropagation();
    if (state.moved) return;
    if (event.cancelable) event.preventDefault();
    state.button.click();
  }, { capture: true, passive: false });

  noteView.addEventListener('touchcancel', event => {
    if (!checkTouch) return;
    checkTouch = null;
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });

  // Give mouse/trackpad users the same forgiving left-side checkbox target.
  readMode.addEventListener('click', event => {
    const el = elementTarget(event.target);
    if (!el || el.closest('.check-toggle')) return;
    const button = checkboxHit(el, event.clientX);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.click();
  }, { capture: true });

  const BARE_DOMAIN_RE = /(^|[\s([{\"'])(?:(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|io|co|ai|app|dev|me|info|biz|travel|us|uk|ca|au|kr|jp|cn|tw|hk|sg|th|vn|ph|id|my|in|mx|br|ar|cl|pe|de|fr|it|es|nl|se|no|fi|dk|ch|at|gl))(?:\:\d+)?(?:\/[^\s<]*)?/gi;

  function trimUrlPunctuation(value) {
    let url = value;
    let trailing = '';
    while (/[),.;!?]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    return { url, trailing };
  }

  function linkBareDomains() {
    const walker = document.createTreeWalker(readBody, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest('a,button') || !node.nodeValue || !node.nodeValue.includes('.')) continue;
      BARE_DOMAIN_RE.lastIndex = 0;
      if (BARE_DOMAIN_RE.test(node.nodeValue)) nodes.push(node);
    }

    nodes.forEach(node => {
      const text = node.nodeValue;
      const fragment = document.createDocumentFragment();
      let last = 0;
      let match;
      BARE_DOMAIN_RE.lastIndex = 0;
      while ((match = BARE_DOMAIN_RE.exec(text))) {
        const prefix = match[1] || '';
        const start = match.index + prefix.length;
        const candidate = match[0].slice(prefix.length);
        const { url, trailing } = trimUrlPunctuation(candidate);
        if (!url) continue;
        if (start > last) fragment.append(document.createTextNode(text.slice(last, start)));
        const link = document.createElement('a');
        link.href = `https://${url}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = url;
        fragment.append(link);
        if (trailing) fragment.append(document.createTextNode(trailing));
        last = match.index + match[0].length;
      }
      if (!last) return;
      if (last < text.length) fragment.append(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
    });
  }

  function formatListRows() {
    readBody.querySelectorAll('.read-line').forEach(row => {
      const marker = row.querySelector(':scope > .marker');
      if (!marker || row.classList.contains('check')) return;
      const text = marker.textContent.trim();
      if (text === '•') row.classList.add('list-line', 'bullet-line');
      else if (/^\d+\.$/.test(text)) row.classList.add('list-line', 'number-line');
    });
  }

  let enhancingReadBody = false;
  function enhanceReadBody() {
    if (enhancingReadBody) return;
    enhancingReadBody = true;
    try {
      formatListRows();
      linkBareDomains();
    } finally {
      enhancingReadBody = false;
    }
  }

  new MutationObserver(() => queueMicrotask(enhanceReadBody))
    .observe(readBody, { childList: true, subtree: true });
  enhanceReadBody();
})();
