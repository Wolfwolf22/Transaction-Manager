import { dayNumber, today, validDate, type Store, type Transaction } from './model';
export type NoteEntry = { id: string; text: string; createdAt: string | null; migratedAt?: string; updatedAt?: string; deletedAt?: string; history: { text: string; editedAt: string }[] };
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Comparable = { id: string; address: string; annualPsfUsd: number | null };
export type BcaLevel = 'country' | 'region' | 'global' | 'corporate';
export type BcaStage = 'regional' | 'gho';
export type BcaRule = { id: string; level: BcaLevel; label: string; amountOperator: '<' | '<=' | '>' | '>='; amountEur: number; termOperator: '<=' | '>' | 'any'; termYears: number | null; approvers: string; submissionStage: BcaStage | '' };
export type BcaCycle = { id: string; label: string; regional: string; regionalMeeting: string; gho: string; globalMeeting: string; note: string };
export type BcaYear = { year: number; source: string; revision: string; routingConfirmed: boolean; routingPolicy: 'unique-match'; rules: BcaRule[]; cycles: BcaCycle[]; caveats: string };
export type WorkspaceSettings = { usdToEur: number | null; bcaWarningDays: number; bcaYears: BcaYear[] };
export type BcaSelection = { year: number; level: BcaLevel | ''; stage: BcaStage | ''; cycleId: string; mode: 'manual' | 'rules'; decisionNote: string };
export const defaultSettings = (): WorkspaceSettings => ({ usdToEur: null, bcaWarningDays: 30, bcaYears: [] });
export const settingsOf = (s: Store): WorkspaceSettings => s.settings || defaultSettings();
export const SQM_PER_SQFT = 0.09290304;
export const squareMeters = (sqft: number) => sqft * SQM_PER_SQFT;
export const perSquareMeter = (psf: number) => psf / SQM_PER_SQFT;
export const eur = (usd: number | null | undefined, rate: number | null) => usd == null || rate === null ? null : usd * rate;
export function difference(current: number | null, previous: number | null) { return { amount: current === null || previous === null ? null : current - previous, percent: current === null || previous === null || previous === 0 ? null : (current - previous) / previous * 100 }; }
export function costs(t: Transaction) { const currentBase = t.currentPsf === null ? null : t.sqft * t.currentPsf, previousBase = t.previousPsf === null || t.previousSqft == null ? null : t.previousSqft * t.previousPsf; return { currentBase, previousBase, currentTotal: currentBase === null || t.opex === null ? null : currentBase + t.opex, previousTotal: previousBase === null || t.previousOpex == null ? null : previousBase + t.previousOpex }; }
export const progressOf = (t: Transaction) => !t.checklist?.length ? null : Math.round(t.checklist.filter(x => x.done).length / t.checklist.length * 100);
export const effectiveProgress = (t: Transaction) => progressOf(t) ?? 0;
export function entriesOf(t: Transaction): NoteEntry[] { return t.noteEntries ?? (t.notes ? [{ id: `legacy-${t.id}`, text: t.notes, createdAt: null, history: [] }] : []); }
export function activeNotes(t: Transaction) { return entriesOf(t).filter(n => !n.deletedAt); }
export function migrateStore(raw: Store, now = new Date().toISOString()): Store { if (raw.version === 2) return raw; return { ...raw, version: 2, settings: raw.settings || defaultSettings(), transactions: raw.transactions.map(t => ({ ...t, legacyProgress: t.progress, progress: 0, previousSqft: null, previousOpex: null, commitmentUsd: null, termYears: null, checklist: [], comparables: [], noteEntries: entriesOf(t).map(n => ({ ...n, migratedAt: now })), bcaSelection: { year: Number(today().slice(0, 4)), level: '', stage: '', cycleId: '', mode: 'manual', decisionNote: '' } })) }; }
export const normalizeTransaction = (t: Transaction): Transaction => ({ ...t, progress: effectiveProgress(t) });
export function matchingRules(t: Transaction, config: BcaYear, settings: WorkspaceSettings) { const value = eur(t.commitmentUsd, settings.usdToEur); if (value === null || t.termYears == null) return []; return config.rules.filter(r => { const amount = r.amountOperator === '<' ? value < r.amountEur : r.amountOperator === '<=' ? value <= r.amountEur : r.amountOperator === '>' ? value > r.amountEur : value >= r.amountEur; const term = r.termOperator === 'any' || r.termYears !== null && (r.termOperator === '<=' ? t.termYears! <= r.termYears : t.termYears! > r.termYears); return amount && term; }); }
export function bcaFor(t: Transaction, settings: WorkspaceSettings, asOf = today()) {
  const selected = t.bcaSelection, config = settings.bcaYears.find(y => y.year === selected?.year);
  let level = selected?.level || '', stage = selected?.stage || '', date = '', message = '';
  const matches = config ? matchingRules(t, config, settings) : []; let rule: BcaRule | undefined;
  if (!config) message = 'BCA calendar and rules are not configured for this year.';
  else if (selected?.mode === 'rules') { if (!config.routingConfirmed) message = 'Automatic routing is unconfirmed. Confirm rules in Settings or select a route explicitly.'; else if (settings.usdToEur === null || t.commitmentUsd == null || t.termYears == null) message = 'Set the corporate exchange rate, total commitment and term to evaluate the route.'; else if (matches.length !== 1) message = matches.length ? 'More than one threshold matches. Explicit route selection is required.' : 'No threshold covers this combination. Explicit route confirmation is required.'; else { rule = matches[0]; level = rule.level; stage = rule.submissionStage; if (!stage) message = 'The matching rule has no confirmed submission stage.'; } }
  else if (!level || !stage) message = 'Choose an approval level and submission stage. Threshold matches are advisory until confirmed.';
  const cycle = config?.cycles.find(c => c.id === selected?.cycleId);
  if (!message && !cycle) message = 'Select an explicit approval cycle. Missed deadlines never roll forward automatically.';
  if (!message && cycle && stage) { date = cycle[stage as BcaStage]; if (!date) message = 'The selected submission date is missing from the source calendar.'; }
  const days = date ? dayNumber(date) - dayNumber(asOf) : null, kind = days === null ? 'unconfigured' : days < 0 ? 'overdue' : days <= settings.bcaWarningDays ? 'soon' : 'future';
  return { date, days, kind, message, level, stage, cycle, config, matches, rule, global: level === 'global' || level === 'corporate', conflict: !!date && !!t.plannedEnd && t.plannedEnd > date, trace: config && cycle ? `${config.year} / ${config.revision} / ${cycle.label} / ${stage || 'stage not set'} / ${selected?.mode || 'manual'}` : '' };
}
export function validateSettings(value: unknown): value is WorkspaceSettings {
  if (!value || typeof value !== 'object') return false; const s = value as WorkspaceSettings;
  if (!(s.usdToEur === null || typeof s.usdToEur === 'number' && Number.isFinite(s.usdToEur) && s.usdToEur > 0) || !Number.isInteger(s.bcaWarningDays) || s.bcaWarningDays < 0 || s.bcaWarningDays > 365 || !Array.isArray(s.bcaYears)) return false;
  const ids = (a: { id: string }[]) => a.every(x => x && typeof x === 'object' && typeof x.id === 'string' && !!x.id) && new Set(a.map(x => x.id)).size === a.length;
  if (s.bcaYears.some(y => !y || typeof y !== 'object')) return false;
  return new Set(s.bcaYears.map(y => y.year)).size === s.bcaYears.length && s.bcaYears.every(y => Number.isInteger(y.year) && y.year >= 1900 && y.year <= 2200 && typeof y.source === 'string' && typeof y.revision === 'string' && typeof y.caveats === 'string' && typeof y.routingConfirmed === 'boolean' && y.routingPolicy === 'unique-match' && Array.isArray(y.rules) && ids(y.rules) && y.rules.every(r => ['country','region','global','corporate'].includes(r.level) && typeof r.label === 'string' && typeof r.approvers === 'string' && ['<','<=','>','>='].includes(r.amountOperator) && Number.isFinite(r.amountEur) && r.amountEur >= 0 && ['<=','>','any'].includes(r.termOperator) && (r.termOperator === 'any' ? r.termYears === null : typeof r.termYears === 'number' && Number.isFinite(r.termYears) && r.termYears >= 0) && ['','regional','gho'].includes(r.submissionStage)) && Array.isArray(y.cycles) && ids(y.cycles) && y.cycles.every(c => typeof c.label === 'string' && typeof c.note === 'string' && ['regional','regionalMeeting','gho','globalMeeting'].every(k => { const d = c[k as keyof BcaCycle]; return typeof d === 'string' && (!d || validDate(d) && d.startsWith(String(y.year))); })));
}
export function extensionErrors(t: Transaction): string[] {
  const errors: string[] = [], timestamp = (s: unknown) => typeof s === 'string' && Number.isFinite(Date.parse(s)), unique = (rows: { id: string }[]) => rows.every(r => r && typeof r === 'object' && typeof r.id === 'string' && !!r.id) && new Set(rows.map(r => r.id)).size === rows.length;
  for (const key of ['previousSqft','previousOpex','commitmentUsd','termYears'] as const) if (t[key] !== undefined && t[key] !== null && !(Number.isFinite(t[key]) && t[key]! >= 0)) errors.push(`${key} must be nonnegative or unset.`);
  if (t.noteEntries !== undefined && (!Array.isArray(t.noteEntries) || !unique(t.noteEntries) || t.noteEntries.some(n => typeof n.text !== 'string' || n.text.length > 50000 || !(n.createdAt === null || timestamp(n.createdAt)) || n.migratedAt !== undefined && !timestamp(n.migratedAt) || n.updatedAt !== undefined && !timestamp(n.updatedAt) || n.deletedAt !== undefined && !timestamp(n.deletedAt) || !Array.isArray(n.history) || n.history.some(h => !h || typeof h !== 'object' || typeof h.text !== 'string' || !timestamp(h.editedAt))))) errors.push('Invalid note entries or timestamps.');
  if (t.checklist !== undefined && (!Array.isArray(t.checklist) || !unique(t.checklist) || t.checklist.some(c => typeof c.text !== 'string' || !c.text.trim() || typeof c.done !== 'boolean'))) errors.push('Checklist items need text and a completion state.');
  if (t.comparables !== undefined && (!Array.isArray(t.comparables) || !unique(t.comparables) || t.comparables.some(c => typeof c.address !== 'string' || !c.address.trim() || !(c.annualPsfUsd === null || Number.isFinite(c.annualPsfUsd) && c.annualPsfUsd >= 0)))) errors.push('Market properties need an address and a valid rate.');
  if (t.bcaSelection !== undefined && (!t.bcaSelection || typeof t.bcaSelection !== 'object' || !Number.isInteger(t.bcaSelection.year) || !['','country','region','global','corporate'].includes(t.bcaSelection.level) || !['','regional','gho'].includes(t.bcaSelection.stage) || !['manual','rules'].includes(t.bcaSelection.mode) || typeof t.bcaSelection.cycleId !== 'string' || typeof t.bcaSelection.decisionNote !== 'string')) errors.push('Invalid BCA selection.');
  return errors;
}
