import { STORAGE_KEY, validateStore, type Store } from './model';
import { entriesOf, migrateStore } from './workflow';
import { recordActivity } from './executive';

export function persistWorkspace(storage:Pick<Storage,'getItem'|'setItem'>,previous:Store,next:Store,recovery=false,now=new Date().toISOString()):Store {
 const raw=storage.getItem(STORAGE_KEY);
 if(raw&&!recovery){const current:unknown=JSON.parse(raw);if(!validateStore(current))throw new Error('Saved data needs recovery before editing.');if(current.version===3?current.revision!==previous.revision:current.savedAt!==previous.savedAt)throw new Error('Another tab saved newer data. Reopen this record before saving.');}
 if(!recovery)for(const t of next.transactions){const old=previous.transactions.find(x=>x.id===t.id);if(!old)continue;for(const note of entriesOf(old)){const updated=entriesOf(t).find(n=>n.id===note.id);if(!updated)throw new Error('Existing notes must be retained or recoverably deleted.');if(updated.createdAt!==note.createdAt)throw new Error('A note’s original timestamp cannot change.');if(updated.text!==note.text&&(updated.history.length!==note.history.length+1||updated.history.at(-1)?.text!==note.text||!updated.updatedAt))throw new Error('Note edits must retain the previous text and an edit timestamp.');if(updated.history.length<note.history.length||note.history.some((h,i)=>JSON.stringify(h)!==JSON.stringify(updated.history[i])))throw new Error('Existing note history must be preserved.');}}
 const base=migrateStore(next,now),updated:Store={...base,version:3,savedAt:now,revision:crypto.randomUUID(),activity:[...(base.activity||[]),...recordActivity(previous,base,now)]};
 if(!validateStore(updated))throw new Error('Workspace validation failed. Nothing was saved.');
 const encoded=JSON.stringify(updated);
 // A browser setItem is atomic. Keep the previous valid version when space permits.
 if(raw){try{storage.setItem(`${STORAGE_KEY}-recovery`,raw);if(JSON.parse(raw).version<3&&!storage.getItem(`${STORAGE_KEY}-pre-v3-backup`))storage.setItem(`${STORAGE_KEY}-pre-v3-backup`,raw);}catch{/* A redundant backup must not prevent the primary save. */}}
 storage.setItem(STORAGE_KEY,encoded);
 if(storage.getItem(STORAGE_KEY)!==encoded)throw new Error('The browser did not confirm the save. Keep this page open and export your notes.');
 return updated;
}
