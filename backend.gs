// Lexi Notes backend. Bind this script to the "LEXI Notes Data" spreadsheet.
// Live bound Apps Script filename: Code.gs. Repository source filename: backend.gs.
// Script Properties required:
//   LEXI_NOTES_API_KEY   = private API key
//   LEXI_NOTES_PIN_HASH  = created by the app when the owner first sets a PIN
// Internal Script Properties with prefix LEXI_NOTES_SEEN_ store only SHA-256 hashes
// of note IDs. They contain no note title/body and prevent a physically deleted
// Sheet row from being recreated by stale client data.

const LEXI_NOTES_SHEET = 'NOTES';
const LEXI_NOTES_HEADERS = ['ID','Created At','Updated At','Title','Body','Pinned','Locked','Archived','Sort Order'];
const LEXI_NOTES_SEEN_PREFIX = 'LEXI_NOTES_SEEN_';
const LEXI_GOOGLE_CLIENT_ID = '543436064136-27a477uk691qocpaft25q925lg88hl98.apps.googleusercontent.com';
const LEXI_NOTES_GOOGLE_SUB_PROPERTY = 'LEXI_NOTES_GOOGLE_SUB_V1';
const LEXI_NOTES_INSTALL_HASH_PROPERTY = 'LEXI_NOTES_INSTALL_TOKEN_HASH_V1';
const LEXI_NOTES_INSTALL_EXPIRES_PROPERTY = 'LEXI_NOTES_INSTALL_TOKEN_EXPIRES_V1';

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    if (String(p.authBridge || '') === '1') return notesAuthBridgeHtml_();
    const action = String(p.action || 'list').toLowerCase();
    requireApiKey_(p.key);
    if (action === 'ping') return json_({ok:true, app:'Lexi Notes', pinConfigured:pinConfigured_()});
    if (action === 'list') {
      const state = listState_();
      return json_({ok:true, notes:state.notes, deletedIds:state.deletedIds, pinConfigured:pinConfigured_()});
    }
    if (action === 'get') return json_(getNote_(p.id, p.pin));
    if (action === 'search') return json_({ok:true, notes:searchNotes_(p.q, p.pin), pinConfigured:pinConfigured_()});
    return json_({ok:false,error:'Unknown action'});
  } catch (error) {
    return json_({ok:false,error:error && error.message ? error.message : String(error)});
  }
}

function doPost(e) {
  try {
    requireApiKey_(e && e.parameter ? e.parameter.key : '');
    const p = e.parameter || {};
    const action = String(p.action || '').toLowerCase();
    if (action === 'setpin') return json_(setPin_(p.pin, p.currentPin));
    if (action === 'upsert') return json_(upsertNote_(p));
    if (action === 'pin') return json_(setPinned_(p));
    if (action === 'lock') return json_(setLocked_(p));
    if (action === 'delete') return json_(deleteNote_(p));
    return json_({ok:false,error:'Unknown action'});
  } catch (error) {
    return json_({ok:false,error:error && error.message ? error.message : String(error)});
  }
}

function notesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEXI_NOTES_SHEET);
  if (!sheet) throw new Error('Missing NOTES sheet');
  const headers = sheet.getRange(1,1,1,LEXI_NOTES_HEADERS.length).getDisplayValues()[0];
  if (headers.join('|') !== LEXI_NOTES_HEADERS.join('|')) throw new Error('NOTES schema does not match Lexi Notes backend');
  return sheet;
}

function requireApiKey_(key) {
  const saved = PropertiesService.getScriptProperties().getProperty('LEXI_NOTES_API_KEY');
  if (!saved || String(key || '') !== saved) throw new Error('Unauthorized');
}

function authGoogleBootstrap(credential, currentKey) {
  const identity = verifyLexiNotesGoogleCredential_(credential);
  const props = PropertiesService.getScriptProperties();
  const savedKey = props.getProperty('LEXI_NOTES_API_KEY');
  if (!savedKey) throw new Error('Notes API key is not configured.');

  const linkedSub = String(props.getProperty(LEXI_NOTES_GOOGLE_SUB_PROPERTY) || '').trim();
  let linkedNow = false;

  if (!linkedSub) {
    if (String(currentKey || '').trim() !== savedKey) {
      throw new Error('First Google link requires the current Notes API key on this device.');
    }
    props.setProperty(LEXI_NOTES_GOOGLE_SUB_PROPERTY, identity.sub);
    linkedNow = true;
  } else if (identity.sub !== linkedSub) {
    throw new Error('This Google account is not linked to Lexi Notes.');
  }

  props.deleteProperty(LEXI_NOTES_INSTALL_HASH_PROPERTY);
  props.deleteProperty(LEXI_NOTES_INSTALL_EXPIRES_PROPERTY);
  return {ok:true,key:savedKey,linkedNow:linkedNow};
}

function verifyLexiNotesGoogleCredential_(credential) {
  const token = String(credential || '').trim();
  if (!token) throw new Error('Google sign-in credential is missing.');

  const response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    {muteHttpExceptions:true}
  );
  if (response.getResponseCode() !== 200) throw new Error('Google sign-in could not be verified.');

  let data;
  try { data = JSON.parse(response.getContentText()); }
  catch (_) { throw new Error('Google sign-in response was invalid.'); }

  const issuer = String(data.iss || '');
  if (String(data.aud || '') !== LEXI_GOOGLE_CLIENT_ID) throw new Error('Google sign-in audience mismatch.');
  if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') throw new Error('Google sign-in issuer mismatch.');
  if (String(data.email_verified || '').toLowerCase() !== 'true') throw new Error('Google account email is not verified.');
  if (!data.sub || Number(data.exp || 0) * 1000 <= Date.now()) throw new Error('Google sign-in credential expired.');
  return {sub:String(data.sub)};
}

function notesAuthBridgeHtml_() {
  const html = `<!doctype html><html><body><script>
(() => {
  'use strict';
  const PARENT_ORIGIN = 'https://leiaorgana85-create.github.io';
  const post = (id, ok, result, error) => {
    window.top.postMessage({type:'lexi-notes-google-auth-result',id,ok,result,error},PARENT_ORIGIN);
  };
  window.addEventListener('message', event => {
    if (event.origin !== PARENT_ORIGIN || event.source !== window.top) return;
    const d = event.data || {};
    if (d.type !== 'lexi-notes-google-auth' || !d.id) return;
    google.script.run
      .withSuccessHandler(result => post(String(d.id),true,result,''))
      .withFailureHandler(error => post(String(d.id),false,null,error && error.message ? error.message : String(error)))
      .authGoogleBootstrap(String(d.credential || ''), String(d.currentKey || ''));
  });
  window.top.postMessage({type:'lexi-notes-google-auth-ready'},PARENT_ORIGIN);
})();
<\/script></body></html>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function bool_(value) { return value === true || String(value || '').trim().toLowerCase() === 'true'; }
function hash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b < 0 ? b + 256 : b).toString(16))).slice(-2)).join('');
}
function iso_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return value.toISOString();
  return String(value);
}
function pinConfigured_() { return Boolean(PropertiesService.getScriptProperties().getProperty('LEXI_NOTES_PIN_HASH')); }
function validPin_(pin) {
  const saved = PropertiesService.getScriptProperties().getProperty('LEXI_NOTES_PIN_HASH');
  return Boolean(saved && pin && hash_(pin) === saved);
}
function requirePin_(pin) { if (!validPin_(pin)) throw new Error('Invalid PIN'); }
function withWriteLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function seenKey_(id) { return LEXI_NOTES_SEEN_PREFIX + hash_(String(id || '').trim()); }
function rememberIds_(ids) {
  const values = (Array.isArray(ids) ? ids : []).map(id=>String(id||'').trim()).filter(Boolean);
  if (!values.length) return;
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperties();
  const additions = {};
  values.forEach(id=>{ const key=seenKey_(id); if (!existing[key]) additions[key]='1'; });
  if (Object.keys(additions).length) props.setProperties(additions, false);
}
function rememberId_(id) { rememberIds_([id]); }
function wasSeenId_(id) {
  const value=String(id||'').trim();
  if(!value) return false;
  return PropertiesService.getScriptProperties().getProperty(seenKey_(value)) === '1';
}

function rowObject_(row) {
  const o = {}; LEXI_NOTES_HEADERS.forEach((h,i)=>o[h]=row[i]); return o;
}
function displayObject_(row) {
  const o = rowObject_(row);
  const locked = bool_(o.Locked);
  return {
    ID:String(o.ID||''),
    'Created At':iso_(o['Created At']),
    'Updated At':iso_(o['Updated At']),
    Title:String(o.Title||'Untitled Note'),
    Body:locked ? '' : String(o.Body||''),
    Pinned:bool_(o.Pinned),
    Locked:locked,
    Archived:bool_(o.Archived),
    'Sort Order':o['Sort Order']||''
  };
}
function allRows_() {
  const s=notesSheet_(), last=s.getLastRow();
  if(last<2) return [];
  return s.getRange(2,1,last-1,LEXI_NOTES_HEADERS.length).getValues();
}
function findRow_(id) {
  const s=notesSheet_(), last=s.getLastRow(); if(last<2) return 0;
  const ids=s.getRange(2,1,last-1,1).getDisplayValues();
  for(let i=0;i<ids.length;i++) if(String(ids[i][0])===String(id)) return i+2;
  return 0;
}

function listState_() {
  const rows=allRows_();
  rememberIds_(rows.map(row=>row[0]));
  const displayed=rows.map(displayObject_).filter(n=>n.ID);
  return {
    notes: displayed.filter(n=>!n.Archived).sort((a,b)=>Number(b.Pinned)-Number(a.Pinned)||Number(a['Sort Order']||9999)-Number(b['Sort Order']||9999)||String(b['Updated At']).localeCompare(String(a['Updated At']))),
    deletedIds: displayed.filter(n=>n.Archived).map(n=>String(n.ID))
  };
}
function getNote_(id,pin) {
  const row=findRow_(id); if(!row) return {ok:false,error:'Note not found'};
  rememberId_(id);
  const raw=notesSheet_().getRange(row,1,1,LEXI_NOTES_HEADERS.length).getValues()[0];
  const note=displayObject_(raw); if(note.Archived) return {ok:false,error:'Note not found'};
  if(note.Locked) { requirePin_(pin); note.Body=String(raw[4]||''); }
  return {ok:true,note:note};
}
function searchNotes_(q,pin) {
  const needle=String(q||'').trim().toLowerCase(); if(!needle) return listState_().notes;
  const allowLocked=validPin_(pin), rows=allRows_();
  rememberIds_(rows.map(row=>row[0]));
  return rows.map(raw=>({raw,note:displayObject_(raw)})).filter(({raw,note})=>{
    if(!note.ID||note.Archived) return false;
    const body=(!note.Locked||allowLocked)?String(raw[4]||''):'';
    return `${note.Title}\n${body}`.toLowerCase().includes(needle);
  }).map(({raw,note})=>{ if(note.Locked&&allowLocked) note.Body=String(raw[4]||''); return note; });
}
function setPin_(pin,currentPin) {
  const value=String(pin||''); if(value.length<4) return {ok:false,error:'PIN must be at least 4 characters'};
  if(pinConfigured_()) requirePin_(currentPin);
  PropertiesService.getScriptProperties().setProperty('LEXI_NOTES_PIN_HASH',hash_(value));
  return {ok:true,pinConfigured:true};
}
function upsertNote_(p) {
  return withWriteLock_(()=>{
    const id=String(p.id||'').trim(); if(!id) return {ok:false,error:'Missing note ID'};
    const s=notesSheet_(), row=findRow_(id), now=new Date();
    if(!row&&wasSeenId_(id)) return {ok:false,error:'Note was permanently deleted'};
    const existing=row?s.getRange(row,1,1,LEXI_NOTES_HEADERS.length).getValues()[0]:null;
    if(existing&&bool_(existing[7])) return {ok:false,error:'Note is deleted'};
    if(existing&&bool_(existing[6])) requirePin_(p.pin);
    const locked=Object.prototype.hasOwnProperty.call(p,'locked')?bool_(p.locked):(existing?bool_(existing[6]):false);
    if(locked&&!validPin_(p.pin)) throw new Error('PIN required for locked note');
    const values=existing||[id,now,now,'','',false,false,false,9999];
    values[0]=id; if(!values[1]) values[1]=now; values[2]=now;
    values[3]=String(p.title||'').trim()||'Untitled Note';
    values[4]=String(p.body||'');
    values[5]=bool_(p.pinned); values[6]=locked; if(!values[8]) values[8]=9999;
    if(row) s.getRange(row,1,1,values.length).setValues([values]); else s.appendRow(values);
    rememberId_(id);
    SpreadsheetApp.flush(); return {ok:true,id:id,updatedAt:now.toISOString(),locked:locked};
  });
}
function setPinned_(p) {
  return withWriteLock_(()=>{
    const row=findRow_(p.id); if(!row) return {ok:false,error:'Note not found'};
    rememberId_(p.id);
    const s=notesSheet_(), state=s.getRange(row,6,1,3).getValues()[0];
    if(bool_(state[2])) return {ok:false,error:'Note not found'};
    const pinned=bool_(p.pinned), now=new Date();
    s.getRange(row,6).setValue(pinned); s.getRange(row,3).setValue(now); SpreadsheetApp.flush();
    return {ok:true,id:String(p.id),pinned:pinned};
  });
}
function setLocked_(p) {
  if(!pinConfigured_()) return {ok:false,error:'PIN not configured'};
  requirePin_(p.pin);
  return withWriteLock_(()=>{
    const row=findRow_(p.id); if(!row) return {ok:false,error:'Note not found'};
    rememberId_(p.id);
    const s=notesSheet_(), state=s.getRange(row,7,1,2).getValues()[0];
    if(bool_(state[1])) return {ok:false,error:'Note not found'};
    const locked=bool_(p.locked), now=new Date();
    s.getRange(row,7).setValue(locked); s.getRange(row,3).setValue(now); SpreadsheetApp.flush();
    return {ok:true,id:String(p.id),locked:locked};
  });
}
function deleteNote_(p) {
  return withWriteLock_(()=>{
    const row=findRow_(p.id); if(!row) return {ok:true,id:String(p.id),alreadyMissing:true};
    rememberId_(p.id);
    const s=notesSheet_(), state=s.getRange(row,7,1,2).getValues()[0];
    if(bool_(state[0])) requirePin_(p.pin);
    if(bool_(state[1])) return {ok:true,id:String(p.id),archived:true,alreadyDeleted:true};
    const now=new Date();
    s.getRange(row,8).setValue(true); s.getRange(row,3).setValue(now); SpreadsheetApp.flush();
    return {ok:true,id:String(p.id),archived:true};
  });
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
