import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { addDays, dateState, formatDate, validDate, sampleTransactions, shiftPlan, conflicts, parseCsv, importPreview, INITIAL_STATUSES, validateTransaction, validateStore, notesText, type Store, type Transaction } from './model';
import { fullWorkbook, exportKeys, readWorkbook, sheetTable } from './workbook';
import { autoMapping, combinedHeader } from './ImportTransactions';
describe('deadline protection', () => {
  it('shifts only the planning dates, across daylight saving and year boundaries', () => {
    const t = { ...sampleTransactions()[0], notificationDate: '2026-11-01', criticalDate: '2027-01-02', plannedStart: '2026-10-30', plannedEnd: '2026-12-28' };
    const moved = shiftPlan(t, 14);
    expect(moved.plannedStart).toBe('2026-11-13'); expect(moved.plannedEnd).toBe('2027-01-11');
    const { plannedStart: a, plannedEnd: b, ...rest } = moved; const { plannedStart: c, plannedEnd: d, ...before } = t;
    expect(rest).toEqual(before); expect(conflicts(moved)).toHaveLength(2);
  });
  it('keeps date-only values stable in distant timezones', () => {
    const old = process.env.TZ;
    for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo']) { process.env.TZ = tz; expect(formatDate('2026-11-01')).toBe('Nov 1, 2026'); expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); }
    process.env.TZ = old;
  });
  it('rejects rollover dates and marks missing / overdue deadlines', () => {
    expect(validDate('2026-02-29')).toBe(false); expect(validDate('2028-02-29')).toBe(true);
    expect(dateState('2026-10-07', '2026-10-08').kind).toBe('overdue'); expect(dateState('').kind).toBe('missing');
  });
});
describe('validated import', () => {
  it('reads the exact template headers and preserves every source field', async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Sheet1');
    const headers = ['IATA', 'Address', 'City', 'Country', 'Zip', 'Business Unit', 'BU Owner', 'Occupied SF', 'Lease Expiration Date', 'Option Terms', combinedHeader];
    sheet.addRow(headers); const row = sheet.addRow(['DEN', '100 Example Way', 'Denver', 'US', '00123', 'Sample BU', 'Sample owner', 123456, new Date('2027-12-31T00:00:00Z'), 'Illustrative option terms', new Date('2027-06-01T00:00:00Z')]); row.getCell(9).numFmt = 'mm/dd/yyyy'; row.getCell(11).numFmt = 'mm/dd/yyyy';
    const raw = await book.xlsx.writeBuffer(); const sheets = await readWorkbook(raw as ArrayBuffer); const table = sheetTable(sheets[0], 1); const map = autoMapping(table.headers);
    expect(map.notificationDate).toBe(''); expect(map.criticalDate).toBe('');
    const preview = importPreview(table.headers, table.rows, { ...map, notificationDate: combinedHeader }, INITIAL_STATUSES);
    const t = preview[0].transaction; expect(preview[0].errors).toEqual([]); expect(t.zip).toBe('00123'); expect(t.sqft).toBe(123456); expect(t.notificationDate).toBe('2027-06-01'); expect(t.criticalDate).toBe(''); expect(t.currentPsf).toBeNull(); expect(t.latitude).toBeNull(); expect(t.plannedStart).toBe(''); expect(Object.keys(t.importData!)).toEqual(headers); expect(t.optionTerms).toBe('Illustrative option terms');
  });
  it('rejects bad dates and numeric fields; supports quoted multiline CSV notes', () => {
    const parsed = parseCsv('iata,expirationDate,notes\nDEN,2027-02-30,"line one\nline two, with a comma"');
    const result = importPreview(parsed.headers, parsed.rows, autoMapping(parsed.headers), INITIAL_STATUSES);
    expect(result[0].errors.some(e => e.includes('Expiration'))).toBe(true); expect(result[0].transaction.notes).toBe('line one\nline two, with a comma');
    expect(() => parseCsv('iata,iata\nDEN,LAX')).toThrow('unique');
  });
  it('rejects malformed backups and duplicate transaction IDs', () => {
    const t = sampleTransactions()[0]; expect(validateTransaction({ ...t, progress: 101 }, INITIAL_STATUSES)).not.toEqual([]);
    expect(validateStore({ version: 1, statuses: INITIAL_STATUSES, transactions: [t, t] })).toBe(false);
  });
});
describe('complete exports', () => {
  it('round-trips all fields, optional values, settings, long notes and post-import edits', async () => {
    const t: Transaction = { ...sampleTransactions()[0], address: 'Synthetic address', zip: '00123', businessUnit: 'Example unit', buOwner: 'Example owner', optionTerms: 'Option amended after import', notes: '=NOT_A_FORMULA\n' + 'Complete notes & details. '.repeat(1800), currentPsf: 36.72, previousPsf: 29.31, opex: 918274.44, bcaDate: '2027-02-02', progress: 37, importData: { 'Extra source field': 'Retained value', 'Occupied SF': '12345' } };
    const store: Store = { version: 1, transactions: [t], statuses: [...INITIAL_STATUSES, 'Custom status'], savedAt: '2026-10-08T12:30:00Z' };
    const output = await fullWorkbook(store); const saved = await output.xlsx.writeBuffer(); const read = new ExcelJS.Workbook(); await read.xlsx.load(saved);
    const tx = read.getWorksheet('Transactions')!;
    exportKeys.forEach((key, i) => { const actual = tx.getRow(2).getCell(i + 1).value; expect(actual instanceof Date ? actual.toISOString().slice(0, 10) : actual).toEqual(t[key] ?? null); });
    const notes = read.getWorksheet('Notes')!; let restored = ''; notes.eachRow((r, n) => { if (n > 1) restored += r.getCell(5).value; }); expect(restored).toBe(t.notes);
    expect(read.getWorksheet('Settings')!.getColumn(2).values).toContain('Custom status'); expect(read.getWorksheet('Imported source fields')!.rowCount).toBe(3);
    expect(notesText(t)).toContain(t.notes); expect(notesText(t)).toContain(t.notificationDate); expect(notesText(t)).toContain(t.criticalDate);
  });
});
