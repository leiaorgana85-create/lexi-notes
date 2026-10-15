(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec';
  const PENDING_STORAGE = 'lexiNotesPendingUpsertsV1';
  const DELETED_STORAGE = 'lexiNotesDeletedIdsV1';
  const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1000;
  const downstreamFetch = window.fetch.bind(window);

  function readJsonStorage(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
    catch (_) { return fallback; }
  }

  function writeDeleted(records) {
    localStorage.setItem(DELETED_STORAGE, JSON.stringify(records));
  }

  function readDeleted() {
    const records = readJsonStorage(DELETED_STORAGE, {});
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    let changed = false;
    Object.keys(records).forEach(id => {
      if (!Number.isFinite(Number(records[id])) || Number(records[id]) < cutoff) {
        delete records[id];
        changed = true;
      }
    });
    if (changed) writeDeleted(records);
    return records;
  }

  function markDeleted(id) {
    if (!id) return;
    const records = readDeleted();
    records[String(id)] = Date.now();
    writeDeleted(records);
  }

  function syncDeleted(ids) {
    const next = {};
    const now = Date.now();
    (Array.isArray(ids) ? ids : []).forEach(id => {
      if (!id) return;
      next[String(id)] = now;
      clearPending(String(id));
    });
    writeDeleted(next);
  }

  function isDeleted(id) {
    if (!id) return false;
    return Object.prototype.hasOwnProperty.call(readDeleted(), String(id));
  }

  function clearPending(id) {
    if (!id) return;
    const pending = readJsonStorage(PENDING_STORAGE, {});
    if (!Object.prototype.hasOwnProperty.call(pending, String(id))) return;
    delete pending[String(id)];
    localStorage.setItem(PENDING_STORAGE, JSON.stringify(pending));
  }

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

  async function filteredRead(input, init, url) {
    const action = String(url.searchParams.get('action') || 'list').toLowerCase();
    const id = url.searchParams.get('id') || '';
    if (action === 'get' && isDeleted(id)) return jsonResponse({ ok: false, error: 'Note not found' });

    const response = await downstreamFetch(input, init);
    if (!response.ok || (action !== 'list' && action !== 'search')) return response;

    try {
      const data = await response.clone().json();
      if (data && data.ok && Array.isArray(data.notes)) {
        if (action === 'list' && Array.isArray(data.deletedIds)) syncDeleted(data.deletedIds);
        data.notes = data.notes.filter(note => !isDeleted(note && note.ID));
        return jsonResponse(data);
      }
    } catch (_) {
      // Preserve the original response if it is not a normal JSON payload.
    }
    return response;
  }

  window.fetch = function guardedFetch(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input && input.url;
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (!rawUrl) return downstreamFetch(input, init);

    let parsed;
    try { parsed = new URL(rawUrl, location.href); }
    catch (_) { return downstreamFetch(input, init); }
    if (parsed.href.split('?')[0] !== API_URL) return downstreamFetch(input, init);

    if (method === 'GET') return filteredRead(input, init, parsed);
    if (method !== 'POST') return downstreamFetch(input, init);

    const params = bodyParams(init);
    const action = String(params.get('action') || '').toLowerCase();
    const id = params.get('id') || '';

    if (action === 'delete' && id) {
      markDeleted(id);
      clearPending(id);
    }
    if (action === 'upsert' && id && isDeleted(id)) {
      clearPending(id);
      return Promise.resolve(jsonResponse({ ok: false, error: 'Note is deleted' }));
    }

    return downstreamFetch(input, init);
  };
})();
