(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const noteView = $('noteView');
  const noteContent = $('noteContent');
  const readBody = $('readBody');
  const readMode = $('readMode');
  const editMode = $('editMode');
  const readTitle = $('readTitle');
  const titleInput = $('titleInput');
  const bodyInput = $('bodyInput');
  const saveStatus = $('saveStatus');
  const emailBtn = $('emailBtn');
  const shareBtn = $('shareBtn');
  const deleteBtn = $('deleteBtn');
  const saveBtn = $('saveBtn');
  const backBtn = $('backBtn');

  if (!noteView || !noteContent || !readBody || !readMode || !editMode ||
      !readTitle || !titleInput || !bodyInput || !saveStatus || !emailBtn ||
      !shareBtn || !deleteBtn || !saveBtn || !backBtn) return;

  const elementTarget = target => {
    if (!target) return null;
    if (target.nodeType === 1) return target;
    return target.parentElement || null;
  };

  const isInteractive = target => {
    const el = elementTarget(target);
    return Boolean(el && el.closest && el.closest('button, a, dialog'));
  };

  const bodyFromReadView = () => Array.from(readBody.children).map(row => {
    if (row.querySelector && row.querySelector('hr')) return '---';
    const marker = row.querySelector ? row.querySelector('.marker') : null;
    if (!marker) {
      const text = row.textContent || '';
      return text === ' ' ? '' : text;
    }
    const text = Array.from(row.children || [])
      .filter(el => el !== marker)
      .map(el => el.textContent || '')
      .join('');
    const mark = marker.textContent || '';
    if (row.classList && row.classList.contains('check')) {
      return `${mark === '☑' ? '[x]' : '[ ]'} ${text}`;
    }
    if (mark === '•') return `• ${text}`;
    if (/^\d+\.$/.test(mark)) return `${mark} ${text}`;
    return `${mark} ${text}`.trimEnd();
  }).join('\n');

  function fallbackEnterEdit() {
    if (readMode.hidden || !editMode.hidden) return;
    readMode.hidden = true;
    editMode.hidden = false;
    emailBtn.hidden = true;
    shareBtn.hidden = true;
    deleteBtn.hidden = true;
    saveBtn.hidden = false;
    titleInput.value = readTitle.textContent || '';
    bodyInput.value = bodyFromReadView();
    saveStatus.textContent = '';
    requestAnimationFrame(() => {
      bodyInput.focus();
      const end = bodyInput.value.length;
      if (bodyInput.setSelectionRange) bodyInput.setSelectionRange(end, end);
    });
  }

  function enterEdit() {
    if (readMode.hidden) return;
    readBody.click();
    if (!readMode.hidden) fallbackEnterEdit();
  }

  let gesture = null;

  noteView.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) {
      gesture = null;
      return;
    }
    const target = elementTarget(e.target);
    if (!target || isInteractive(target)) {
      gesture = null;
      return;
    }

    const touch = e.touches[0];
    gesture = {
      x: touch.clientX,
      y: touch.clientY,
      horizontal: false,
      tapSurface: !readMode.hidden &&
        (target === noteContent || target === readMode ||
         (noteContent.contains && noteContent.contains(target)))
    };

    // Retired edge-only handlers in app.js are bubble-phase. Keep this
    // surface gesture authoritative without blocking native scrolling.
    e.stopPropagation();
  }, { capture: true, passive: true });

  noteView.addEventListener('touchmove', e => {
    if (!gesture || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;

    e.stopPropagation();
    if (!gesture.horizontal && dx > 14 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      gesture.horizontal = true;
    }
    if (gesture.horizontal && e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });

  noteView.addEventListener('touchend', e => {
    if (!gesture || !e.changedTouches.length) return;
    const state = gesture;
    gesture = null;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - state.x;
    const dy = touch.clientY - state.y;
    const swipeBack = state.horizontal && dx > 60 && Math.abs(dy) < 72;
    const tapSurface = state.tapSurface && Math.abs(dx) < 12 && Math.abs(dy) < 12;

    e.stopPropagation();
    if (swipeBack) {
      if (e.cancelable) e.preventDefault();
      backBtn.click();
      return;
    }
    if (tapSurface && !readMode.hidden) {
      if (e.cancelable) e.preventDefault();
      enterEdit();
    }
  }, { capture: true, passive: false });

  noteView.addEventListener('touchcancel', e => {
    gesture = null;
    e.stopPropagation();
  }, { capture: true, passive: true });

  // Mouse/trackpad: the entire read surface is editable, not only text rows.
  noteContent.addEventListener('click', e => {
    if (readMode.hidden || isInteractive(e.target)) return;
    const target = elementTarget(e.target);
    if (!target || !(target === noteContent || target === readMode || readMode.contains(target))) return;
    enterEdit();
  });
})();
