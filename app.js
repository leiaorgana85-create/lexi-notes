(() => {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec';
  const KEY_STORAGE = 'lexiNotesApiKey';
  const CACHE_STORAGE = 'lexiNotesIndexCacheV1';
  const PENDING_STORAGE = 'lexiNotesPendingUpsertsV1';
  const PIN_SESSION = 'lexiNotesPinSessionV1';

  const $ = id => document.getElementById(id);
  const topbar=$('topbar'), connectView=$('connectView'), listView=$('listView'), noteView=$('noteView');
  const searchInput=$('searchInput'), clearSearchBtn=$('clearSearchBtn'), notesList=$('notesList'), emptyState=$('emptyState'), syncStatus=$('syncStatus');
  const apiKeyInput=$('apiKeyInput'), connectBtn=$('connectBtn'), connectError=$('connectError'), refreshBtn=$('refreshBtn'), newNoteBtn=$('newNoteBtn');
  const backBtn=$('backBtn'), emailBtn=$('emailBtn'), shareBtn=$('shareBtn'), deleteBtn=$('deleteBtn'), saveBtn=$('saveBtn');
  const lockedGate=$('lockedGate'), unlockBtn=$('unlockBtn'), noteContent=$('noteContent'), readMode=$('readMode'), readTitle=$('readTitle'), readBody=$('readBody');
  const editMode=$('editMode'), titleInput=$('titleInput'), bodyInput=$('bodyInput'), formatBar=$('formatBar'), saveStatus=$('saveStatus'), toast=$('toast');
  const pinDialog=$('pinDialog'), pinForm=$('pinForm'), pinDialogTitle=$('pinDialogTitle'), pinDialogText=$('pinDialogText'), pinInput=$('pinInput'), pinConfirmInput=$('pinConfirmInput'), pinError=$('pinError'), pinCancelBtn=$('pinCancelBtn'), pinSubmitBtn=$('pinSubmitBtn');

  let notes=[], activeId='', activeNote=null, pinConfigured=false, pinResolver=null, pinMode='unlock', dirty=false, searchTimer=0, toastTimer=0, swipeStart=null;
  const isTrue=v=>v===true||String(v||'').toLowerCase()==='true';
  const noteId=()=>`note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  const sessionPin=()=>sessionStorage.getItem(PIN_SESSION)||'';

  const ICONS={
    star:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>`,
    lock:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
    unlock:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M9 10V7a4 4 0 0 1 7-2.6"/></svg>`,
    trash:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="m9 7 .7-2h4.6l.7 2"/><path d="m6.5 7 .8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/></svg>`
  };

  function apiReady(){return /^https:\/\/script\.google\.com\/macros\/s\//.test(API_URL)}
  function readCache(){try{return JSON.parse(localStorage.getItem(CACHE_STORAGE)||'null')}catch(_){return null}}
  function readPending(){try{return JSON.parse(localStorage.getItem(PENDING_STORAGE)||'{}')||{}}catch(_){return {}}}
  function writePending(p){localStorage.setItem(PENDING_STORAGE,JSON.stringify(p))}
  function queuePending(payload){if(payload.locked)return;const p=readPending();p[payload.id]={...payload,pin:undefined};delete p[payload.id].pin;writePending(p)}
  function clearPending(id){const p=readPending();if(Object.prototype.hasOwnProperty.call(p,id)){delete p[id];writePending(p)}}
  function saveCache(){const safe=notes.map(n=>({...n,Body:isTrue(n.Locked)?'':String(n.Body||'')}));localStorage.setItem(CACHE_STORAGE,JSON.stringify({savedAt:Date.now(),notes:safe,pinConfigured}))}
  function mergePending(serverNotes){
    const merged=Array.isArray(serverNotes)?serverNotes.map(n=>({...n})):[];
    Object.values(readPending()).forEach(p=>{
      const i=merged.findIndex(n=>String(n.ID)===String(p.id));
      const local={ID:p.id,Title:p.title,Body:p.body,Pinned:isTrue(p.pinned),Locked:false,Archived:false,'Updated At':p.localUpdatedAt||new Date().toISOString(),'Created At':p.createdAt||p.localUpdatedAt||new Date().toISOString(),'Sort Order':9999};
      if(i>=0)merged[i]={...merged[i],...local};else merged.unshift(local);
    });
    return merged;
  }
  async function flushPending(){
    const pending=readPending(), entries=Object.entries(pending);
    if(!entries.length)return;
    for(const [id,p] of entries){
      try{await requestPost('upsert',p);clearPending(id)}
      catch(_){break}
    }
  }
  function formatDate(v){const t=Date.parse(v||'');if(!Number.isFinite(t))return'';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:new Date(t).getFullYear()===new Date().getFullYear()?undefined:'numeric'}).format(new Date(t))}
  function current(){return notes.find(n=>String(n.ID)===String(activeId))||activeNote}
  function setToolbarMode(mode){const editing=mode==='edit',locked=mode==='locked';emailBtn.hidden=editing||locked;shareBtn.hidden=editing||locked;deleteBtn.hidden=editing||locked;saveBtn.hidden=!editing}
  function showToast(message,error=false){clearTimeout(toastTimer);toast.textContent=message;toast.classList.toggle('error',error);toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true},2200)}

  async function requestGet(action,params={}){
    if(!apiReady()) throw new Error('Backend not deployed yet');
    const key=localStorage.getItem(KEY_STORAGE);if(!key)throw new Error('Not connected');
    const url=new URL(API_URL);url.searchParams.set('key',key);url.searchParams.set('action',action);url.searchParams.set('_',String(Date.now()));
    Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v))});
    const r=await fetch(url,{cache:'no-store',redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(!d.ok)throw new Error(d.error||'Request failed');return d;
  }
  async function requestPost(action,params={}){
    if(!apiReady()) throw new Error('Backend not deployed yet');
    const key=localStorage.getItem(KEY_STORAGE);if(!key)throw new Error('Not connected');
    const body=new URLSearchParams({key,action});Object.entries(params).forEach(([k,v])=>body.set(k,v==null?'':String(v)));
    const r=await fetch(API_URL,{method:'POST',body,cache:'no-store',redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(!d.ok)throw new Error(d.error||'Request failed');return d;
  }

  function showConnect(message=''){connectView.hidden=false;listView.hidden=true;noteView.hidden=true;newNoteBtn.hidden=true;connectError.textContent=message}
  function showList(){connectView.hidden=true;noteView.hidden=true;listView.hidden=false;topbar.hidden=false;newNoteBtn.hidden=false;activeId='';activeNote=null;renderList()}
  function previewFor(note){if(isTrue(note.Locked))return'Locked note';return String(note.Body||'').replace(/\s+/g,' ').trim()||'Empty note'}
  function iconButton(name,classes,label,title){const b=document.createElement('button');b.type='button';b.className=classes;b.innerHTML=ICONS[name];b.setAttribute('aria-label',label);b.title=title;return b}
  function renderList(){
    const q=searchInput.value.trim().toLowerCase();clearSearchBtn.hidden=!q;
    const data=notes.filter(n=>!isTrue(n.Archived)).filter(n=>!q||`${n.Title||''}\n${isTrue(n.Locked)?'':n.Body||''}`.toLowerCase().includes(q)).sort((a,b)=>Number(isTrue(b.Pinned))-Number(isTrue(a.Pinned))||Date.parse(b['Updated At']||0)-Date.parse(a['Updated At']||0));
    notesList.replaceChildren();emptyState.hidden=data.length>0;emptyState.textContent=q?'No notes match your search.':'No notes yet.';
    data.forEach(note=>{
      const card=document.createElement('div');card.className='note-card';
      const inner=document.createElement('div');inner.className='note-card-inner';
      const main=document.createElement('button');main.type='button';main.className='note-main note-open-btn';
      const titleRow=document.createElement('div');titleRow.className='note-title-row';
      const title=document.createElement('div');title.className='note-title';title.textContent=note.Title||'Untitled Note';
      const date=document.createElement('div');date.className='note-date';date.textContent=formatDate(note['Updated At']);
      const preview=document.createElement('div');preview.className='note-preview';preview.textContent=previewFor(note);
      titleRow.append(title,date);main.append(titleRow,preview);main.addEventListener('click',()=>openNote(note.ID));
      const controls=document.createElement('div');controls.className='note-card-controls';
      const pin=iconButton('star','card-action-btn pin-card-btn'+(isTrue(note.Pinned)?' pinned':''),isTrue(note.Pinned)?'Unpin note':'Pin note',isTrue(note.Pinned)?'Unpin':'Pin');
      if(isTrue(note.Pinned))pin.querySelector('svg').style.fill='currentColor';
      pin.addEventListener('click',()=>togglePin(note));
      const locked=isTrue(note.Locked);
      const lock=iconButton(locked?'lock':'unlock','card-action-btn lock-card-btn'+(locked?' locked':''),locked?'Unlock note':'Lock note',locked?'Unlock':'Lock');
      lock.addEventListener('click',()=>toggleLock(note));
      const del=iconButton('trash','card-action-btn delete-card-btn','Delete note','Delete');del.addEventListener('click',()=>deleteNote(note,false));
      controls.append(pin,lock,del);inner.append(main,controls);card.append(inner);notesList.append(card);
    });
  }

  function linkify(target,text){const re=/(?:https?:\/\/|www\.)[^\s<]+/gi;let last=0,m;while((m=re.exec(text))){let shown=m[0],url=shown.startsWith('www.')?`https://${shown}`:shown,trailing='';while(/[),.;!?]$/.test(shown)){trailing=shown.slice(-1)+trailing;shown=shown.slice(0,-1);url=url.slice(0,-1)}if(m.index>last)target.append(document.createTextNode(text.slice(last,m.index)));const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=shown;target.append(a);if(trailing)target.append(document.createTextNode(trailing));last=m.index+m[0].length}if(last<text.length)target.append(document.createTextNode(text.slice(last)))}
  function renderBody(text){readBody.replaceChildren();String(text||'').split('\n').forEach(line=>{const row=document.createElement('div');row.className='read-line';const c=line.match(/^(\s*)\[( |x|X)\]\s*(.*)$/),b=line.match(/^(\s*)[•*-]\s+(.*)$/),n=line.match(/^(\s*)(\d+)\.\s+(.*)$/);if(c){row.classList.add('check');const mark=document.createElement('span');mark.className='marker';mark.textContent=String(c[2]).toLowerCase()==='x'?'☑':'☐';const t=document.createElement('span');linkify(t,c[3]||'');row.append(mark,t)}else if(b){const mark=document.createElement('span');mark.className='marker';mark.textContent='•';const t=document.createElement('span');linkify(t,b[2]||'');row.append(mark,t)}else if(n){const mark=document.createElement('span');mark.className='marker';mark.textContent=`${n[2]}.`;const t=document.createElement('span');linkify(t,n[3]||'');row.append(mark,t)}else if(line==='---'){row.append(document.createElement('hr'))}else linkify(row,line||' ');readBody.append(row)})}
  function paintNote(note){activeNote=note;readTitle.textContent=note.Title||'Untitled Note';renderBody(note.Body||'');lockedGate.hidden=true;noteContent.hidden=false;readMode.hidden=false;editMode.hidden=true;dirty=false;setToolbarMode('read')}

  async function openNote(id){activeId=id;const indexNote=notes.find(n=>String(n.ID)===String(id));if(!indexNote)return;topbar.hidden=true;listView.hidden=true;connectView.hidden=true;noteView.hidden=false;newNoteBtn.hidden=true;if(isTrue(indexNote.Locked)&&!indexNote.Body){noteContent.hidden=true;lockedGate.hidden=false;activeNote=indexNote;setToolbarMode('locked');return}paintNote(indexNote)}
  async function unlockActive(){const pin=sessionPin()||await askPin('unlock');if(!pin)return;try{const d=await requestGet('get',{id:activeId,pin});sessionStorage.setItem(PIN_SESSION,pin);const i=notes.findIndex(n=>String(n.ID)===String(activeId));if(i>=0)notes[i]={...notes[i],...d.note};paintNote(d.note);syncStatus.textContent='Unlocked for this session'}catch(e){sessionStorage.removeItem(PIN_SESSION);showToast(e.message,true)}}

  function enterEdit(focusTarget='body'){const n=current();if(!n)return;readMode.hidden=true;editMode.hidden=false;setToolbarMode('edit');titleInput.value=n.Title||'';bodyInput.value=n.Body||'';dirty=false;saveStatus.textContent='';setTimeout(()=>{if(focusTarget==='title'){titleInput.focus();titleInput.select()}else{bodyInput.focus();const end=bodyInput.value.length;bodyInput.setSelectionRange(end,end)}},20)}
  function markDirty(){dirty=true;saveStatus.textContent='Unsaved'}
  function captureDraft(){
    const n=current();if(!n||editMode.hidden)return null;
    const now=new Date().toISOString(),title=titleInput.value.trim()||'Untitled Note',body=bodyInput.value.replace(/\r/g,'');
    n.Title=title;n.Body=body;n['Updated At']=now;
    const payload={id:n.ID,title,body,pinned:isTrue(n.Pinned),locked:isTrue(n.Locked),pin:isTrue(n.Locked)?sessionPin():'',localUpdatedAt:now,createdAt:n['Created At']||now};
    saveCache();dirty=false;return {note:n,payload};
  }
  function syncDraft(note,payload){
    if(!payload)return;
    if(!payload.locked)queuePending(payload);
    requestPost('upsert',payload).then(d=>{note['Updated At']=d.updatedAt||note['Updated At'];clearPending(note.ID);saveCache();showToast('Saved')}).catch(e=>{showToast(`Save failed: ${e.message}`,true)});
  }
  function saveAndStay(){const draft=captureDraft();if(!draft)return;paintNote(draft.note);syncDraft(draft.note,draft.payload)}
  function goBack(){if(!editMode.hidden){const draft=captureDraft();showList();if(draft)syncDraft(draft.note,draft.payload)}else showList()}

  async function createNote(){const id=noteId(),now=new Date().toISOString(),n={ID:id,'Created At':now,'Updated At':now,Title:'Untitled Note',Body:'',Pinned:false,Locked:false,Archived:false,'Sort Order':9999};notes.unshift(n);activeId=id;topbar.hidden=true;listView.hidden=true;noteView.hidden=false;newNoteBtn.hidden=true;paintNote(n);enterEdit('title');markDirty()}
  async function togglePin(note){if(!note)return;const previous=isTrue(note.Pinned),next=!previous;note.Pinned=next;saveCache();renderList();try{await requestPost('pin',{id:note.ID,pinned:next})}catch(e){note.Pinned=previous;saveCache();renderList();showToast(e.message,true)}}
  async function toggleLock(note){
    if(!note)return;
    if(!pinConfigured){const pin=await askPin('setup');if(!pin)return;try{await requestPost('setpin',{pin});pinConfigured=true;sessionStorage.setItem(PIN_SESSION,pin)}catch(e){showToast(e.message,true);return}}
    let pin=sessionPin();if(!pin){pin=await askPin('unlock');if(!pin)return}
    const next=!isTrue(note.Locked);
    if(next){
      const previousBody=String(note.Body||'');note.Locked=true;note.Body='';sessionStorage.setItem(PIN_SESSION,pin);saveCache();renderList();
      requestPost('lock',{id:note.ID,locked:true,pin}).catch(e=>{note.Locked=false;note.Body=previousBody;saveCache();renderList();sessionStorage.removeItem(PIN_SESSION);showToast(e.message,true)});
    }else{
      try{
        const d=await requestGet('get',{id:note.ID,pin});
        const previous={...note};Object.assign(note,d.note,{Locked:false});sessionStorage.setItem(PIN_SESSION,pin);saveCache();renderList();
        requestPost('lock',{id:note.ID,locked:false,pin}).catch(e=>{Object.assign(note,previous,{Body:''});saveCache();renderList();showToast(e.message,true)});
      }catch(e){sessionStorage.removeItem(PIN_SESSION);showToast(e.message,true)}
    }
  }
  async function deleteNote(note,fromDetail=false){
    if(!note||!confirm(`Delete “${note.Title||'Untitled Note'}”?`))return;
    let pin='';if(isTrue(note.Locked)){pin=sessionPin()||await askPin('unlock');if(!pin)return}
    const index=notes.findIndex(n=>String(n.ID)===String(note.ID));if(index<0)return;
    notes.splice(index,1);clearPending(note.ID);saveCache();if(fromDetail)showList();else renderList();
    try{await requestPost('delete',{id:note.ID,pin});showToast('Deleted')}
    catch(e){notes.splice(Math.min(index,notes.length),0,note);saveCache();renderList();showToast(`Delete failed: ${e.message}`,true)}
  }
  function deleteCurrent(){const n=current();if(n)deleteNote(n,true)}
  function exportText(n){return `${n.Title||'Untitled Note'}\n\n${n.Body||''}`.trim()}
  function emailCurrent(){const n=current();if(n)location.href=`mailto:?subject=${encodeURIComponent(n.Title||'Lexi Note')}&body=${encodeURIComponent(exportText(n))}`}
  async function shareCurrent(){const n=current();if(!n)return;const p={title:n.Title||'Lexi Note',text:exportText(n)};if(navigator.share){try{await navigator.share(p);return}catch(e){if(e.name==='AbortError')return}}try{await navigator.clipboard.writeText(p.text);showToast('Copied note')}catch(_){emailCurrent()}}

  function stripPrefix(line){return line.replace(/^(\s*)(?:•\s+|[-*]\s+|\[(?: |x|X)\]\s+|\d+\.\s+)/,'$1')}
  function replaceLines(fn){const v=bodyInput.value,s=bodyInput.selectionStart,e=bodyInput.selectionEnd,ls=v.lastIndexOf('\n',Math.max(0,s-1))+1,nb=v.indexOf('\n',e),le=nb===-1?v.length:nb,r=v.slice(ls,le).split('\n').map(fn).join('\n');bodyInput.setRangeText(r,ls,le,'select');bodyInput.focus();markDirty()}
  function applyTool(t){if(t==='bullet')return replaceLines(l=>`• ${stripPrefix(l)}`);if(t==='number')return replaceLines((l,i)=>`${i+1}. ${stripPrefix(l)}`);if(t==='check')return replaceLines(l=>`[ ] ${stripPrefix(l)}`);if(t==='indent')return replaceLines(l=>`  ${l}`);if(t==='outdent')return replaceLines(l=>l.startsWith('  ')?l.slice(2):l.startsWith(' ')?l.slice(1):l);if(t==='date'){const d=new Date(),iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,s=bodyInput.selectionStart;bodyInput.setRangeText(`${s>0&&bodyInput.value[s-1]!=='\n'?'\n':''}${iso} — `,s,bodyInput.selectionEnd,'end');bodyInput.focus();markDirty();return}if(t==='undo'||t==='redo'){bodyInput.focus();try{document.execCommand(t)}catch(_){}markDirty()}}
  function listContinue(e){if(e.key!=='Enter'||e.shiftKey||e.metaKey||e.ctrlKey||e.altKey||bodyInput.selectionStart!==bodyInput.selectionEnd)return;const text=bodyInput.value,caret=bodyInput.selectionStart,ls=text.lastIndexOf('\n',Math.max(0,caret-1))+1,line=text.slice(ls,caret),m=line.match(/^(\s*)(•\s+|-\s+|\[(?: |x|X)\]\s+|(\d+)\.\s+)(.*)$/);if(!m)return;e.preventDefault();const ind=m[1]||'',p=m[2]||'',c=m[4]||'';if(!c.trim())bodyInput.setRangeText(ind,ls,caret,'end');else{let np=p;if(/^\[(?: |x|X)\]\s+/.test(p))np='[ ] ';if(m[3])np=`${Number(m[3])+1}. `;bodyInput.setRangeText(`\n${ind}${np}`,caret,caret,'end')}markDirty()}

  function askPin(mode){pinMode=mode;pinError.textContent='';pinInput.value='';pinConfirmInput.value='';pinConfirmInput.hidden=mode!=='setup';pinDialogTitle.textContent=mode==='setup'?'Set Lexi Notes PIN':'Unlock note';pinDialogText.textContent=mode==='setup'?'Choose a PIN for locked notes. It is not stored in the app.':'Enter your Lexi Notes PIN.';pinSubmitBtn.textContent=mode==='setup'?'Set PIN':'Unlock';pinDialog.showModal();setTimeout(()=>pinInput.focus(),20);return new Promise(resolve=>{pinResolver=resolve})}
  function finishPin(value){pinDialog.close();const r=pinResolver;pinResolver=null;if(r)r(value)}
  pinCancelBtn.addEventListener('click',()=>finishPin(''));
  pinForm.addEventListener('submit',e=>{e.preventDefault();const p=pinInput.value;if(pinMode==='setup'){if(p.length<4){pinError.textContent='Use at least 4 characters.';return}if(p!==pinConfirmInput.value){pinError.textContent='PINs do not match.';return}}if(!p){pinError.textContent='Enter your PIN.';return}finishPin(p)});

  async function load(show=true){
    const key=localStorage.getItem(KEY_STORAGE);if(!key){showConnect();return}
    if(show)syncStatus.textContent='Refreshing…';
    try{
      const d=await requestGet('list');notes=mergePending(Array.isArray(d.notes)?d.notes:[]);pinConfigured=Boolean(d.pinConfigured);saveCache();showList();syncStatus.textContent='Synced';flushPending();
    }catch(e){
      if(e.message==='Unauthorized'){localStorage.removeItem(KEY_STORAGE);showConnect('The API key was not accepted.');return}
      const c=readCache();if(c?.notes){notes=c.notes;pinConfigured=Boolean(c.pinConfigured);showList();syncStatus.textContent=`Using saved index · ${e.message}`}else showConnect(e.message);
    }
  }

  searchInput.addEventListener('input',()=>{
    clearSearchBtn.hidden=!searchInput.value;clearTimeout(searchTimer);renderList();
    const q=searchInput.value.trim(),pin=sessionPin();if(!q||!pin)return;
    searchTimer=setTimeout(async()=>{try{const d=await requestGet('search',{q,pin});(d.notes||[]).forEach(remote=>{const i=notes.findIndex(n=>String(n.ID)===String(remote.ID));if(i>=0)notes[i]={...notes[i],...remote};else notes.push(remote)});renderList()}catch(_){}},350);
  });
  clearSearchBtn.addEventListener('click',()=>{searchInput.value='';renderList();searchInput.focus()});
  refreshBtn.addEventListener('click',()=>load(true));
  newNoteBtn.addEventListener('click',createNote);
  backBtn.addEventListener('click',goBack);
  unlockBtn.addEventListener('click',unlockActive);
  saveBtn.addEventListener('click',saveAndStay);
  emailBtn.addEventListener('click',emailCurrent);
  shareBtn.addEventListener('click',shareCurrent);
  deleteBtn.addEventListener('click',deleteCurrent);
  readBody.addEventListener('click',e=>{if(e.target.closest('a'))return;enterEdit('body')});
  titleInput.addEventListener('input',markDirty);
  bodyInput.addEventListener('input',markDirty);
  bodyInput.addEventListener('keydown',listContinue);
  formatBar.addEventListener('pointerdown',e=>e.preventDefault());
  formatBar.addEventListener('click',e=>{const b=e.target.closest('button[data-tool]');if(b)applyTool(b.dataset.tool)});
  connectBtn.addEventListener('click',async()=>{const k=apiKeyInput.value.trim();if(!k)return;localStorage.setItem(KEY_STORAGE,k);connectError.textContent='';await load(true);if(!connectView.hidden)localStorage.removeItem(KEY_STORAGE)});

  noteView.addEventListener('touchstart',e=>{if(e.touches.length!==1||e.touches[0].clientX>52){swipeStart=null;return}swipeStart={x:e.touches[0].clientX,y:e.touches[0].clientY}}, {passive:true});
  noteView.addEventListener('touchend',e=>{if(!swipeStart||!e.changedTouches.length)return;const t=e.changedTouches[0],dx=t.clientX-swipeStart.x,dy=t.clientY-swipeStart.y;swipeStart=null;if(dx>72&&Math.abs(dy)<58&&dx>Math.abs(dy)*1.35)goBack()}, {passive:true});

  const cached=readCache();if(cached?.notes){notes=cached.notes;pinConfigured=Boolean(cached.pinConfigured);renderList()}
  if(localStorage.getItem(KEY_STORAGE))load(false);else showConnect();
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
