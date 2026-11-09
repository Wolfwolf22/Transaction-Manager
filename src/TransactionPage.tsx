import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Check, CheckSquare, MapPin, MessageSquare, CircleDollarSign, ArrowUpRight } from 'lucide-react';
import { blankTransaction, fieldLabels, validateTransaction, conflicts, number, money, type Transaction } from './model';
import { entriesOf, costs, difference, eur, squareMeters, perSquareMeter, progressOf, normalizeTransaction, checklistFromTemplate, CHECKLIST_NOTE_LIMIT, type ChecklistItem, type NoteEntry, type WorkspaceSettings } from './workflow';
import { DateFlag, ExportNotes, ErrorList, Status } from './ui';
import { BcaEditor } from './Bca';
import NoteEntries from './NoteEntries';
import { coordinates, nearestFacilities } from './facilityLocations';
import { stamp } from './executive';
const InteractiveMap = lazy(() => import('./InteractiveMap'));
const distanceFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
export default function TransactionPage({ transaction, transactions, onOpen, statuses, settings, onSave, onSaveNotes, onBack, onDirty, section }: { section?:string; onSaveNotes:(notes:NoteEntry[],original:Transaction)=>Transaction|undefined; transaction?: Transaction; transactions: Transaction[]; onOpen: (t: Transaction) => void; statuses: string[]; settings: WorkspaceSettings; onSave:(t:Transaction, original?:Transaction)=>boolean; onBack:()=>void; onDirty:(dirty:boolean)=>void }) {
  const standardItems = settings.checklistTemplate ?? [];
  const [draft,setDraft] = useState<Transaction>(() => {
    const t = transaction || blankTransaction(statuses[0]);
    const checklist = transaction ? t.checklist ?? [] : checklistFromTemplate([], standardItems);
    return {...t,noteEntries:entriesOf(t),checklist,comparables:t.comparables||[],previousSqft:t.previousSqft??null,previousOpex:t.previousOpex??null,commitmentUsd:t.commitmentUsd??null,termYears:t.termYears??null};
  });
  const [baseline,setBaseline] = useState(()=>JSON.stringify(draft)),[original,setOriginal]=useState(transaction),[errors,setErrors]=useState<string[]>([]),[itemText,setItemText]=useState(''),[compAddress,setCompAddress]=useState(''),[compRate,setCompRate]=useState(''),[pendingNote,setPendingNote]=useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const { id, latitude, longitude, source } = draft;
  const position = useMemo(() => coordinates({ latitude, longitude }), [latitude, longitude]);
  const nearby = useMemo(() => nearestFacilities(
    { id, latitude, longitude },
    transactions.filter(facility => facility.source === source),
  ), [id, latitude, longitude, source, transactions]);
  useEffect(()=>{if(section)document.getElementById(`section-${section}`)?.scrollIntoView({behavior:'instant'});},[section]);
  function saveNotes(notes:NoteEntry[]){if(!original)return false;const saved=onSaveNotes(notes,original);if(!saved)return false;setDraft(d=>({...d,noteEntries:saved.noteEntries}));setOriginal(saved);setBaseline(b=>JSON.stringify({...JSON.parse(b),noteEntries:saved.noteEntries}));return true;}
  const pendingItems=!!itemText || !!compAddress || !!compRate;
  const dirty=JSON.stringify(draft)!==baseline || pendingNote || pendingItems;
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  function set<K extends keyof Transaction>(key:K,value:Transaction[K]){setDraft(t=>({...t,[key]:value}));}
  function save(){if(pendingNote || pendingItems){setErrors(['Add or discard the pending note, checklist item or comparable before saving the transaction.']);return;}const t=normalizeTransaction(draft),issues=validateTransaction(t,statuses);setErrors(issues);if(!issues.length && onSave(t,original)){setDraft(t);setOriginal(t);setBaseline(JSON.stringify(t));onDirty(false);}}
  function field(key:keyof Transaction,type='text',label=fieldLabels[key]||key){return <label key={key}>{label}<input type={type} step={type==='number'?'any':undefined} value={String(draft[key]??'')} onInput={type==='date'?e=>set(key,e.currentTarget.value):undefined} onChange={e=>set(key,type==='number'?e.target.value===''?null:Number(e.target.value):key==='iata'?e.target.value.toUpperCase():e.target.value)}/></label>;}
  const checklist = draft.checklist ?? [];
  const checklistTitles = new Set(checklist.map(item => item.text.trim().toLowerCase()));
  const canAddStandardItems = standardItems.some(text => !checklistTitles.has(text.trim().toLowerCase()));
  function updateChecklistItem(id: string, changes: Partial<ChecklistItem>) {
    setDraft(current => ({
      ...current,
      checklist: current.checklist?.map(item => item.id === id ? { ...item, ...changes } : item),
    }));
  }
  const rate=settings.usdToEur, c=costs(draft),progress=progressOf(draft);
  const currency=(v:number|null|undefined,currency='USD')=>v==null?'Not configured':new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(v);
  const comparison=(label:string,previous:number|null,current:number|null)=>{const d=difference(current,previous);return <tr key={label}><th>{label}</th><td>{currency(previous)}<small className="block">{currency(eur(previous,rate),'EUR')}</small></td><td>{currency(current)}<small className="block">{currency(eur(current,rate),'EUR')}</small></td><td>{currency(d.amount)}<small className="block">{currency(eur(d.amount,rate),'EUR')}</small></td><td>{d.percent===null?'N/A — missing or zero prior value':`${d.percent>0?'+':''}${d.percent.toFixed(2)}%`}</td></tr>;};
  return <div className="transaction-page"><div className="detail-top"><button className="button secondary" onClick={onBack}><ArrowLeft size={16}/>Transactions</button><div className="row-actions"><span className="small-label">{dirty?'Unsaved changes':'Saved view'}</span><ExportNotes transaction={draft}/><button className="button primary" onClick={save}><Save size={17}/>Save transaction</button></div></div><div className="page-heading detail-heading"><div><div className="eyebrow">{draft.source==='sample'?'SYNTHETIC SAMPLE TRANSACTION':'TRANSACTION WORKSPACE'} · {draft.iata||'NEW'}</div><h1>{draft.name||'New transaction'}</h1><p>{draft.address||draft.city||'Location not entered'}</p></div><Status value={draft.status}/></div><ErrorList errors={errors}/>
  <section className="panel detail-panel facility-location" id="section-location" aria-labelledby="facility-map-heading">
    <div className="facility-map-heading">
      <div>
        <div className="section-title"><MapPin size={19}/><h2 id="facility-map-heading">Facility map</h2></div>
        <p>{draft.address || draft.city || 'Location details'}</p>
      </div>
      <button className="button secondary" aria-expanded={editingLocation} aria-controls="facility-coordinate-editor" onClick={() => setEditingLocation(value => !value)}>
        {editingLocation ? 'Done placing pin' : position ? 'Edit location' : 'Set location'}
      </button>
    </div>
    <div id="facility-coordinate-editor" hidden={!editingLocation}>
      <div className="form-grid">{field('latitude', 'number')}{field('longitude', 'number')}</div>
      <p className="field-hint">Enter coordinates or click the map to place the pin. Use Save transaction to keep the location.</p>
    </div>
    {position || editingLocation ? <div className="facility-map-grid">
      <div className="facility-map-frame">
        <Suspense fallback={<p className="facility-map-placeholder">Loading facility map…</p>}>
          <InteractiveMap
            position={position}
            facilityName={draft.name || 'Selected facility'}
            facilityCode={draft.iata}
            nearby={nearby}
            onOpen={onOpen}
            onPlace={editingLocation ? (lat, lon) => setDraft(current => ({ ...current, latitude: lat, longitude: lon })) : undefined}
          />
        </Suspense>
      </div>
      <div className="nearby-facilities">
        <span className="facility-map-key"><i aria-hidden="true"/>{draft.iata ? `${draft.iata} · Selected facility` : 'Selected facility'}</span>
        <h3>Nearby facilities</h3>
        <p>{source === 'sample' ? 'Nearest sample locations' : 'Nearest in your portfolio'} · Straight-line distance</p>
        {nearby.length ? <ol>{nearby.map(({ transaction: facility, miles }, index) =>
          <li key={facility.id}>
            <button type="button" className="nearby-facility-row" onClick={() => onOpen(facility)}>
              <span className="nearby-facility-number" aria-hidden="true">{index + 1}</span>
              <span className="nearby-facility-name"><strong>{facility.name}</strong><small>{[facility.iata, facility.city].filter(Boolean).join(' · ')}</small></span>
              <span className="nearby-facility-distance">{miles > 0 && miles < 1 ? '<1' : distanceFormat.format(miles)} mi</span>
              <ArrowUpRight size={14} aria-hidden="true"/>
            </button>
          </li>
        )}</ol> : <p className="nearby-empty">{position ? 'No other mapped facilities in this workspace.' : 'Place the selected facility to find nearby locations.'}</p>}
      </div>
    </div> : <div className="facility-map-placeholder">
      <MapPin size={24} aria-hidden="true"/>
      <strong>This facility has no mapped location.</strong>
      <p>Set its coordinates to see the facility and its nearest neighbors.</p>
    </div>}
    {(position || editingLocation) && <p className="facility-map-credit">Background map tiles load from OpenStreetMap.</p>}
  </section>
  <div className="protected-dates"><DateFlag value={draft.notificationDate} label="NOTIFICATION DATE"/><div className="critical-highlight"><DateFlag value={draft.criticalDate} label="⚠ CRITICAL DATE"/></div><DateFlag value={draft.expirationDate} label="EXPIRATION DATE"/></div><nav className="detail-jumps" aria-label="Transaction sections">{['Location','Overview','Financials','Market','Checklist','Notes','BCA'].map(s=><a key={s} href={`#section-${s.toLowerCase()}`} onClick={e=>{e.preventDefault();document.getElementById(`section-${s.toLowerCase()}`)?.scrollIntoView({behavior:'smooth'});}}>{s}</a>)}</nav>
  <section className="panel detail-panel" id="section-overview"><h2>Transaction overview</h2><div className="form-grid three">{field('name')}{field('iata')}{field('type')}{field('address')}{field('city')}{field('country')}{field('zip')}{field('businessUnit')}{field('buOwner')}<label>Record category<select value={draft.source} onChange={e=>set('source',e.target.value as Transaction['source'])}><option value="sample">Synthetic sample</option><option value="user">User record</option></select></label><label>Status<select value={draft.status} onChange={e=>set('status',e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label className="span-two">Option terms<textarea rows={2} value={draft.optionTerms} onChange={e=>set('optionTerms',e.target.value)}/></label></div><h3 className="subheading">Contractual dates & planning</h3><p className="field-hint">These are independent date fields. Planning moves do not change notification, critical or BCA submission dates.</p><div className="form-grid three">{field('notificationDate','date')}{field('criticalDate','date')}{field('expirationDate','date')}{field('plannedStart','date')}{field('plannedEnd','date')}{field('bcaDate','date','Preparation deadline (legacy / manual)')}</div>{conflicts(draft).map(w=><p className="conflict block" key={w}>⚠ {w}</p>)}</section>
  <section className="panel detail-panel" id="section-financials"><div className="section-title"><CircleDollarSign size={21}/><h2>Previous vs proposed RFP / LOI</h2></div><p className="field-hint">All financial inputs are USD. Annual base rent = annual price per sq ft × the area for that period. Total annual occupancy cost adds that period’s operating expenses. The previous area is never assumed to equal the proposed area.</p><div className="form-grid three">{field('previousSqft','number','Previous occupied area (sq ft)')}{field('sqft','number','Current / proposed area (sq ft)')}{field('previousPsf','number','Previous annual USD / sq ft')}{field('currentPsf','number','Proposed RFP / LOI annual USD / sq ft')}{field('previousOpex','number','Previous annual operating expenses (USD)')}{field('opex','number','Proposed annual operating expenses (USD)')}</div><div className="area-summary"><span>Proposed: <strong>{number(draft.sqft)} sq ft / {number(squareMeters(draft.sqft))} m²</strong></span><span>Previous: <strong>{draft.previousSqft==null?'Not set':`${number(draft.previousSqft)} sq ft / ${number(squareMeters(draft.previousSqft))} m²`}</strong></span></div><p className="rate-caption">{rate===null?'EUR conversion not configured. Set your chosen EUR per USD rate in Settings.':`Corporate rate: 1 USD = ${rate} EUR. Source amounts remain USD.`}</p><div className="table-scroll"><table className="comparison-table"><thead><tr><th>Annual comparison (USD / EUR)</th><th>Previous</th><th>Proposed</th><th>Difference</th><th>Change</th></tr></thead><tbody>{comparison('Price / sq ft',draft.previousPsf,draft.currentPsf)}{comparison('Price / m²',draft.previousPsf===null?null:perSquareMeter(draft.previousPsf),draft.currentPsf===null?null:perSquareMeter(draft.currentPsf))}{comparison('Base rent',c.previousBase,c.currentBase)}{comparison('Operating expenses',draft.previousOpex??null,draft.opex)}{comparison('Total occupancy cost',c.previousTotal,c.currentTotal)}</tbody></table></div></section>
  <section className="panel detail-panel" id="section-market"><h2>Market comparison</h2><p className="field-hint">Comparable asking rates are annual USD per sq ft. Differences compare the proposed RFP / LOI rate with each property. Enter comparable terms you have verified; these are user inputs.</p><div className="row-form"><label>Comparable address<input value={compAddress} onChange={e=>setCompAddress(e.target.value)}/></label><label>Annual USD / sq ft<input type="number" min="0" step="any" value={compRate} onChange={e=>setCompRate(e.target.value)}/></label><button className="button secondary" onClick={()=>{if(!compAddress.trim()||compRate!==''&&(!Number.isFinite(Number(compRate))||Number(compRate)<0)){setErrors(['Enter a comparable address and a nonnegative rate.']);return;}set('comparables',[...(draft.comparables||[]),{id:crypto.randomUUID(),address:compAddress.trim(),annualPsfUsd:compRate===''?null:Number(compRate)}]);setCompAddress('');setCompRate('');}}><Plus size={16}/>Add property</button></div><div className="table-scroll"><table><thead><tr><th>Address</th><th>Annual USD / sq ft</th><th>Annual EUR / sq ft</th><th>Annual USD / m²</th><th>Annual EUR / m²</th><th>Proposed difference</th><th>Remove</th></tr></thead><tbody>{draft.comparables?.map(p=>{const d=difference(draft.currentPsf,p.annualPsfUsd);return <tr key={p.id}><td><input aria-label="Comparable address" value={p.address} onChange={e=>set('comparables',draft.comparables!.map(x=>x.id===p.id?{...x,address:e.target.value}:x))}/></td><td><input aria-label="Comparable annual USD per square foot" type="number" step="any" value={p.annualPsfUsd??''} onChange={e=>set('comparables',draft.comparables!.map(x=>x.id===p.id?{...x,annualPsfUsd:e.target.value===''?null:Number(e.target.value)}:x))}/></td><td>{currency(eur(p.annualPsfUsd,rate),'EUR')}</td><td>{currency(p.annualPsfUsd===null?null:perSquareMeter(p.annualPsfUsd))}</td><td>{currency(eur(p.annualPsfUsd===null?null:perSquareMeter(p.annualPsfUsd),rate),'EUR')}</td><td>{currency(d.amount)}<small className="block">{currency(eur(d.amount,rate),'EUR')}</small><small className="block">{d.percent===null?'N/A':`${d.percent.toFixed(2)}%`}</small></td><td><button className="icon-button" aria-label="Remove comparable" onClick={()=>set('comparables',draft.comparables!.filter(x=>x.id!==p.id))}><Trash2 size={15}/></button></td></tr>;})}</tbody></table></div>{!draft.comparables?.length&&<p className="empty-inline">No comparable properties entered.</p>}</section>
  <div className="detail-two-columns">
  <section className="panel detail-panel" id="section-checklist" aria-labelledby="transaction-checklist-heading">
    <div className="section-title">
      <CheckSquare size={21}/>
      <h2 id="transaction-checklist-heading">Transaction checklist</h2>
      <strong className="progress-value">{progress === null ? 'Not started' : `${progress}%`}</strong>
    </div>
    <p className="field-hint">Checking an item records the time. Use <strong>Save transaction</strong> to keep checklist changes and item notes.</p>
    {standardItems.length > 0 && <div className="checklist-template-action">
      <button
        type="button"
        className="button secondary"
        disabled={!canAddStandardItems}
        onClick={() => set('checklist', checklistFromTemplate(checklist, standardItems))}
      >
        {canAddStandardItems ? 'Add standard items' : 'Standard items added'}
      </button>
    </div>}
    <form className="row-form" onSubmit={event => {
      event.preventDefault();
      const text = itemText.trim();
      if (!text) return;
      set('checklist', [...checklist, { id: crypto.randomUUID(), text, done: false }]);
      setItemText('');
    }}>
      <label>New checklist item<input value={itemText} onChange={event => setItemText(event.target.value)}/></label>
      <button type="submit" className="button secondary" disabled={!itemText.trim()}><Plus size={16}/>Add item</button>
    </form>
    <div className="checklist-items">
      {checklist.map(item => <article key={item.id} className={`checklist-item ${item.done ? 'is-complete' : ''}`}>
        <div className="checklist-item-head">
          <input
            type="checkbox"
            aria-label={`Complete ${item.text}`}
            checked={item.done}
            onChange={event => {
              const done = event.target.checked;
              updateChecklistItem(item.id, { done, completedAt: done ? new Date().toISOString() : undefined });
            }}
          />
          <input aria-label="Checklist item text" value={item.text} onChange={event => updateChecklistItem(item.id, { text: event.target.value })}/>
          <button type="button" className="icon-button" aria-label={`Delete ${item.text}`} onClick={() => set('checklist', checklist.filter(entry => entry.id !== item.id))}>
            <Trash2 size={15}/>
          </button>
        </div>
        {item.done && <p className="checklist-checked">
          <Check size={14} aria-hidden="true"/>
          {item.completedAt
            ? <>Checked <time dateTime={item.completedAt}>{stamp(item.completedAt)} ET</time></>
            : 'Checked · time unavailable'}
        </p>}
        <div className="checklist-item-fields">
          <label>Due date<input
            type="date"
            aria-label={`Due date for ${item.text}`}
            value={item.dueDate || ''}
            onInput={event => updateChecklistItem(item.id, { dueDate: event.currentTarget.value })}
            onChange={event => updateChecklistItem(item.id, { dueDate: event.target.value })}
          /></label>
          <label>Owner<input
            aria-label={`Owner for ${item.text}`}
            placeholder="Owner"
            value={item.owner || ''}
            onChange={event => updateChecklistItem(item.id, { owner: event.target.value })}
          /></label>
        </div>
        <details className="checklist-item-note">
          <summary><MessageSquare size={14} aria-hidden="true"/> {item.note?.trim() ? 'Edit item note' : 'Add item note'}</summary>
          <textarea
            aria-label={`Note for ${item.text}`}
            placeholder="Add context or evidence for this item"
            maxLength={CHECKLIST_NOTE_LIMIT}
            rows={3}
            value={item.note ?? ''}
            onChange={event => updateChecklistItem(item.id, { note: event.target.value })}
          />
        </details>
        {item.note?.trim() && <p className="checklist-note-preview">{item.note}</p>}
      </article>)}
    </div>
    {draft.legacyProgress !== undefined && <small>Previous manual progress ({draft.legacyProgress}%) is preserved in exports. The checklist now controls progress.</small>}
  </section>
  <section className="panel detail-panel" id="section-notes"><div className="section-title"><MessageSquare size={21}/><h2>Transaction notes</h2></div><NoteEntries transactionId={draft.id} enabled={!!original} onPending={setPendingNote} entries={draft.noteEntries||[]} onChange={saveNotes}/></section></div>
  <section className="panel detail-panel" id="section-bca"><h2>BCA approval & submission</h2><div className="form-grid"><label>Total commitment (USD)<input type="number" step="any" min="0" value={draft.commitmentUsd??''} onChange={e=>set('commitmentUsd',e.target.value===''?null:Number(e.target.value))}/><small>{currency(eur(draft.commitmentUsd,rate),'EUR')}</small></label>{field('termYears','number','Commitment term (years)')}</div><p className="field-hint">Enter the commitment amount used for BCA review. This is not inferred from annual rent, operating costs, or the term.</p><BcaEditor transaction={draft} settings={settings} onChange={v=>set('bcaSelection',v)}/></section>
  <div className="detail-bottom"><button className="button primary" onClick={save}><Save size={17}/>Save transaction</button></div></div>;
}
