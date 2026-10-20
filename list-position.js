(() => {
  'use strict';

  const STORAGE_KEY = 'lexiNotesListScrollV1';
  const listView = document.getElementById('listView');
  const noteView = document.getElementById('noteView');
  const notesList = document.getElementById('notesList');
  const searchInput = document.getElementById('searchInput');
  if (!listView || !notesList) return;

  let saveTimer = 0;
  let restoreFrame = 0;

  function listVisible() {
    return !listView.hidden;
  }

  function readPosition() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_) {
      return 0;
    }
  }

  function writePosition(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.round(Number(value) || 0))));
    } catch (_) {}
  }

  function savePosition() {
    if (!listVisible()) return;
    if (searchInput && searchInput.value.trim()) return;
    writePosition(window.scrollY || document.documentElement.scrollTop || 0);
  }

  function restorePosition() {
    if (!listVisible() || (searchInput && searchInput.value.trim())) return;
    const target = readPosition();
    cancelAnimationFrame(restoreFrame);
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = requestAnimationFrame(() => {
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo(0, Math.min(target, max));
      });
    });
  }

  window.addEventListener('scroll', () => {
    if (!listVisible()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, 80);
  }, { passive: true });

  window.addEventListener('pagehide', savePosition);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') savePosition();
  });

  new MutationObserver(() => {
    if (listVisible()) {
      restorePosition();
    } else if (noteView && !noteView.hidden) {
      window.scrollTo(0, 0);
    }
  }).observe(listView, { attributes: true, attributeFilter: ['hidden'] });

  new MutationObserver(() => {
    if (listVisible()) restorePosition();
  }).observe(notesList, { childList: true });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim()) {
        window.scrollTo(0, 0);
        return;
      }
      restorePosition();
    });
  }

  if (listVisible()) restorePosition();
  else if (noteView && !noteView.hidden) window.scrollTo(0, 0);
})();