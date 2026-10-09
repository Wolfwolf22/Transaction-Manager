import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { INITIAL_STATUSES, sampleTransactions, shiftPlan, validateStore, validateTransaction, notesText, type Store, type Transaction } from './model';
import { bcaFor, costs, defaultSettings, difference, eur, migrateStore, matchingRules, normalizeTransaction, progressOf, squareMeters, perSquareMeter, validateSettings, type BcaYear } from './workflow';
import { fullWorkbook } from './workbook';

// Deliberately synthetic test rules; no internal policy values or calendars.
const config = (): BcaYear => ({ year: 2030, source: 'Synthetic fixture', revision: 'Example 1', routingConfirmed: true, routingPolicy: 'unique-match', caveats: 'Illustrative only', rules: [{ id: 'rule-a', level: 'global', label: 'Example global rule', amountOperator: '>=', amountEur: 500, termOperator: '>', termYears: 1, approvers: 'Example reviewer', submissionStage: 'gho' }], cycles: [{ id: 'cycle-a', label: 'Example cycle', regional: '2030-06-01', regionalMeeting: '2030-06-05', gho: '2030-06-10', globalMeeting: '2030-06-20', note: '' }] });
const settings = () => ({ ...defaultSettings(), usdToEur: 0.8, bcaYears: [config()] });
const transaction = (): Transaction => ({ ...sampleTransactions()[0], plannedStart: '2030-05-01', plannedEnd: '2030-06-08', commitmentUsd: 1000, termYears: 2, bcaSelection: { year: 2030, level: '', stage: '', cycleId: 'cycle-a', mode: 'rules', decisionNote: '' } });
const legacy = (): Store => ({ version: 1, transactions: [sampleTransactions()[0]], statuses: INITIAL_STATUSES, savedAt: '2026-10-08T00:00:00Z' });

describe('migration and validation', () => {
  it('preserves original fields and unknown note creation dates while replacing manual progress honestly', () => {
    const original = legacy(), next = migrateStore(original, '2026-10-09T01:00:00Z'), t = next.transactions[0];
    expect(validateStore(next)).toBe(true); expect(original.version).toBe(1);
    const { progress, ...oldFields } = original.transactions[0];
    expect(t).toMatchObject(oldFields); expect(t.progress).toBe(0); expect(t.legacyProgress).toBe(progress);
    expect(t.noteEntries![0]).toMatchObject({ text: original.transactions[0].notes, createdAt: null, migratedAt: '2026-10-09T01:00:00Z', history: [] });
    expect(t.previousSqft).toBeNull(); expect(next.settings?.usdToEur).toBeNull();
    expect(migrateStore(next)).toBe(next); expect(progressOf(t)).toBeNull();
  });
  it('rejects malformed nested records without throwing', () => {
    for (const bcaYears of [[null], [{...config(), rules:[null]}], [{...config(),cycles:[null]}]]) expect(validateSettings({...settings(),bcaYears})).toBe(false);
    for (const patch of [{noteEntries:[null]}, {checklist:[null]}, {comparables:[null]}, {bcaSelection:null}, {noteEntries:[{id:'x',text:'x',createdAt:null,history:[null]}]}]) expect(validateTransaction({...transaction(),...patch}, INITIAL_STATUSES).length).toBeGreaterThan(0);
    expect(validateSettings({...settings(),usdToEur:0})).toBe(false);
    expect(validateSettings({...settings(),bcaYears:[{...config(),cycles:[{...config().cycles[0],gho:'2031-01-01'}]}]})).toBe(false);
  });
});
describe('area, currency and completion', () => {
  it('converts both unit directions and uses the explicitly entered exchange rate', () => {
    expect(squareMeters(10000)).toBeCloseTo(929.0304, 7);
    expect(perSquareMeter(10)).toBeCloseTo(107.639104167, 7);
    expect(eur(100, null)).toBeNull(); expect(eur(null, 0.8)).toBeNull(); expect(eur(100, 0.8)).toBe(80);
    expect(difference(120, 100)).toEqual({amount:20,percent:20}); expect(difference(5,0)).toEqual({amount:5,percent:null});
    expect(difference(null,100)).toEqual({amount:null,percent:null});
  });
  it('uses separate areas and expenses, and never invents a prior total', () => {
    const t = {...transaction(),sqft:1000,currentPsf:12,opex:1000,previousPsf:10,previousSqft:800,previousOpex:900};
    expect(costs(t)).toEqual({currentBase:12000,previousBase:8000,currentTotal:13000,previousTotal:8900});
    expect(costs({...t,previousSqft:null}).previousBase).toBeNull(); expect(costs({...t,previousOpex:null}).previousTotal).toBeNull();
  });
  it('derives progress only from checklist completion, including removal', () => {
    const t = {...transaction(),checklist:[{id:'a',text:'One',done:true},{id:'b',text:'Two',done:false}]};
    expect(progressOf(t)).toBe(50); expect(normalizeTransaction(t).progress).toBe(50);
    expect(progressOf({...t,checklist:t.checklist.slice(0,1)})).toBe(100); expect(progressOf({...t,checklist:[]})).toBeNull();
  });
});
describe('BCA rules and fixed deadlines', () => {
  it('resolves one confirmed rule using amount AND term and the chosen cycle', () => {
    const t=transaction(), s=settings(), result=bcaFor(t,s,'2030-06-01');
    expect(result).toMatchObject({date:'2030-06-10',kind:'soon',global:true,conflict:false,level:'global',stage:'gho'});
    expect(result.trace).toContain('Example cycle');
    expect(matchingRules({...t,termYears:1},config(),s)).toHaveLength(0);
    expect(matchingRules({...t,commitmentUsd:100},config(),s)).toHaveLength(0);
    expect(bcaFor(t,{...s,bcaWarningDays:2},'2030-06-01').kind).toBe('future');
    expect(bcaFor(t,s,'2030-06-11')).toMatchObject({date:'2030-06-10',kind:'overdue'});
  });
  it('blocks missing, overlapping, unconfirmed and unmapped rules without picking precedence', () => {
    const t=transaction(), s=settings();
    for(const changed of [defaultSettings(), {...s,usdToEur:null}, {...s,bcaYears:[{...config(),routingConfirmed:false}]}, {...s,bcaYears:[{...config(),rules:[...config().rules,{...config().rules[0],id:'duplicate',level:'region' as const}]}]}, {...s,bcaYears:[{...config(),rules:[{...config().rules[0],submissionStage:'' as const}]}]}]) {
      const result=bcaFor(t,changed,'2030-06-01');expect(result.date).toBe('');expect(result.message.length).toBeGreaterThan(0);
    }
    expect(bcaFor({...t,termYears:1},s).message).toContain('No threshold');
  });
  it('uses manual routes explicitly and flags absent calendar entries', () => {
    const t={...transaction(),bcaSelection:{...transaction().bcaSelection!,mode:'manual' as const,level:'global' as const,stage:'regional' as const}};
    expect(bcaFor(t,settings(),'2030-06-01')).toMatchObject({date:'2030-06-01',kind:'soon',global:true});
    const s=settings();s.bcaYears[0].cycles[0].regional='';expect(bcaFor(t,s).message).toContain('missing');
    expect(bcaFor({...t,bcaSelection:{...t.bcaSelection,cycleId:''}},settings()).message).toContain('explicit approval cycle');
  });
  it('moves planning without altering the selected BCA deadline, and updates dates when the calendar changes', () => {
    const t=transaction(), s=settings(), moved=shiftPlan(t,14);
    expect(moved.bcaSelection).toEqual(t.bcaSelection); expect(moved.criticalDate).toBe(t.criticalDate);expect(moved.notificationDate).toBe(t.notificationDate);
    expect(bcaFor(moved,s)).toMatchObject({date:'2030-06-10',conflict:true});
    s.bcaYears[0].cycles[0].gho='2030-06-25';expect(bcaFor(moved,s)).toMatchObject({date:'2030-06-25',conflict:false});
  });
});
describe('complete revision 2 exports', () => {
  it('round-trips note history, deleted notes, settings, BCA assignments, checklist and market inputs', async () => {
    const t={...transaction(),noteEntries:[{id:'note-a',text:'Edited note\n'+'A'.repeat(32000),createdAt:'2026-10-08T12:00:00Z',updatedAt:'2026-10-08T13:00:00Z',deletedAt:'2026-10-08T14:00:00Z',history:[{text:'Original text',editedAt:'2026-10-08T13:00:00Z'}]}],checklist:[{id:'check-a',text:'Example step',done:true}],comparables:[{id:'comp-a',address:'100 Synthetic Way',annualPsfUsd:12.5}],previousSqft:1234,previousOpex:4321};
    const store:Store={version:2,transactions:[normalizeTransaction(t)],statuses:INITIAL_STATUSES,savedAt:'2026-10-08T15:00:00Z',settings:settings()};
    const workbook=await fullWorkbook(store), read=new ExcelJS.Workbook();await read.xlsx.load(await workbook.xlsx.writeBuffer());
    let joined='';read.getWorksheet('Complete workspace JSON')!.eachRow((r,i)=>{if(i>1)joined+=r.getCell(2).value;});
    expect(JSON.parse(joined)).toEqual(store);expect(validateStore(JSON.parse(joined))).toBe(true);
    expect(read.getWorksheet('Notes')!.rowCount).toBe(3);expect(read.getWorksheet('Note history')!.getRow(2).getCell(5).value).toBe('Original text');
    expect(read.getWorksheet('Checklists')!.getRow(2).getCell(5).value).toBe(100);
    expect(read.getWorksheet('Market comparables')!.getRow(2).getCell(5).value).toBe(10);
    expect(read.getWorksheet('BCA rules')!.rowCount).toBe(2);expect(read.getWorksheet('BCA calendars')!.rowCount).toBe(2);
    expect(notesText(t)).toContain('DELETED 2026-10-08T14:00:00Z');expect(notesText(t)).toContain('Original text');
  });
});
