(() => {
  'use strict';

  const notesList = document.getElementById('notesList');
  const emptyState = document.getElementById('emptyState');
  const noteView = document.getElementById('noteView');
  const readMode = document.getElementById('readMode');
  if (!notesList || !emptyState || !noteView || !readMode) return;

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
})();
