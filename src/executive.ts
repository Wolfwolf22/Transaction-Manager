import { addDays, dayNumber, formatDate, type Store, type Transaction } from './model';
import { activeNotes, bcaFor, costs, progressOf, settingsOf, type NoteEntry } from './workflow';

export type ActivityEvent = { id: string; at: string; transactionId: string; summary: string; fields: string[] };
export type ActionItem = { id: string; transactionId: string; iata: string; title: string; detail: string; date: string; days: number | null; category: 'critical'|'notification'|'bca'|'task'|'review'|'data'|'plan'; priority: number; global: boolean; section: string; owner: string };
export const noteVersion = (n: NoteEntry) => `${n.updatedAt || n.createdAt || n.migratedAt || 'unknown'}:${n.history.length}`;
export const needsReview = (n: NoteEntry) => !n.deletedAt && (!n.reviewedAt || n.reviewedVersion !== noteVersion(n));
export const markReviewed = (n: NoteEntry, now = new Date().toISOString()): NoteEntry => ({...n,reviewedAt:now,reviewedVersion:noteVersion(n)});
export const stamp = (s?:string|null) => s ? new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : 'Original time unknown';
export const dataMode = (s:Store) => s.transactions.some(t=>t.source==='user') ? s.transactions.some(t=>t.source==='sample')?'mixed':'user' : s.transactions.length?'sample-only':'empty';
export function portfolio(s:Store) {
 const all=s.transactions, priced=all.filter(t=>t.currentPsf!==null), tasks=all.flatMap(t=>t.checklist||[]);
 return {count:all.length,area:all.reduce((a,t)=>a+t.sqft,0),annualBase:priced.reduce((a,t)=>a+costs(t).currentBase!,0),missingPrice:all.length-priced.length,completed:tasks.filter(x=>x.done).length,tasks:tasks.length,noChecklist:all.filter(t=>!t.checklist?.length).length,unreviewed:all.reduce((a,t)=>a+activeNotes(t).filter(needsReview).length,0)};
}
export function actionQueue(s:Store,asOf:string):ActionItem[] {
 const items:ActionItem[]=[];
 for(const t of s.transactions) {
  const push=(id:string,title:string,detail:string,date:string,category:ActionItem['category'],section:string,global=false,owner=t.buOwner)=>{const days=date?dayNumber(date)-dayNumber(asOf):null;const priority=days!==null&&days<0?0:global?1:days!==null&&days<=7?2:days!==null&&days<=30?3:category==='data'?5:4;items.push({id:`${t.id}:${id}`,transactionId:t.id,iata:t.iata,title,detail,date,days,category,priority,global,section,owner});};
  for(const [key,label] of [['criticalDate','Critical deadline'],['notificationDate','Notification deadline']] as const) {
   if(t[key])push(key,label,`${t.name} · ${key==='criticalDate'?'Confirm required action before the critical date.':'Confirm and complete the notice requirement.'}`,t[key],key==='criticalDate'?'critical':'notification','overview');
   else push(key,`${label} missing`,'Enter the verified date from the lease.','', 'data','overview');
  }
  const b=bcaFor(t,settingsOf(s),asOf);
  if(b.date)push('bca',`${b.global?'Global / corporate · ':''}BCA submission`,`${b.cycle?.label || ''}${b.conflict?' · Planned finish is later than submission.':''}`,b.date,'bca','bca',b.global);
  else push('bca-review',`${b.global?'Global / corporate · ':''}BCA route needs review`,b.message,'','bca','bca',b.global);
  for(const task of t.checklist||[])if(!task.done)push(task.id,task.text,task.dueDate?'Complete the checklist action.':'No due date recorded; confirm timing.',task.dueDate||'','task','checklist',false,task.owner||t.buOwner);
  const unread=activeNotes(t).filter(needsReview);if(unread.length)push('notes',`${unread.length} note${unread.length===1?'':'s'} awaiting review`,'Read the entries and explicitly mark them reviewed.','','review','notes');
  if(!t.checklist?.length)push('no-checklist','Action plan missing','Add specific checklist actions; completion is unavailable.','','data','checklist');
  if(t.currentPsf===null)push('price','Proposed rate missing','Portfolio rent excludes this transaction until pricing is entered.','','data','financials');
  if(!t.buOwner)push('owner','Accountable owner missing','Assign the transaction owner.','','data','overview');
  if(t.plannedEnd&&t.plannedEnd<asOf&&progressOf(t)!==100)push('plan','Planned finish has passed','Review remaining actions and update the work plan; fixed deadlines remain unchanged.',t.plannedEnd,'plan','overview');
  else if(t.plannedEnd&&[t.notificationDate,t.criticalDate,b.date].some(d=>d&&d<t.plannedEnd))push('plan-conflict','Plan extends beyond a fixed deadline','Resolve the schedule conflict or record the decision.','','plan','overview');
 }
 return items.sort((a,b)=>a.priority-b.priority||Number(b.global)-Number(a.global)||(a.date||'9999').localeCompare(b.date||'9999')||a.iata.localeCompare(b.iata));
}
export function dueLabel(a:ActionItem){return a.days===null?'Needs input':a.days<0?`${-a.days}d overdue`:a.days===0?'Due today':`In ${a.days}d`;}
export function recordActivity(previous:Store,next:Store,now:string):ActivityEvent[] {
 const events:ActivityEvent[]=[];
 for(const t of next.transactions) {
  const old=previous.transactions.find(x=>x.id===t.id);if(old&&JSON.stringify(old)===JSON.stringify(t))continue;
  const fields=old?Object.keys(t).filter(k=>JSON.stringify(t[k as keyof Transaction])!==JSON.stringify(old[k as keyof Transaction])):['created'];
  const summary=!old?'Transaction added':fields.every(k=>k==='noteEntries')?'Notes saved or reviewed':fields.includes('checklist')?'Checklist or transaction updated':`Updated ${fields.filter(f=>f!=='progress').join(', ')}`;
  events.push({id:crypto.randomUUID(),at:now,transactionId:t.id,summary,fields});
 }
 if(JSON.stringify(previous.settings)!==JSON.stringify(next.settings)||JSON.stringify(previous.statuses)!==JSON.stringify(next.statuses))events.push({id:crypto.randomUUID(),at:now,transactionId:'',summary:'Workspace settings updated',fields:['settings']});
 return events;
}
export function businessDate(instant:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}
export function recentNotes(t:Transaction,since:string,through='2200-12-31'){return activeNotes(t).filter(n=>{const at=n.updatedAt||n.createdAt,day=at?businessDate(at):'';return needsReview(n)||!!day&&day>=since&&day<=through;});}
export function windowText(asOf:string){return `${formatDate(addDays(asOf,-7))} – ${formatDate(asOf)} · next actions through ${formatDate(addDays(asOf,7))}`;}
