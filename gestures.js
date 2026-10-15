(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const noteView = $('noteView');
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

  if (!noteView || !readBody || !readMode || !editMode || !readTitle ||
      !titleInput || !bodyInput || !saveStatus || !emailBtn || !shareBtn ||
      !deleteBtn || !saveBtn || !backBtn) return;

  const elementTarget = target => {
    if (!target) return null;
    if (target.nodeType === 1) return target;
    return target.parentElement || null;
  };

  const isLink = target => {
    const el = elementTarget(target);
    return Boolean(el && el.closest && el.closest('a'));
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

  function enterEditDirectly() {
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

  // app.js still contains the retired edge-only touch listeners. Stop those
  // touch events before they reach the old bubble handlers; this file owns
  // the note-surface gesture contract now via Pointer Events.
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(type => {
    noteView.addEventListener(type, e => e.stopImmediatePropagation(), {
      capture: true,
      passive: true
    });
  });

  let gesture = null;

  noteView.addEventListener('pointerdown', e => {
    if (!e.isPrimary) return;
    const target = elementTarget(e.target);
    if (!target) return;
    if (target.closest && target.closest('button, a, dialog')) return;

    gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      horizontal: false,
      tapBody: Boolean(target === readBody || (readBody.contains && readBody.contains(target))) && !isLink(target)
    };

    try { noteView.setPointerCapture(e.pointerId); } catch (_) {}
  }, { capture: true });

  noteView.addEventListener('pointermove', e => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;

    if (!gesture.horizontal && dx > 16 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      gesture.horizontal = true;
    }

    if (gesture.horizontal && e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });

  noteView.addEventListener('pointerup', e => {
    if (!gesture || e.pointerId !== gesture.id) return;

    const state = gesture;
    gesture = null;
    const dx = e.clientX - state.x;
    const dy = e.clientY - state.y;
    const swipeBack = state.horizontal && dx > 72 && Math.abs(dy) < 80;
    const bodyTap = state.tapBody && Math.abs(dx) < 10 && Math.abs(dy) < 10;

    try { noteView.releasePointerCapture(e.pointerId); } catch (_) {}

    if (swipeBack) {
      if (e.cancelable) e.preventDefault();
      backBtn.click();
      return;
    }

    if (bodyTap && !readMode.hidden) {
      if (e.cancelable) e.preventDefault();
      enterEditDirectly();
    }
  }, { capture: true, passive: false });

  noteView.addEventListener('pointercancel', e => {
    if (gesture && e.pointerId === gesture.id) gesture = null;
  }, { capture: true });
})();
