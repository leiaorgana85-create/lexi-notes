(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec';
  const nativeFetch = window.fetch.bind(window);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isTrue = value => value === true || String(value || '').toLowerCase() === 'true';
  const cleanTitle = value => String(value || '').trim() === 'Untitled Note' ? '' : String(value || '');

  function bodyParams(init) {
    const body = init && init.body;
    if (body instanceof URLSearchParams) return new URLSearchParams(body.toString());
    if (typeof body === 'string') return new URLSearchParams(body);
    return new URLSearchParams();
  }

  function jsonResponse(data) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function getJson(params) {
    const url = new URL(API_URL);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    url.searchParams.set('_', String(Date.now()));
    const response = await nativeFetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Verification failed');
    return data;
  }

  async function verifyWrite(params, attempts = 3) {
    const key = params.get('key') || '';
    const action = String(params.get('action') || '').toLowerCase();
    const id = params.get('id') || '';

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt) await delay(300 + attempt * 150);
      try {
        if (action === 'upsert') {
          const data = await getJson({ key, action: 'get', id, pin: params.get('pin') || '' });
          const note = data.note || {};
          const matches = cleanTitle(note.Title) === cleanTitle(params.get('title')) &&
            String(note.Body || '') === String(params.get('body') || '') &&
            isTrue(note.Pinned) === isTrue(params.get('pinned')) &&
            isTrue(note.Locked) === isTrue(params.get('locked'));
          if (matches) return { ok: true, id, updatedAt: note['Updated At'] || '', locked: isTrue(note.Locked) };
        } else if (action === 'pin' || action === 'lock' || action === 'delete') {
          const data = await getJson({ key, action: 'list' });
          const note = (data.notes || []).find(item => String(item.ID) === String(id));
          if (action === 'delete' && !note) return { ok: true, id, archived: true };
          if (action === 'pin' && note && isTrue(note.Pinned) === isTrue(params.get('pinned'))) {
            return { ok: true, id, pinned: isTrue(note.Pinned) };
          }
          if (action === 'lock' && note && isTrue(note.Locked) === isTrue(params.get('locked'))) {
            return { ok: true, id, locked: isTrue(note.Locked) };
          }
        } else if (action === 'setpin') {
          const data = await getJson({ key, action: 'ping' });
          if (data.pinConfigured) return { ok: true, pinConfigured: true };
        }
      } catch (_) {
        // A verification read can race the write; retry a few times.
      }
    }
    throw new Error('Write could not be verified');
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input && input.url;
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (url !== API_URL || method !== 'POST') return nativeFetch(input, init);

    const params = bodyParams(init);
    let firstError = null;
    try {
      const response = await nativeFetch(input, init);
      if (response.ok || response.status !== 404) return response;
      firstError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      firstError = error;
    }

    // Apps Script ContentService responses redirect to script.googleusercontent.com.
    // iOS Home Screen mode can surface the redirected POST response as a 404 even
    // after the write executed. Verify before retrying to avoid duplicate writes.
    try {
      const verified = await verifyWrite(params, 2);
      return jsonResponse(verified);
    } catch (_) {
      // Not visible yet: resend as a simple no-CORS POST, then verify via GET.
    }

    try {
      await nativeFetch(API_URL, {
        method: 'POST',
        body: new URLSearchParams(params.toString()),
        cache: 'no-store',
        redirect: 'follow',
        mode: 'no-cors'
      });
      const verified = await verifyWrite(params, 4);
      return jsonResponse(verified);
    } catch (_) {
      throw firstError || new Error('Write could not be verified');
    }
  };
})();
