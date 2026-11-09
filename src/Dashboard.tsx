import { ArrowUpRight, ArrowRight, CalendarDays, CheckCheck } from 'lucide-react';
import { compactMoney, formatDate, number, today, type Store, type Transaction } from './model';
import { progressOf, squareMeters } from './workflow';
import { actionQueue, portfolio, stamp } from './executive';
import { ActionList } from './ExecutiveViews';
import PortfolioMap from './PortfolioMap';

export default function Dashboard({store,onOpen,onNavigate}:{store:Store;onOpen:(t:Transaction,section?:string)=>void;onNavigate:(route:string)=>void}){
 const asOf=today();
 const metrics=portfolio(store),actions=actionQueue(store,asOf),overdue=actions.filter(a=>a.days!==null&&a.days<0),next=actions.filter(a=>a.days!==null&&a.days>=0&&a.days<=7),global=actions.filter(a=>a.global),missing=actions.filter(a=>a.category==='data'),attention=actions.filter(a=>a.days===null||a.days<=30||a.global),stages=store.statuses.map(status=>({status,items:store.transactions.filter(t=>t.status===status)})).filter(x=>x.items.length);
 const overdueLabel=overdue.length===1?'1 overdue action':`${overdue.length} overdue actions`;
 const dueLabel=next.length===1?'1 action due this week':`${next.length} actions due this week`;
 return <>
 <div className="page-heading executive-heading">
  <div><div className="eyebrow">UNITED STATES REAL ESTATE</div><h1>Executive overview</h1><p>Transaction deadlines, approvals, and portfolio activity.</p></div>
  <time className="date-today" dateTime={asOf}><CalendarDays size={15}/>{formatDate(asOf)}</time>
 </div>
 <section className="executive-brief" aria-label="Portfolio attention summary">
  <div className="brief-copy">
   <span className="eyebrow">Decision watch</span>
   <h2>{overdue.length?overdueLabel:next.length?dueLabel:'Review open actions and data gaps'}</h2>
   <ul className="brief-breakdown">
    <li><strong>{next.length}</strong> due in 7 days</li>
    <li><strong>{global.length}</strong> global / corporate BCA</li>
    <li><strong>{missing.length}</strong> missing-data flags</li>
   </ul>
  </div>
  <button className="button primary" onClick={()=>onNavigate('actions')}>Open action queue <ArrowUpRight size={17}/></button>
 </section>
 <div className="executive-metrics"><button onClick={()=>onNavigate('transactions')}><span>Transactions</span><strong>{metrics.count.toString().padStart(2,'0')}</strong><small>{stages.length} stage labels in use <ArrowUpRight size={13}/></small></button><div><span>Portfolio area</span><strong>{number(metrics.area)}<em>sq ft</em></strong><small>{number(squareMeters(metrics.area))} m²</small></div><div><span>Known annual base rent</span><strong>{compactMoney(metrics.annualBase)}</strong><small>{metrics.missingPrice} missing rates · excludes operating costs</small></div><button onClick={()=>onNavigate('review')}><span>Notes awaiting review</span><strong>{metrics.unreviewed.toString().padStart(2,'0')}</strong><small>Explicit review required <ArrowUpRight size={13}/></small></button></div>
 <div className="executive-main-grid"><section className="panel priority-panel"><div className="panel-heading"><div><div className="eyebrow">DEADLINES & ESCALATIONS</div><h2>Attention queue <span className="inline-count">{attention.length}</span></h2></div><button className="text-button" onClick={()=>onNavigate('actions')}>All actions <ArrowRight size={15}/></button></div><ActionList items={attention.slice(0,6)} onOpen={(id,section)=>{const t=store.transactions.find(t=>t.id===id);if(t)onOpen(t,section);}}/>{!attention.length&&<p className="empty-inline">No urgent or unresolved actions recorded.</p>}<p className="panel-footnote">Overdue dates first, then global approvals and upcoming work. Flags reflect saved dates and checklist evidence.</p></section>
 <section className="panel stage-panel"><div className="panel-heading"><div><div className="eyebrow">DELIVERY READINESS</div><h2>Stage & progress</h2></div></div><div className="stage-list">{stages.map(({status,items},i)=><div key={status} className="stage-row"><div><i style={{background:['#20242a','#ffcc00','#8c929c','#bbbfc5','#d40511'][i%5]}}/><span>{status}</span><strong>{items.length}</strong></div><div className="stage-track"><span style={{width:`${items.length/Math.max(metrics.count,1)*100}%`}}/></div><small>{items.filter(t=>progressOf(t)===100).length} with checklist complete</small></div>)}</div><div className="readiness-total"><CheckCheck size={19}/><div><strong>{metrics.completed} / {metrics.tasks} actions complete</strong><small>{metrics.noChecklist} transactions have no checklist</small></div></div><p className="panel-footnote">Checklist completion does not imply approval or execution.</p></section></div>
 <div className="footprint-grid"><PortfolioMap transactions={store.transactions} onSelect={onOpen}/><section className="panel activity-panel"><div className="panel-heading"><div><div className="eyebrow">SAVED WORKSPACE ACTIVITY</div><h2>Latest updates</h2></div></div><div className="activity-list">{store.activity?.length?store.activity.slice(-5).reverse().map(a=>{const t=store.transactions.find(t=>t.id===a.transactionId);return <button key={a.id} onClick={()=>t?onOpen(t,a.fields.includes('noteEntries')?'notes':undefined):onNavigate('settings')}><span className="activity-dot"/><div><strong>{t?.iata||'Workspace'} · {a.summary}</strong><small>{stamp(a.at)} ET</small></div><ArrowUpRight size={15}/></button>;}):<div className="quiet-empty"><span>No tracked changes yet</span><p>New saved activity appears here. Historical changes are not inferred.</p></div>}</div><div className="review-callout"><h3>Weekly notes review</h3><p>Read notes in context, mark them reviewed, then preview the next report.</p><button className="text-button" onClick={()=>onNavigate('review')}>Start weekly review <ArrowRight size={15}/></button></div></section></div></>;
}
