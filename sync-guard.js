(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec';
  const PENDING_STORAGE = 'lexiNotesPendingUpsertsV1';
  const DELETED_STORAGE = 'lexiNotesDeletedIdsV1';
  const KNOWN_SERVER_STORAGE = 'lexiNotesKnownServerIdsV1';
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

  function readKnownServerIds() {
    return readJsonStorage(KNOWN_SERVER_STORAGE, {});
  }

  function writeKnownServerIds(ids) {
    const next = {};
    (Array.isArray(ids) ? ids : []).forEach(id => {
      if (id) next[String(id)] = 1;
    });
    localStorage.setItem(KNOWN_SERVER_STORAGE, JSON.stringify(next));
  }

  function addKnownServerId(id) {
    if (!id) return;
    const known = readKnownServerIds();
    known[String(id)] = 1;
    localStorage.setItem(KNOWN_SERVER_STORAGE, JSON.stringify(known));
  }

  function syncServerState(activeIds, archivedIds, previous) {
    const current = [...new Set([...(activeIds || []), ...(archivedIds || [])].filter(Boolean).map(String))];
    const currentSet = new Set(current);

    Object.keys(previous).forEach(id => {
      if (!currentSet.has(id)) {
        markDeleted(id);
        clearPending(id);
      }
    });

    (archivedIds || []).forEach(id => {
      if (!id) return;
      markDeleted(String(id));
      clearPending(String(id));
    });

    // A new-note save may finish after this list request started.
    // Do not mistake that newer ID for a physically deleted Sheet row.
    const concurrent = Object.keys(readKnownServerIds()).filter(id => !previous[id]);
    writeKnownServerIds([...current, ...concurrent]);
  }

  function isDeleted(id) {
    if (!id) return false;
    return Boolean(readJsonStorage('lexiNotesPendingDeletesV1', {})[String(id)]) || Object.prototype.hasOwnProperty.call(readDeleted(), String(id));
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

    const knownAtStart = readKnownServerIds();
    const response = await downstreamFetch(input, init);
    if (!response.ok || (action !== 'list' && action !== 'search')) return response;

    try {
      const data = await response.clone().json();
      if (data && data.ok && Array.isArray(data.notes)) {
        if (action === 'list') {
          const activeIds = data.notes.map(note => note && note.ID).filter(Boolean);
          const archivedIds = Array.isArray(data.deletedIds) ? data.deletedIds : [];
          syncServerState(activeIds, archivedIds, knownAtStart);
        }
        data.notes = data.notes.filter(note => !isDeleted(note && note.ID));
        return jsonResponse(data);
      }
    } catch (_) {
      // Preserve the original response if it is not a normal JSON payload.
    }
    return response;
  }

  async function guardedPost(input, init, params) {
    const action = String(params.get('action') || '').toLowerCase();
    const id = params.get('id') || '';

    if (action === 'upsert' && id && isDeleted(id)) {
      clearPending(id);
      return jsonResponse({ ok: false, error: 'Note is deleted' });
    }

    const response = await downstreamFetch(input, init);

    if (action === 'delete' && id) {
      try {
        const data = await response.clone().json();
        if (data && data.ok === true) {
          markDeleted(id);
          clearPending(id);
        }
      } catch (_) {
        // Do not create a local tombstone unless deletion is confirmed.
      }
      return response;
    }

    if (action !== 'upsert' || !id) return response;

    try {
      const data = await response.clone().json();
      if (data && data.ok === true) addKnownServerId(id);
      if (data && data.ok === false && /permanently deleted/i.test(String(data.error || ''))) {
        markDeleted(id);
        clearPending(id);
      }
    } catch (_) {
      // The normal write transport handles non-JSON/redirect behavior.
    }
    return response;
  }

  window.lexiNotesIsDeleted = isDeleted;

  window.fetch = function guardedFetch(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (!rawUrl) return downstreamFetch(input, init);

    let parsed;
    try { parsed = new URL(rawUrl, location.href); }
    catch (_) { return downstreamFetch(input, init); }
    if (parsed.href.split('?')[0] !== API_URL) return downstreamFetch(input, init);

    if (method === 'GET') return filteredRead(input, init, parsed);
    if (method !== 'POST') return downstreamFetch(input, init);

    return guardedPost(input, init, bodyParams(init));
  };
})();
