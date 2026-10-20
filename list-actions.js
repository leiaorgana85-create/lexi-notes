(() => {
  'use strict';

  const notesList = document.getElementById('notesList');
  if (!notesList) return;

  const MORE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>';

  function closeMenus(exceptWrap = null) {
    notesList.querySelectorAll('.card-more-wrap').forEach(wrap => {
      if (wrap === exceptWrap) return;
      const button = wrap.querySelector('.card-more-btn');
      const menu = wrap.querySelector('.card-actions-menu');
      if (!button || !menu || menu.hidden) return;
      menu.hidden = true;
      menu.classList.remove('open-up');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function setOpen(wrap, open) {
    const button = wrap.querySelector('.card-more-btn');
    const menu = wrap.querySelector('.card-actions-menu');
    if (!button || !menu) return;

    if (!open) {
      menu.hidden = true;
      menu.classList.remove('open-up');
      button.setAttribute('aria-expanded', 'false');
      return;
    }

    closeMenus(wrap);
    menu.hidden = false;
    menu.classList.remove('open-up');
    button.setAttribute('aria-expanded', 'true');

    const rect = menu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) menu.classList.add('open-up');
  }

  function labelAction(button) {
    if (button.querySelector('.card-menu-label')) return;
    const label = button.getAttribute('aria-label') || button.title || 'Action';
    const text = document.createElement('span');
    text.className = 'card-menu-label';
    text.textContent = label;
    button.append(text);
    button.removeAttribute('title');
  }

  function enhanceControls(controls) {
    if (controls.dataset.menuEnhanced === 'true') return;
    const actions = Array.from(controls.querySelectorAll('.card-action-btn'));
    if (!actions.length) return;

    controls.dataset.menuEnhanced = 'true';

    const wrap = document.createElement('div');
    wrap.className = 'card-more-wrap';

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'card-more-btn';
    more.innerHTML = MORE_ICON;
    more.setAttribute('aria-label', 'Note actions');
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'card-actions-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    actions.forEach(action => {
      labelAction(action);
      action.classList.add('card-menu-action');
      action.setAttribute('role', 'menuitem');
      action.addEventListener('click', () => closeMenus());
      menu.append(action);
    });

    more.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(wrap, menu.hidden);
    });
    menu.addEventListener('click', event => event.stopPropagation());

    wrap.append(more, menu);
    controls.replaceChildren(wrap);
  }

  function enhanceAll() {
    notesList.querySelectorAll('.note-card-controls').forEach(enhanceControls);
  }

  new MutationObserver(() => queueMicrotask(enhanceAll))
    .observe(notesList, { childList: true, subtree: true });

  document.addEventListener('click', event => {
    if (!event.target.closest('.card-more-wrap')) closeMenus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
  });

  window.addEventListener('resize', () => closeMenus());
  window.addEventListener('scroll', () => closeMenus(), { passive: true });

  enhanceAll();
})();