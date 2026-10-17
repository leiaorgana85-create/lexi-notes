(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec';
  const KEY_STORAGE = 'lexiNotesApiKey';
  const GOOGLE_LINK_MARKER = 'lexiNotesGoogleLinkedV1';
  const GOOGLE_CLIENT_ID = '543436064136-27a477uk691qocpaft25q925lg88hl98.apps.googleusercontent.com';

  let bridgeFrame = null;
  let bridgeTarget = null;
  let bridgeOrigin = '';
  let bridgeReady = null;
  let bridgeReadyResolve = null;
  let nextId = 1;
  const pending = new Map();

  const currentKey = () => {
    try { return String(localStorage.getItem(KEY_STORAGE) || '').trim(); }
    catch (_) { return ''; }
  };

  const isLinkedLocally = () => {
    try { return localStorage.getItem(GOOGLE_LINK_MARKER) === '1'; }
    catch (_) { return false; }
  };

  function allowedBridgeOrigin(origin) {
    try {
      const host = new URL(origin).hostname;
      return host === 'script.google.com' || host === 'script.googleusercontent.com' || host.endsWith('.googleusercontent.com');
    } catch (_) { return false; }
  }

  function ensureBridge() {
    if (bridgeFrame?.isConnected) return bridgeFrame;
    const frame = document.createElement('iframe');
    frame.title = 'Lexi Notes secure Google auth bridge';
    frame.src = `${API_URL}?authBridge=1&_=${Date.now()}`;
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    bridgeFrame = frame;
    return frame;
  }

  function waitBridge() {
    if (bridgeTarget && bridgeOrigin) return Promise.resolve();
    if (bridgeReady) return bridgeReady;
    ensureBridge();
    bridgeReady = new Promise((resolve, reject) => {
      bridgeReadyResolve = resolve;
      setTimeout(() => {
        if (bridgeTarget && bridgeOrigin) return;
        bridgeReady = null;
        bridgeReadyResolve = null;
        reject(new Error('Could not connect to Lexi Notes authorization.'));
      }, 30000);
    });
    return bridgeReady;
  }

  window.addEventListener('message', event => {
    const d = event.data || {};
    if (d.type === 'lexi-notes-google-auth-ready') {
      if (!allowedBridgeOrigin(event.origin)) return;
      bridgeTarget = event.source;
      bridgeOrigin = event.origin;
      bridgeReadyResolve?.();
      bridgeReady = Promise.resolve();
      bridgeReadyResolve = null;
      return;
    }
    if (d.type !== 'lexi-notes-google-auth-result') return;
    if (!bridgeTarget || event.source !== bridgeTarget || event.origin !== bridgeOrigin) return;
    const item = pending.get(String(d.id || ''));
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(String(d.id));
    d.ok ? item.resolve(d.result) : item.reject(new Error(d.error || 'Google authorization failed.'));
  });

  async function bootstrapWithGoogle(credential) {
    await waitBridge();
    return new Promise((resolve, reject) => {
      const id = `notes-auth-${Date.now()}-${nextId++}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Google authorization timed out.'));
      }, 45000);
      pending.set(id, { resolve, reject, timer });
      bridgeTarget.postMessage({
        type: 'lexi-notes-google-auth',
        id,
        credential,
        currentKey: currentKey()
      }, bridgeOrigin);
    });
  }

  async function loadGoogleIdentity() {
    if (window.google?.accounts?.id) return;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lexi-google-identity]');
      if (existing) {
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.lexiGoogleIdentity = '1';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google sign-in.'));
      document.head.appendChild(script);
    });
  }

  function ensureOverlay() {
    let overlay = document.getElementById('lexiNotesGoogleGate');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'lexiNotesGoogleGate';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(9,11,15,.92);backdrop-filter:blur(6px)';
    overlay.innerHTML = `<div style="width:min(380px,100%);background:#141820;color:#f4f5f7;border:1px solid #2a313d;border-radius:16px;padding:20px;box-shadow:0 18px 60px rgba(0,0,0,.36);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><h2 style="margin:0 0 8px;font-size:20px">Connect Google</h2><p id="lexiNotesGoogleCopy" style="margin:0 0 15px;color:#aab2bf;font-size:13px;line-height:1.45"></p><div id="lexiNotesGoogleButton" style="min-height:44px;display:flex;justify-content:center"></div><div id="lexiNotesGoogleError" style="min-height:20px;margin-top:9px;color:#ff9b9b;font-size:12px"></div><button id="lexiNotesGoogleLater" type="button" style="width:100%;min-height:38px;margin-top:4px;border:1px solid #343c48;border-radius:9px;background:transparent;color:#f4f5f7">Use API key instead</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#lexiNotesGoogleLater').addEventListener('click', () => {
      overlay.style.display = 'none';
      document.getElementById('connectView')?.removeAttribute('hidden');
    });
    return overlay;
  }

  async function showGoogleGate() {
    const overlay = ensureOverlay();
    const hasKey = Boolean(currentKey());
    overlay.querySelector('#lexiNotesGoogleCopy').textContent = hasKey
      ? 'Connect your Google account once so future Home Screen installs can restore access without typing the API key.'
      : 'Use your linked Google account to restore Lexi Notes access on this install.';
    overlay.style.display = 'flex';

    const holder = overlay.querySelector('#lexiNotesGoogleButton');
    const error = overlay.querySelector('#lexiNotesGoogleError');
    holder.innerHTML = '';
    error.textContent = '';

    try {
      await loadGoogleIdentity();
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async response => {
          error.textContent = '';
          try {
            const result = await bootstrapWithGoogle(String(response?.credential || ''));
            const key = String(result?.key || '').trim();
            if (!result?.ok || !key) throw new Error('Lexi Notes access was not returned.');
            localStorage.setItem(KEY_STORAGE, key);
            localStorage.setItem(GOOGLE_LINK_MARKER, '1');
            overlay.style.display = 'none';
            window.location.reload();
          } catch (e) {
            error.textContent = e?.message || 'Could not connect Google.';
          }
        }
      });
      google.accounts.id.renderButton(holder, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 300
      });
    } catch (e) {
      error.textContent = e?.message || 'Could not load Google sign-in.';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    ensureBridge();
    if (!currentKey() || !isLinkedLocally()) setTimeout(showGoogleGate, 300);
  });
})();
