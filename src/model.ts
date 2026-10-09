import Papa from 'papaparse';
import { type NoteEntry, type ChecklistItem, type Comparable, type BcaSelection, type WorkspaceSettings, entriesOf, extensionErrors, migrateStore, validateSettings } from './workflow';

export type Transaction = {
  id: string; name: string; iata: string; city: string; type: string; sqft: number;
  currentPsf: number | null; previousPsf: number | null; opex: number | null; latitude: number | null; longitude: number | null;
  address: string; country: string; zip: string; businessUnit: string; buOwner: string; optionTerms: string;
  notificationDate: string; criticalDate: string; expirationDate: string;
  plannedStart: string; plannedEnd: string; bcaDate: string; status: string; progress: number; notes: string;
  source: 'sample' | 'user';
  importData?: Record<string, string>;
  noteEntries?: NoteEntry[]; checklist?: ChecklistItem[]; comparables?: Comparable[];
  previousSqft?: number | null; previousOpex?: number | null; commitmentUsd?: number | null; termYears?: number | null;
  bcaSelection?: BcaSelection; legacyProgress?: number;
};
export type Store = { version: 1 | 2; transactions: Transaction[]; statuses: string[]; savedAt: string; settings?: WorkspaceSettings };
export const STORAGE_KEY = 'dhl-tm-v1';
export const INITIAL_STATUSES = ['Planning', 'In progress', 'Under review', 'Completed', 'On hold'];
export const dateFields = ['notificationDate', 'criticalDate', 'expirationDate', 'plannedStart', 'plannedEnd', 'bcaDate'] as const;
export const numericFields = ['sqft', 'currentPsf', 'previousPsf', 'opex', 'latitude', 'longitude', 'progress'] as const;
export const textFields = ['name', 'iata', 'city', 'address', 'country', 'zip', 'businessUnit', 'buOwner', 'optionTerms', 'type', 'status', 'notes'] as const;
export const importFields = [...textFields, ...numericFields, ...dateFields];
export const fieldLabels: Record<string, string> = {
  name: 'Transaction name', iata: 'IATA code', city: 'City / state', type: 'Transaction type', sqft: 'Area (sq ft)',
  currentPsf: 'Current annual $/sq ft', previousPsf: 'Previous annual $/sq ft', opex: 'Annual operating expenses ($)',
  latitude: 'Latitude', longitude: 'Longitude', notificationDate: 'Notification date', criticalDate: 'Critical date',
  expirationDate: 'Expiration date', plannedStart: 'Planned start', plannedEnd: 'Planned finish', bcaDate: 'BCA preparation deadline', status: 'Status', progress: 'Progress (%)', notes: 'Notes',
  address: 'Address', country: 'Country', zip: 'ZIP / postal code', businessUnit: 'Business unit', buOwner: 'BU owner', optionTerms: 'Option terms',
};
const DAY = 86400000;
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2200-12-31';
}
export function dayNumber(value: string) { return Date.parse(value + 'T00:00:00Z') / DAY; }
export function addDays(value: string, days: number) { return new Date((dayNumber(value) + days) * DAY).toISOString().slice(0, 10); }
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(p => parts.find(x => x.type === p)!.value).join('-');
}
export function formatDate(value: string) {
  return validDate(value) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')) : 'Not set';
}
export function dateState(value: string, asOf = today()) {
  if (!value) return { kind: 'missing', label: 'Not set', days: Infinity };
  const days = dayNumber(value) - dayNumber(asOf);
  return { kind: days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'future', label: days < 0 ? `${-days}d overdue` : days === 0 ? 'Due today' : `In ${days} days`, days };
}
export function conflicts(t: Transaction) {
  return (['notificationDate', 'criticalDate'] as const).flatMap(key => !t[key] ? [`${fieldLabels[key]} is not set`] : t.plannedEnd && t.plannedEnd > t[key] ? [`${fieldLabels[key]} precedes planned finish`] : []);
}
// Only planning fields are changed here. Contractual dates are deliberately independent.
export function shiftPlan(t: Transaction, days: number): Transaction {
  if (!t.plannedStart || !t.plannedEnd) return t;
  const plannedStart = addDays(t.plannedStart, days), plannedEnd = addDays(t.plannedEnd, days);
  if (!validDate(plannedStart) || !validDate(plannedEnd)) return t;
  return { ...t, plannedStart, plannedEnd };
}
export function validateTransaction(value: unknown, statuses: string[]): string[] {
  if (!value || typeof value !== 'object') return ['Transaction must be an object.'];
  const t = value as Transaction;
  const errors: string[] = [];
  for (const key of [...textFields, ...dateFields, 'id', 'source'] as const) if (typeof t[key] !== 'string') errors.push(`${fieldLabels[key] || key} must be text.`);
  if (errors.length) return errors;
  if (!t.id || !t.name.trim()) errors.push('A name and unique ID are required.');
  if (!/^[A-Z]{3}$/.test(t.iata)) errors.push('IATA must contain exactly three letters.');
  if (!statuses.includes(t.status)) errors.push('Status must match an available option.');
  if (!['sample', 'user'].includes(t.source)) errors.push('Invalid data source.');
  if (t.importData !== undefined && (!t.importData || typeof t.importData !== 'object' || Array.isArray(t.importData) || Object.values(t.importData).some(v => typeof v !== 'string'))) errors.push('Invalid imported source fields.');
  for (const key of numericFields) if (!(t[key] === null && !['sqft', 'progress'].includes(key)) && !Number.isFinite(t[key])) errors.push(`${fieldLabels[key]} must be a finite number.`);
  for (const key of ['sqft', 'currentPsf', 'previousPsf', 'opex', 'progress'] as const) if (t[key] !== null && t[key]! < 0) errors.push(`${fieldLabels[key]} cannot be negative.`);
  if (t.progress > 100) errors.push('Progress cannot exceed 100%.');
  if ((t.latitude !== null && (t.latitude < -90 || t.latitude > 90)) || (t.longitude !== null && (t.longitude < -180 || t.longitude > 180))) errors.push('Map coordinates are out of range.');
  if ((t.latitude === null) !== (t.longitude === null)) errors.push('Provide both coordinates, or leave both unset.');
  for (const key of dateFields) if (t[key] && !validDate(t[key])) errors.push(`${fieldLabels[key]} must be a real date in YYYY-MM-DD format (1900–2200).`);
  if (!t.expirationDate) errors.push('Expiration date is required.');
  if (!!t.plannedStart !== !!t.plannedEnd) errors.push('Provide both planning dates, or leave both unset.');
  if (t.plannedEnd < t.plannedStart) errors.push('Planned finish must be on or after planned start.');
  if (t.name.length > 160 || t.notes.length > 50000) errors.push('Name or notes exceeds the supported length.');
  return [...errors, ...extensionErrors(t)];
}
export function validateStore(raw: unknown): raw is Store {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Store;
  return (s.version === 1 || s.version === 2 && validateSettings(s.settings)) && typeof s.savedAt === 'string' && Array.isArray(s.statuses) && s.statuses.length > 0 && s.statuses.every(x => typeof x === 'string' && !!x.trim()) && new Set(s.statuses).size === s.statuses.length && Array.isArray(s.transactions) && s.transactions.length <= 5000 && s.transactions.every(t => validateTransaction(t, s.statuses).length === 0) && new Set(s.transactions.map(t => t.id)).size === s.transactions.length;
}
export function loadStore(): { store: Store; error: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const parsed: unknown = JSON.parse(raw); if (!validateStore(parsed)) throw new Error('Invalid saved data'); return { store: migrateStore(parsed), error: '' }; }
  } catch { return { store: migrateStore({ version: 1, transactions: [], statuses: INITIAL_STATUSES, savedAt: '' }), error: 'Saved data could not be read. It has been preserved. Export the stored data or restore a valid backup in Settings before editing.' }; }
  return { store: migrateStore({ version: 1, transactions: sampleTransactions(), statuses: INITIAL_STATUSES, savedAt: '' }), error: '' };
}
export const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
export const compactMoney = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
export const number = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
export function notesText(t: Transaction) {
  return `${t.iata} | ${t.name}\n${t.city}\nStatus: ${t.status}\nNotification date: ${t.notificationDate}\nCritical date: ${t.criticalDate}\nExpiration date: ${t.expirationDate}\nSource: ${t.source === 'sample' ? 'SYNTHETIC SAMPLE' : 'User-entered'}\n\nNOTES\n${entriesOf(t).map(n => `[${n.deletedAt ? 'DELETED ' + n.deletedAt : 'ACTIVE'}] Created: ${n.createdAt || 'Unknown (legacy note)'}${n.migratedAt ? '\nMigrated: ' + n.migratedAt : ''}${n.updatedAt ? '\nEdited: ' + n.updatedAt : ''}\n${n.text}${n.history.map(h => '\nPrevious text before ' + h.editedAt + ':\n' + h.text).join('')}`).join('\n\n') || '(No notes)'}\n`;
}
export function download(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function sampleTransactions(): Transaction[] {
  const rows: [string, string, string, number, number, number, number, number, number, string, number][] = [
    ['LAX', 'Los Angeles gateway renewal', 'Los Angeles, CA', 33.94, -118.4, 185000, 24.5, -5, 25, 'Under review', 70],
    ['JFK', 'New York distribution expansion', 'New York, NY', 40.64, -73.78, 142000, 28, 10, 46, 'In progress', 48],
    ['ORD', 'Chicago logistics renewal', 'Chicago, IL', 41.98, -87.9, 225000, 14.75, 22, 72, 'In progress', 58],
    ['MIA', 'Miami service center', 'Miami, FL', 25.79, -80.29, 96000, 21, 42, 95, 'Planning', 25],
    ['DFW', 'Dallas regional hub', 'Dallas, TX', 32.9, -97.04, 310000, 12.5, 55, 112, 'In progress', 42],
    ['ATL', 'Atlanta gateway relocation', 'Atlanta, GA', 33.64, -84.43, 176000, 15.25, 18, 82, 'Under review', 62],
    ['SEA', 'Seattle facility renewal', 'Seattle, WA', 47.45, -122.31, 88000, 19.5, 85, 155, 'Planning', 15],
    ['DEN', 'Denver service center', 'Denver, CO', 39.86, -104.67, 114000, 16, 100, 180, 'Planning', 20],
    ['CVG', 'Cincinnati operating center', 'Cincinnati, KY', 39.05, -84.66, 420000, 11.25, 120, 205, 'In progress', 35],
    ['BOS', 'Boston gateway renewal', 'Boston, MA', 42.36, -71.01, 72000, 25, 148, 225, 'On hold', 10],
    ['PHX', 'Phoenix distribution facility', 'Phoenix, AZ', 33.43, -112.01, 132000, 14, 168, 260, 'Planning', 12],
    ['SFO', 'Bay Area service center', 'San Francisco, CA', 37.62, -122.38, 108000, 29.5, 190, 285, 'Planning', 8],
  ];
  const base = today();
  return rows.map(([iata, name, city, latitude, longitude, sqft, currentPsf, notice, critical, status, progress], i) => ({ id: `sample-${iata}`, name, iata, city, address: '', country: 'US', zip: '', businessUnit: '', buOwner: '', optionTerms: '', latitude, longitude, sqft, currentPsf, previousPsf: Math.round(currentPsf * .92 * 100) / 100, opex: sqft * 3.5, notificationDate: addDays(base, notice), criticalDate: addDays(base, critical), expirationDate: addDays(base, critical + 120), plannedStart: addDays(base, -30 + i * 8), plannedEnd: addDays(base, critical - 12), bcaDate: addDays(base, critical - 40), status, progress, source: 'sample', type: i % 3 === 0 ? 'Renewal' : i % 3 === 1 ? 'Expansion' : 'Relocation', notes: `SYNTHETIC SAMPLE — illustrative ${iata} transaction.\n\nConfirm business requirements and review the lease notice provision. Prepare options ahead of the notification date.\n\nNext step: align the proposed schedule with the local team.` }));
}
export function blankTransaction(status: string): Transaction {
  const base = today();
  return { id: crypto.randomUUID(), name: '', iata: '', city: '', address: '', country: '', zip: '', businessUnit: '', buOwner: '', optionTerms: '', type: 'Unspecified', sqft: 0, currentPsf: null, previousPsf: null, opex: null, latitude: null, longitude: null, notificationDate: '', criticalDate: '', expirationDate: '', plannedStart: base, plannedEnd: addDays(base, 90), bcaDate: '', status, progress: 0, notes: '', source: 'user' };
}
export function parseCsv(text: string) {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error(result.errors[0].message);
  const [headers, ...rows] = result.data;
  if (!headers?.length || !rows.length) throw new Error('Include a header row and at least one transaction.');
  if (rows.length > 1000) throw new Error('Import up to 1,000 transactions at a time.');
  if (new Set(headers).size !== headers.length) throw new Error('Column names must be unique.');
  if (rows.some(r => r.length !== headers.length)) throw new Error('Every row must have the same number of columns as the header.');
  return { headers, rows };
}
export type Mapping = Record<string, string>;
export function importPreview(headers: string[], rows: string[][], mapping: Mapping, statuses: string[]) {
  return rows.map((row, index) => {
    const t = blankTransaction(statuses[0]);
    t.importData = Object.fromEntries(headers.map((header, i) => [header, row[i]]));
    // Required source data is never guessed; unmapped optional values use explicit defaults.
    t.plannedStart = ''; t.plannedEnd = ''; t.latitude = null; t.longitude = null;
    for (const field of importFields) {
      const column = headers.indexOf(mapping[field]); if (column < 0) continue;
      const value = row[column].trim();
      if ((numericFields as readonly string[]).includes(field)) (t as unknown as Record<string, unknown>)[field] = value === '' ? ['sqft', 'progress'].includes(field) ? 0 : null : Number(value.replace(/[$,]/g, ''));
      else (t as unknown as Record<string, unknown>)[field] = field === 'iata' ? value.toUpperCase() : value;
    }
    if (!t.name && t.iata) t.name = `${t.iata}${t.address ? ` · ${t.address}` : ' transaction'}`;
    return { row: index + 2, transaction: t, errors: validateTransaction(t, statuses) };
  });
}
