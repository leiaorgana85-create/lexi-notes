(() => {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec';
  const KEY_STORAGE = 'lexiNotesApiKey';
  const CACHE_STORAGE = 'lexiNotesIndexCacheV1';
  const PENDING_STORAGE = 'lexiNotesPendingUpsertsV1';
  const DELETE_STORAGE = 'lexiNotesPendingDeletesV1';
  const VIEW_STORAGE = 'lexiNotesLastViewV1';
  const PIN_SESSION = 'lexiNotesPinSessionV1';

  const $ = id => document.getElementById(id);
  const topbar=$('topbar'), connectView=$('connectView'), listView=$('listView'), noteView=$('noteView');
  const searchInput=$('searchInput'), clearSearchBtn=$('clearSearchBtn'), notesList=$('notesList'), emptyState=$('emptyState'), syncStatus=$('syncStatus');
  const apiKeyInput=$('apiKeyInput'), connectBtn=$('connectBtn'), connectError=$('connectError'), refreshBtn=$('refreshBtn'), newNoteBtn=$('newNoteBtn');
  const backBtn=$('backBtn'), editBtn=$('editBtn'), emailBtn=$('emailBtn'), shareBtn=$('shareBtn'), deleteBtn=$('deleteBtn'), saveBtn=$('saveBtn');
  const lockedGate=$('lockedGate'), unlockBtn=$('unlockBtn'), noteContent=$('noteContent'), readMode=$('readMode'), readTitle=$('readTitle'), readBody=$('readBody');
  const editMode=$('editMode'), titleInput=$('titleInput'), bodyInput=$('bodyInput'), formatBar=$('formatBar'), saveStatus=$('saveStatus'), toast=$('toast');
  const pinDialog=$('pinDialog'), pinForm=$('pinForm'), pinDialogTitle=$('pinDialogTitle'), pinDialogText=$('pinDialogText'), pinInput=$('pinInput'), pinConfirmInput=$('pinConfirmInput'), pinError=$('pinError'), pinCancelBtn=$('pinCancelBtn'), pinSubmitBtn=$('pinSubmitBtn');

  let notes=[], activeId='', activeNote=null, pinConfigured=false, pinResolver=null, pinMode='unlock', dirty=false, searchTimer=0, toastTimer=0, swipeStart=null, interactionRevision=0;
  const isTrue=v=>v===true||String(v||'').toLowerCase()==='true';
  const cleanTitle=v=>String(v||'').trim()==='Untitled Note'?'':String(v||'');
  const isBlankNote=(title,body)=>!cleanTitle(title).trim()&&!String(body||'').trim();
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
  function readViewState(){try{return JSON.parse(localStorage.getItem(VIEW_STORAGE)||'null')}catch(_){return null}}
  function rememberView(view,id=''){try{localStorage.setItem(VIEW_STORAGE,JSON.stringify(view==='note'&&id?{view:'note',id:String(id)}:{view:'list'}))}catch(_){}}
  function readPending(){try{return JSON.parse(localStorage.getItem(PENDING_STORAGE)||'{}')||{}}catch(_){return {}}}
  function writePending(p){localStorage.setItem(PENDING_STORAGE,JSON.stringify(p))}
  function pendingToken(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`}
  function queuePending(payload){
    if(payload.locked)return '';
    const p=readPending(),token=pendingToken(),record={...payload,_pendingToken:token,pin:undefined};
    delete record.pin;p[payload.id]=record;writePending(p);return token;
  }
  function pendingPayload(record){const clean={...record};delete clean._pendingToken;delete clean.pin;return clean}
  function clearPending(id,token=''){
    const p=readPending(),current=p[id];
    if(!current)return false;
    if(token&&current._pendingToken&&current._pendingToken!==token)return false;
    delete p[id];writePending(p);return true;
  }
  function readPendingDeletes(){try{return JSON.parse(localStorage.getItem(DELETE_STORAGE)||'{}')||{}}catch(_){return {}}}
  function locallyDeleted(id){return Boolean(readPendingDeletes()[id]||window.lexiNotesIsDeleted?.(id))}
  function noteInteraction(){interactionRevision+=1}
  function saveCache(){const safe=notes.filter(n=>!locallyDeleted(n.ID)).map(n=>({...n,Body:isTrue(n.Locked)?'':String(n.Body||'')}));localStorage.setItem(CACHE_STORAGE,JSON.stringify({savedAt:Date.now(),notes:safe,pinConfigured}))}
  function mergePending(serverNotes){
    const merged=Array.isArray(serverNotes)?serverNotes.map(n=>({...n,Title:cleanTitle(n.Title)})):[];
    const pending=readPending(),serverIds=new Set(merged.map(n=>String(n.ID))),entries=Object.entries(pending);let changed=false;
    entries.forEach(([id,p])=>{
      if(locallyDeleted(id)){delete pending[id];changed=true;return}
      if(!serverIds.has(String(id))&&isBlankNote(p.title,p.body)){delete pending[id];changed=true;return}
      const i=merged.findIndex(n=>String(n.ID)===String(p.id));
      if(i>=0&&isTrue(merged[i].Locked))return;
      const local={ID:p.id,Title:p.title,Body:p.body,Pinned:isTrue(p.pinned),Locked:false,Archived:false,'Updated At':p.localUpdatedAt||new Date().toISOString(),'Created At':p.createdAt||p.localUpdatedAt||new Date().toISOString(),'Sort Order':9999};
      if(i>=0)merged[i]={...merged[i],...local};else merged.unshift(local);
    });
    if(changed)writePending(pending);
    return merged.filter(n=>!locallyDeleted(n.ID));
  }
  let pendingFlight=null, syncing=false, lastSyncError='';
  function updateSyncStatus(){
    const count=Object.keys(readPending()).length+Object.keys(readPendingDeletes()).length;
    syncStatus.textContent=navigator.onLine===false
      ?(count?`Offline · ${count} saved on device · sync pending`:'Offline · saved notes available')
      :count
        ?syncing?`Syncing · ${count} change${count===1?'':'s'} remaining`
          :lastSyncError?`Saved on device · ${count} pending · ${lastSyncError}`:`Saved on device · ${count} pending`
        :'Synced';
  }
  function flushPending(){
    if(navigator.onLine===false){updateSyncStatus();return Promise.resolve()}
    if(pendingFlight)return pendingFlight;
    syncing=true;lastSyncError='';updateSyncStatus();
    pendingFlight=drainPending().finally(()=>{pendingFlight=null;syncing=false;updateSyncStatus()});
    return pendingFlight;
  }
  async function drainPending(){
    for(const [id,entry] of Object.entries(readPendingDeletes())){
      if(navigator.onLine===false)return;
      try{
        const pin=entry.locked?sessionPin():'';
        if(entry.locked&&!pin)throw new Error('PIN needed to finish deleting locked note');
        await requestPost('delete',{id,pin});
        const latest=readPendingDeletes();
        if(latest[id]?.token===entry.token){delete latest[id];localStorage.setItem(DELETE_STORAGE,JSON.stringify(latest))}
        updateSyncStatus();
      }catch(error){lastSyncError=String(error.message||'Connection failed')}
    }
    const pending=readPending(), entries=Object.entries(pending);
    if(!entries.length)return;
    for(const [id] of entries){
      // Re-read after each await: typing may have replaced a queued version.
      while(navigator.onLine!==false){
        if(locallyDeleted(id)){clearPending(id);break}
        const p=readPending()[id];if(!p)break;
        const token=p._pendingToken||'';
        try{await requestPost('upsert',pendingPayload(p));clearPending(id,token);updateSyncStatus()}
        catch(error){lastSyncError=String(error.message||'Connection failed');break}

      }
    }
  }
  async function flushPendingForId(id){
    await flushPending();
    if(readPending()[id])throw new Error('Changes are saved on this device and waiting to sync');
  }
  function formatDate(v){const t=Date.parse(v||'');if(!Number.isFinite(t))return'';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:new Date(t).getFullYear()===new Date().getFullYear()?undefined:'numeric'}).format(new Date(t))}
  function current(){return notes.find(n=>String(n.ID)===String(activeId))||activeNote}
  function setToolbarMode(mode){const editing=mode==='edit',locked=mode==='locked';editBtn.hidden=editing||locked;emailBtn.hidden=editing||locked;shareBtn.hidden=editing||locked;deleteBtn.hidden=editing||locked;saveBtn.hidden=!editing}
  function showToast(message,error=false){clearTimeout(toastTimer);toast.textContent=message;toast.classList.toggle('error',error);toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true},2200)}

  async function requestGet(action,params={}){
    if(!apiReady()) throw new Error('Backend not deployed yet');
    const key=localStorage.getItem(KEY_STORAGE);if(!key)throw new Error('Not connected');
    const url=new URL(API_URL);url.searchParams.set('key',key);url.searchParams.set('action',action);url.searchParams.set('_',String(Date.now()));
    Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v))});
    const r=await fetch(url.toString(),{cache:'no-store',redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(!d.ok)throw new Error(d.error||'Request failed');return d;
  }
  async function requestPost(action,params={}){
    if(!apiReady()) throw new Error('Backend not deployed yet');
    const key=localStorage.getItem(KEY_STORAGE);if(!key)throw new Error('Not connected');
    const body=new URLSearchParams({key,action});Object.entries(params).forEach(([k,v])=>body.set(k,v==null?'':String(v)));
    const r=await fetch(API_URL,{method:'POST',body,cache:'no-store',redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(!d.ok)throw new Error(d.error||'Request failed');return d;
  }

  function showConnect(message=''){connectView.hidden=false;listView.hidden=true;noteView.hidden=true;newNoteBtn.hidden=true;connectError.textContent=message}
  function showList(remember=true){connectView.hidden=true;noteView.hidden=true;listView.hidden=false;topbar.hidden=false;newNoteBtn.hidden=false;activeId='';activeNote=null;if(remember)rememberView('list');renderList()}
  function restoreLastView(){const state=readViewState();if(state?.view==='note'&&state.id){const note=notes.find(n=>String(n.ID)===String(state.id)&&!isTrue(n.Archived));if(note){openNote(note.ID,false);return}}showList()}
  function previewFor(note){if(isTrue(note.Locked))return'Locked note';return String(note.Body||'').replace(/\s+/g,' ').trim()||'Empty note'}
  function iconButton(name,classes,label,title){const b=document.createElement('button');b.type='button';b.className=classes;b.innerHTML=ICONS[name];b.setAttribute('aria-label',label);b.title=title;return b}
  function appendNoteCard(note,target){
    const card=document.createElement('div');card.className='note-card';
    const inner=document.createElement('div');inner.className='note-card-inner';
    const main=document.createElement('button');main.type='button';main.className='note-main note-open-btn';
    const titleRow=document.createElement('div');titleRow.className='note-title-row';
    const title=document.createElement('div');title.className='note-title';title.textContent=cleanTitle(note.Title);
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
    controls.append(pin,lock,del);inner.append(main,controls);card.append(inner);target.append(card);
  }
  function appendSection(label,data){
    if(!data.length)return;
    const section=document.createElement('section');section.className='note-list-section';
    const heading=document.createElement('div');heading.className='note-list-heading';heading.textContent=label;
    const list=document.createElement('div');list.className='note-section-list';
    data.forEach(note=>appendNoteCard(note,list));section.append(heading,list);notesList.append(section);
  }
  function renderList(){
    const q=searchInput.value.trim().toLowerCase();clearSearchBtn.hidden=!q;
    const data=notes.filter(n=>!isTrue(n.Archived)&&!locallyDeleted(n.ID)).filter(n=>!q||`${n.Title||''}\n${isTrue(n.Locked)?'':n.Body||''}`.toLowerCase().includes(q)).sort((a,b)=>Date.parse(b['Updated At']||0)-Date.parse(a['Updated At']||0));
    const pinned=data.filter(n=>isTrue(n.Pinned)),regular=data.filter(n=>!isTrue(n.Pinned));
    notesList.replaceChildren();emptyState.hidden=data.length>0;emptyState.textContent=q?'No notes match your search.':'No notes yet.';
    appendSection('Pinned',pinned);appendSection('Notes',regular);
  }

  function linkify(target,text){const re=/(?:https?:\/\/|www\.)[^\s<]+/gi;let last=0,m;while((m=re.exec(text))){let shown=m[0],url=shown.startsWith('www.')?`https://${shown}`:shown,trailing='';while(/[),.;!?]$/.test(shown)){trailing=shown.slice(-1)+trailing;shown=shown.slice(0,-1);url=url.slice(0,-1)}if(m.index>last)target.append(document.createTextNode(text.slice(last,m.index)));const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=shown;target.append(a);if(trailing)target.append(document.createTextNode(trailing));last=m.index+m[0].length}if(last<text.length)target.append(document.createTextNode(text.slice(last)))}
  function checkIcon(checked){return checked?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.6 2.6L16.5 9"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>'}
  function renderBody(text){readBody.replaceChildren();String(text||'').split('\n').forEach((line,lineIndex)=>{const row=document.createElement('div');row.className='read-line';const c=line.match(/^(\s*)\[( |x|X)\]\s*(.*)$/),b=line.match(/^(\s*)[•*-]\s+(.*)$/),n=line.match(/^(\s*)(\d+)\.\s+(.*)$/);if(c){row.classList.add('check');const checked=String(c[2]).toLowerCase()==='x';const mark=document.createElement('button');mark.type='button';mark.className='marker check-toggle';mark.dataset.checkLine=String(lineIndex);mark.innerHTML=checkIcon(checked);mark.setAttribute('aria-label',checked?'Mark incomplete':'Mark complete');mark.setAttribute('aria-pressed',String(checked));const t=document.createElement('span');linkify(t,c[3]||'');row.append(mark,t)}else if(b){const mark=document.createElement('span');mark.className='marker';mark.textContent='•';const t=document.createElement('span');linkify(t,b[2]||'');row.append(mark,t)}else if(n){const mark=document.createElement('span');mark.className='marker';mark.textContent=`${n[2]}.`;const t=document.createElement('span');linkify(t,n[3]||'');row.append(mark,t)}else if(line==='---'){row.append(document.createElement('hr'))}else linkify(row,line||' ');readBody.append(row)})}
  function paintNote(note){activeNote=note;readTitle.textContent=cleanTitle(note.Title);readTitle.hidden=!cleanTitle(note.Title).trim();renderBody(note.Body||'');lockedGate.hidden=true;noteContent.hidden=false;readMode.hidden=false;editMode.hidden=true;dirty=false;setToolbarMode('read')}

  async function openNote(id,remember=true){if(remember)noteInteraction();activeId=id;const indexNote=notes.find(n=>String(n.ID)===String(id)&&!isTrue(n.Archived));if(!indexNote)return false;topbar.hidden=true;listView.hidden=true;connectView.hidden=true;noteView.hidden=false;newNoteBtn.hidden=true;if(remember)rememberView('note',id);if(isTrue(indexNote.Locked)&&!indexNote.Body){noteContent.hidden=true;lockedGate.hidden=false;activeNote=indexNote;setToolbarMode('locked');return true}paintNote(indexNote);return true}
  async function unlockActive(){noteInteraction();const pin=sessionPin()||await askPin('unlock');if(!pin)return;try{const d=await requestGet('get',{id:activeId,pin});d.note.Title=cleanTitle(d.note.Title);sessionStorage.setItem(PIN_SESSION,pin);const i=notes.findIndex(n=>String(n.ID)===String(activeId));if(i>=0)notes[i]={...notes[i],...d.note};paintNote(d.note);syncStatus.textContent='Unlocked for this session'}catch(e){sessionStorage.removeItem(PIN_SESSION);showToast(e.message,true)}}

  function enterEdit(focusTarget='body'){const n=current();if(!n)return;noteInteraction();readMode.hidden=true;editMode.hidden=false;setToolbarMode('edit');titleInput.value=cleanTitle(n.Title);bodyInput.value=n.Body||'';dirty=false;saveStatus.textContent='';setTimeout(()=>{if(focusTarget==='title'){titleInput.focus();titleInput.setSelectionRange(0,titleInput.value.length)}else{bodyInput.focus();const end=bodyInput.value.length;bodyInput.setSelectionRange(end,end)}},20)}
  function markDirty(){
    dirty=true;noteInteraction();
    const n=current();
    if(!n||isTrue(n.Locked)){saveStatus.textContent='Unsaved';return}
    const title=titleInput.value.trim(),body=bodyInput.value.replace(/\r/g,'');
    if(n._localOnly&&isBlankNote(title,body)){saveStatus.textContent='';return}
    const now=new Date().toISOString();
    n.Title=title;n.Body=body;n['Updated At']=now;delete n._localOnly;
    try{queuePending(payloadForNote(n,now));saveCache();saveStatus.textContent='Saved on device';updateSyncStatus()}
    catch(_){saveStatus.textContent='Device storage full · keep this note open'}
  }
  function payloadForNote(n,now){return{id:n.ID,title:String(n.Title||''),body:String(n.Body||''),pinned:isTrue(n.Pinned),locked:isTrue(n.Locked),pin:isTrue(n.Locked)?sessionPin():'',localUpdatedAt:now,createdAt:n['Created At']||now}}
  function captureDraft(){
    const n=current();if(!n||editMode.hidden)return null;
    const now=new Date().toISOString(),title=titleInput.value.trim(),body=bodyInput.value.replace(/\r/g,'');
    if(n._localOnly&&isBlankNote(title,body)){
      const i=notes.findIndex(note=>String(note.ID)===String(n.ID));if(i>=0)notes.splice(i,1);
      clearPending(n.ID);saveCache();dirty=false;return {discarded:true};
    }
    n.Title=title;n.Body=body;n['Updated At']=now;delete n._localOnly;
    const payload=payloadForNote(n,now);
    saveCache();dirty=false;return {note:n,payload};
  }
  function syncDraft(note,payload){
    if(!payload)return;
    if(!payload.locked){
      queuePending(payload);updateSyncStatus();
      showToast(navigator.onLine===false?'Saved on device · will sync online':'Saved on device');
      flushPending();return;
    }
    requestPost('upsert',payload).then(d=>{
      note['Updated At']=d.updatedAt||note['Updated At'];saveCache();showToast('Saved');
    }).catch(e=>{showToast(`Save failed: ${e.message}`,true)});
  }
  function saveAndStay(){const draft=captureDraft();if(!draft)return;if(draft.discarded){showList();showToast('Blank note discarded');return}paintNote(draft.note);syncDraft(draft.note,draft.payload)}
  function goBack(){noteInteraction();if(!editMode.hidden){const draft=captureDraft();showList();if(draft&&!draft.discarded)syncDraft(draft.note,draft.payload)}else showList()}
  function toggleChecklistLine(lineIndex){
    const n=current();if(!n||readMode.hidden)return;noteInteraction();
    const lines=String(n.Body||'').split('\n'),line=lines[lineIndex]||'';
    const m=line.match(/^(\s*)\[( |x|X)\](\s*.*)$/);if(!m)return;
    const checked=String(m[2]).toLowerCase()==='x';lines[lineIndex]=`${m[1]}[${checked?' ':'x'}]${m[3]}`;
    const now=new Date().toISOString();n.Body=lines.join('\n');n['Updated At']=now;renderBody(n.Body);saveCache();syncDraft(n,payloadForNote(n,now));
  }

  async function createNote(){noteInteraction();const id=noteId(),now=new Date().toISOString(),n={ID:id,'Created At':now,'Updated At':now,Title:'',Body:'',Pinned:false,Locked:false,Archived:false,'Sort Order':9999,_localOnly:true};notes.unshift(n);activeId=id;topbar.hidden=true;listView.hidden=true;noteView.hidden=false;newNoteBtn.hidden=true;rememberView('note',id);paintNote(n);enterEdit('title');markDirty()}
  async function togglePin(note){if(!note)return;noteInteraction();const previous=isTrue(note.Pinned),next=!previous;note.Pinned=next;saveCache();renderList();try{await requestPost('pin',{id:note.ID,pinned:next})}catch(e){note.Pinned=previous;saveCache();renderList();showToast(e.message,true)}}
  async function toggleLock(note){
    if(!note)return;noteInteraction();
    const next=!isTrue(note.Locked);
    if(next){
      try{await flushPendingForId(note.ID)}
      catch(e){showToast(`Lock failed: unsaved changes could not sync · ${e.message}`,true);return}
    }
    if(!pinConfigured){const pin=await askPin('setup');if(!pin)return;try{await requestPost('setpin',{pin});pinConfigured=true;sessionStorage.setItem(PIN_SESSION,pin)}catch(e){showToast(e.message,true);return}}
    let pin=sessionPin();if(!pin){pin=await askPin('unlock');if(!pin)return}
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
    if(!note||!confirm(`Delete ${note.Title?`“${note.Title}”`:'this note'}?`))return;noteInteraction();
    let pin='';if(isTrue(note.Locked)){pin=sessionPin()||await askPin('unlock');if(!pin)return}
    const index=notes.findIndex(n=>String(n.ID)===String(note.ID));if(index<0)return;
    const deletes=readPendingDeletes();
    deletes[note.ID]={token:pendingToken(),locked:isTrue(note.Locked)};
    localStorage.setItem(DELETE_STORAGE,JSON.stringify(deletes));
    clearPending(note.ID);
    notes.splice(index,1);saveCache();if(fromDetail)showList();else renderList();
    updateSyncStatus();
    await flushPending();
    showToast(readPendingDeletes()[note.ID]?'Deleted on device · sync pending':'Deleted');
  }

  function deleteCurrent(){const n=current();if(n)deleteNote(n,true)}
  function exportText(n){return [cleanTitle(n.Title).trim(),String(n.Body||'').trim()].filter(Boolean).join('\n\n')}
  function emailCurrent(){const n=current();if(n)location.href=`mailto:?subject=${encodeURIComponent(cleanTitle(n.Title)||'Lexi Note')}&body=${encodeURIComponent(exportText(n))}`}
  async function shareCurrent(){const n=current();if(!n)return;const p={title:cleanTitle(n.Title)||'Lexi Note',text:exportText(n)};if(navigator.share){try{await navigator.share(p);return}catch(e){if(e.name==='AbortError')return}}try{await navigator.clipboard.writeText(p.text);showToast('Copied note')}catch(_){emailCurrent()}}

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
    if(navigator.onLine===false){updateSyncStatus();return}
    const startedRevision=interactionRevision;
    if(show)syncStatus.textContent='Refreshing…';
    try{
      const d=await requestGet('list');pinConfigured=Boolean(d.pinConfigured);
      if(interactionRevision!==startedRevision||!editMode.hidden){updateSyncStatus();await flushPending();return}
      notes=mergePending(Array.isArray(d.notes)?d.notes:[]);saveCache();restoreLastView();updateSyncStatus();await flushPending();
    }catch(e){
      if(e.message==='Unauthorized'){localStorage.removeItem(KEY_STORAGE);showConnect('The API key was not accepted.');return}
      if(interactionRevision!==startedRevision){syncStatus.textContent=`Sync delayed · ${e.message}`;return}
      const c=readCache();if(c?.notes){notes=mergePending(c.notes);pinConfigured=Boolean(c.pinConfigured);restoreLastView();syncStatus.textContent='Saved notes · connection unavailable'}else showConnect(e.message);
    }
  }

  searchInput.addEventListener('input',()=>{
    clearSearchBtn.hidden=!searchInput.value;clearTimeout(searchTimer);renderList();
    const q=searchInput.value.trim(),pin=sessionPin();if(!q||!pin)return;
    searchTimer=setTimeout(async()=>{try{const d=await requestGet('search',{q,pin});(d.notes||[]).forEach(remote=>{remote={...remote,Title:cleanTitle(remote.Title)};const i=notes.findIndex(n=>String(n.ID)===String(remote.ID));if(i>=0)notes[i]={...notes[i],...remote};else notes.push(remote)});renderList()}catch(_){}},350);
  });
  clearSearchBtn.addEventListener('click',()=>{searchInput.value='';renderList();searchInput.focus()});
  refreshBtn.addEventListener('click',()=>load(true));
  newNoteBtn.addEventListener('click',createNote);
  backBtn.addEventListener('click',goBack);
  unlockBtn.addEventListener('click',unlockActive);
  editBtn.addEventListener('click',()=>enterEdit('body'));
  saveBtn.addEventListener('click',saveAndStay);
  emailBtn.addEventListener('click',emailCurrent);
  shareBtn.addEventListener('click',shareCurrent);
  deleteBtn.addEventListener('click',deleteCurrent);
  readBody.addEventListener('click',e=>{const check=e.target.closest('button[data-check-line]');if(check){e.preventDefault();e.stopPropagation();toggleChecklistLine(Number(check.dataset.checkLine));return}if(e.target.closest('a'))return;enterEdit('body')});
  titleInput.addEventListener('input',markDirty);
  bodyInput.addEventListener('input',markDirty);
  bodyInput.addEventListener('keydown',listContinue);
  formatBar.addEventListener('pointerdown',e=>e.preventDefault());
  formatBar.addEventListener('click',e=>{const b=e.target.closest('button[data-tool]');if(b)applyTool(b.dataset.tool)});
  connectBtn.addEventListener('click',async()=>{const k=apiKeyInput.value.trim();if(!k)return;localStorage.setItem(KEY_STORAGE,k);connectError.textContent='';await load(true);if(!connectView.hidden)localStorage.removeItem(KEY_STORAGE)});

  noteView.addEventListener('touchstart',e=>{if(e.touches.length!==1||e.touches[0].clientX>52){swipeStart=null;return}swipeStart={x:e.touches[0].clientX,y:e.touches[0].clientY}}, {passive:true});
  noteView.addEventListener('touchend',e=>{if(!swipeStart||!e.changedTouches.length)return;const t=e.changedTouches[0],dx=t.clientX-swipeStart.x,dy=t.clientY-swipeStart.y;swipeStart=null;if(dx>72&&Math.abs(dy)<58&&dx>Math.abs(dy)*1.35)goBack()}, {passive:true});

  const cached=readCache();if(cached?.notes){notes=mergePending(cached.notes);pinConfigured=Boolean(cached.pinConfigured);restoreLastView();updateSyncStatus()}
  if(localStorage.getItem(KEY_STORAGE))load(false);else showConnect();
  // iOS resumes/reconnects while the app is open; no Background Sync dependency.
  window.addEventListener('online',()=>load(false));
  window.addEventListener('offline',updateSyncStatus);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&dirty)markDirty();
    if(document.visibilityState==='visible')load(false);
  });
  window.addEventListener('pagehide',()=>{if(dirty)markDirty()});
  setInterval(()=>{if(document.visibilityState!=='hidden'&&navigator.onLine!==false&&(Object.keys(readPending()).length||Object.keys(readPendingDeletes()).length))load(false)},30000);
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
