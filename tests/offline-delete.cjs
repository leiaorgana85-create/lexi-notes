const fs=require('fs'),vm=require('vm'),assert=require('assert');const root=require('path').resolve(__dirname,'..');
const API='https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec';
const note={ID:'synthetic-existing',Title:'Synthetic',Body:'Sample',Pinned:false,Locked:false,Archived:false,'Updated At':'2026-10-24','Created At':'2026-10-24'};
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
function element(){return {hidden:true,value:'',textContent:'',dataset:{},style:{},classList:{add(){},toggle(){}},append(){},replaceChildren(){},addEventListener(){},setAttribute(){},querySelector(){return {style:{}}},focus(){},setSelectionRange(){}}}
function env(store=storage()){
 const els=new Map(),events={};let impl=async()=>Response.json({ok:true,notes:[note],deletedIds:[]});
 const c={URL,URLSearchParams,Response,Headers,Date,Math,JSON,Promise,Set,Map,console,Intl,navigator:{onLine:true},location:{href:'https://example.test/lexi-notes/'},localStorage:store,sessionStorage:storage(),confirm:()=>true,setTimeout(){},clearTimeout(){},setInterval(){},addEventListener(k,f){events[k]=f},document:{visibilityState:'visible',getElementById(id){if(!els.has(id))els.set(id,element());return els.get(id)},createElement:element,createTextNode:s=>s,addEventListener(){}},fetch:(...a)=>impl(...a)};c.window=c;vm.createContext(c);
 vm.runInContext(fs.readFileSync(root+'/sync-guard.js','utf8'),c);
 let app=fs.readFileSync(root+'/app.js','utf8').replace('  const cached=readCache();','  window.test={load,deleteNote,flushPending,queuePending,readPending,readPendingDeletes,getNotes:()=>notes};\n  const cached=readCache();');vm.runInContext(app,c);
 return {c,store,els,setFetch:f=>impl=f};
}
(async()=>{
 let e=env();e.store.setItem('lexiNotesApiKey','synthetic');await e.c.test.load();assert.equal(e.c.test.getNotes().length,1);
 e.c.test.queuePending({id:note.ID,title:'Synthetic',body:'Old queued edit',locked:false});e.c.navigator.onLine=false;await e.c.test.deleteNote(e.c.test.getNotes()[0]);assert.equal(e.c.test.getNotes().length,0);assert.equal(Object.keys(e.c.test.readPending()).length,0);assert(e.c.test.readPendingDeletes()[note.ID]);
 // Restart must not revive an offline-deleted note.
 const retained=e.store;e=env(retained);assert.equal(e.c.test.getNotes().length,0);await e.c.test.load();assert.equal(e.c.test.getNotes().length,0);assert.equal(Object.keys(e.c.test.readPendingDeletes()).length,0);
 // Confirmed deletion suppresses stale cached data too.
 e.store.setItem('lexiNotesIndexCacheV1',JSON.stringify({notes:[note]}));e=env(e.store);assert.equal(e.c.test.getNotes().length,0);
 // A failure keeps the deletion queued and the note hidden, and reports the error.
 e=env();e.store.setItem('lexiNotesApiKey','synthetic');await e.c.test.load();e.setFetch(async(input,init={})=>init.method==='POST'?Response.json({ok:false,error:'Synthetic failure'}):Response.json({ok:true,notes:[note],deletedIds:[]}));await e.c.test.deleteNote(e.c.test.getNotes()[0]);assert.equal(e.c.test.getNotes().length,0);assert(e.c.test.readPendingDeletes()[note.ID]);assert.match(e.els.get('syncStatus').textContent,/Synthetic failure/);await e.c.test.load();assert.equal(e.c.test.getNotes().length,0);
 // URL-object reads must process server tombstones and remove stale upserts.
 e=env();e.store.setItem('lexiNotesApiKey','synthetic');e.c.test.queuePending({id:note.ID,title:'Synthetic',body:'Must not return',locked:false});e.setFetch(async()=>Response.json({ok:true,notes:[],deletedIds:[note.ID]}));await e.c.test.load();assert.equal(e.c.test.getNotes().length,0);assert.equal(Object.keys(e.c.test.readPending()).length,0);
 // A new save finishing after a list starts is not a physical purge.
 e=env();let resolve;const wait=new Promise(r=>resolve=r);e.setFetch(async(input,init={})=>{if(init.method==='POST')return Response.json({ok:true});await wait;return Response.json({ok:true,notes:[],deletedIds:[]})});const reading=e.c.fetch(new URL(API+'?action=list'));await e.c.fetch(API,{method:'POST',body:new URLSearchParams({action:'upsert',id:'new-during-read'})});resolve();await reading;assert.equal(e.c.lexiNotesIsDeleted('new-during-read'),false);
 console.log('PASS: offline delete, restart, stale cache, failed-delete retry/error, URL read tombstones, stale-upsert suppression, concurrent-new-note protection');
})().catch(e=>{console.error(e);process.exitCode=1});
