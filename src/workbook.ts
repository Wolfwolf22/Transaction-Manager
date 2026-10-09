import ExcelJS from 'exceljs';
import { entriesOf, settingsOf, bcaFor, costs, squareMeters, eur, effectiveProgress } from './workflow';
import { dateFields, fieldLabels, type Store, type Transaction } from './model';
export const exportKeys: (keyof Transaction)[] = ['id', 'iata', 'name', 'city', 'address', 'country', 'zip', 'businessUnit', 'buOwner', 'optionTerms', 'type', 'status', 'source', 'sqft', 'currentPsf', 'previousPsf', 'opex', 'latitude', 'longitude', 'notificationDate', 'criticalDate', 'expirationDate', 'plannedStart', 'plannedEnd', 'progress', 'bcaDate', 'previousSqft', 'previousOpex', 'commitmentUsd', 'termYears', 'legacyProgress'];
export async function fullWorkbook(store: Store) {
  const book = new ExcelJS.Workbook(); book.creator = 'DHL Transaction Manager'; book.created = new Date();
  const tx = book.addWorksheet('Transactions', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
  tx.addRow([...exportKeys.map(k => fieldLabels[k] || k), 'Annual base rent (USD)', 'Notes location', 'Proposed area (m²)', 'Previous area (m²)', 'Previous base rent (USD)', 'Proposed total occupancy (USD)', 'Previous total occupancy (USD)', 'Proposed total occupancy (EUR)', 'Previous total occupancy (EUR)', 'BCA year', 'BCA selection mode', 'Selected level', 'Selected stage', 'Cycle ID', 'Decision note', 'Effective BCA submission', 'Effective approval level', 'BCA source trace', 'BCA needs review']);
  for (const t of store.transactions) {
    const row = tx.addRow([...exportKeys.map(k => (dateFields as readonly string[]).includes(k) && t[k] ? new Date(String(t[k]) + 'T00:00:00Z') : t[k]), t.currentPsf === null ? null : t.sqft * t.currentPsf, 'Notes sheet, matched by transaction ID', squareMeters(t.sqft), t.previousSqft == null ? null : squareMeters(t.previousSqft), costs(t).previousBase, costs(t).currentTotal, costs(t).previousTotal, eur(costs(t).currentTotal, settingsOf(store).usdToEur), eur(costs(t).previousTotal, settingsOf(store).usdToEur), t.bcaSelection?.year ?? null, t.bcaSelection?.mode ?? '', t.bcaSelection?.level ?? '', t.bcaSelection?.stage ?? '', t.bcaSelection?.cycleId ?? '', t.bcaSelection?.decisionNote ?? '', bcaFor(t,settingsOf(store)).date, bcaFor(t,settingsOf(store)).level, bcaFor(t,settingsOf(store)).trace, bcaFor(t,settingsOf(store)).message]);
    exportKeys.forEach((k, i) => { if ((dateFields as readonly string[]).includes(k)) row.getCell(i + 1).numFmt = 'mm/dd/yyyy'; if (['sqft', 'opex'].includes(k)) row.getCell(i + 1).numFmt = '#,##0.00'; if (['currentPsf', 'previousPsf'].includes(k)) row.getCell(i + 1).numFmt = '"$"#,##0.00'; });
    row.getCell(exportKeys.length + 1).numFmt = '"$"#,##0.00';
  }
  const notes = book.addWorksheet('Notes', { views: [{ state: 'frozen', ySplit: 1 }] });
  notes.addRow(['Transaction ID', 'IATA', 'Transaction name', 'Part', 'Complete note text (join parts without separators)', 'Note ID', 'Created timestamp (UTC)', 'Migrated timestamp (UTC)', 'Edited timestamp (UTC)', 'Deleted timestamp (UTC)', 'Original date status']);
  const history = book.addWorksheet('Note history'); history.addRow(['Transaction ID','Note ID','Version','Part','Previous text','Edited timestamp (UTC)']);
  for (const t of store.transactions) for (const n of entriesOf(t)) {
    for (let start=0;start<Math.max(n.text.length,1);start+=30000) notes.addRow([t.id,t.iata,t.name,start/30000+1,n.text.slice(start,start+30000),n.id,n.createdAt||'',n.migratedAt||'',n.updatedAt||'',n.deletedAt||'',n.createdAt?'Recorded':'Unknown original date']);
    n.history.forEach((h,i)=>{for(let start=0;start<Math.max(h.text.length,1);start+=30000)history.addRow([t.id,n.id,i+1,start/30000+1,h.text.slice(start,start+30000),h.editedAt]);});
  }
  const checklist=book.addWorksheet('Checklists'); checklist.addRow(['Transaction ID','Item ID','Item','Completed','Derived progress (%)']);
  const comparable=book.addWorksheet('Market comparables'); comparable.addRow(['Transaction ID','Comparable ID','Address','Annual USD / sq ft','Annual EUR / sq ft']);
  for(const t of store.transactions){for(const c of t.checklist||[])checklist.addRow([t.id,c.id,c.text,c.done,effectiveProgress(t)]);for(const c of t.comparables||[])comparable.addRow([t.id,c.id,c.address,c.annualPsfUsd,eur(c.annualPsfUsd,settingsOf(store).usdToEur)]);}
  const rules=book.addWorksheet('BCA rules'); rules.addRow(['Year','Source','Revision','Routing confirmed','Rule ID','Level','Label','EUR operator','Commitment EUR','Term operator','Years','Approvers','Submission stage','Routing policy','Caveats']);
  const calendars=book.addWorksheet('BCA calendars'); calendars.addRow(['Year','Cycle ID','Label','Regional submission','NorAm meeting','GHO submission','Global meeting','Note']);
  for(const y of settingsOf(store).bcaYears){for(const r of y.rules)rules.addRow([y.year,y.source,y.revision,y.routingConfirmed,r.id,r.level,r.label,r.amountOperator,r.amountEur,r.termOperator,r.termYears,r.approvers,r.submissionStage,y.routingPolicy,y.caveats]);for(const c of y.cycles)calendars.addRow([y.year,c.id,c.label,c.regional,c.regionalMeeting,c.gho,c.globalMeeting,c.note]);}
  const json=book.addWorksheet('Complete workspace JSON');json.addRow(['Part','Exact backup JSON (join parts without separators)']);const serialized=JSON.stringify(store);for(let start=0;start<serialized.length;start+=30000)json.addRow([start/30000+1,serialized.slice(start,start+30000)]);
  const settings = book.addWorksheet('Settings'); settings.addRows([['Setting', 'Value'], ['Schema version', store.version], ['Corporate exchange rate (EUR per USD)', settingsOf(store).usdToEur], ['BCA warning window (days)', settingsOf(store).bcaWarningDays], ['Workspace saved at', store.savedAt], ['Exported at', new Date().toISOString()], ['Business timezone', 'America/New_York'], ['Persistence', 'Browser-local; no shared backend'], ['Annual base rent', 'Area × current annual price per square foot; operating expenses excluded'], ['Notes', 'All characters preserved in Notes, split only for Excel cell length limits'], ...store.statuses.map((s, i) => [`Status option ${i + 1}`, s])]);
  const imported = book.addWorksheet('Imported source fields'); imported.addRow(['Transaction ID', 'IATA', 'Source column', 'Part', 'Original imported value (join parts in order)']);
  for (const t of store.transactions) for (const [key, value] of Object.entries(t.importData || {})) for (let start = 0; start < Math.max(value.length, 1); start += 30000) imported.addRow([t.id, t.iata, key, start / 30000 + 1, value.slice(start, start + 30000)]);
  for (const sheet of book.worksheets) {
    sheet.getRow(1).height = 34; sheet.getRow(1).font = { bold: true, color: { argb: 'FF26352E' }, size: 11 };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCC00' } };
    sheet.columns.forEach((c, i) => { c.width = sheet.name === 'Notes' || sheet.name === 'Imported source fields' ? [38, 10, 40, 10, 110][i] || 28 : sheet.name === 'Settings' ? [32, 110][i] : i === 0 ? 38 : i === 2 ? 44 : 24; });
    sheet.eachRow((row, index) => { row.alignment = { vertical: 'top', wrapText: true }; if (index > 1) { row.font = { name: 'Calibri', size: 11 }; row.height = sheet.name === 'Notes' ? 110 : 32; if (index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6EF' } }; } });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  }
  return book;
}
export async function exportWorkbook(store: Store) {
  const book = await fullWorkbook(store); const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = 'DHL-complete-dashboard-export.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type ImportSheet = { name: string; matrix: string[][] };
export async function readWorkbook(buffer: ArrayBuffer): Promise<ImportSheet[]> {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  return book.worksheets.filter(s => s.state === 'visible' && s.rowCount > 0).map(sheet => {
    if (sheet.rowCount > 1050 || sheet.columnCount > 150) throw new Error('Worksheet is too large. Use at most 1,000 data rows and 150 columns.');
    const matrix: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, row => { const values: string[] = []; for (let i = 1; i <= sheet.columnCount; i++) { const cell = row.getCell(i), value = cell.value; if (value instanceof Date) values.push(value.toISOString().slice(0, 10)); else if (value && typeof value === 'object' && 'formula' in value) { const result = value.result; values.push(result instanceof Date ? result.toISOString().slice(0, 10) : result === undefined ? '#FORMULA_WITHOUT_RESULT' : String(result)); } else values.push(cell.text); } matrix.push(values); });
    return { name: sheet.name, matrix };
  });
}
export function sheetTable(sheet: ImportSheet, headerRow: number) {
  const headers = sheet.matrix[headerRow - 1]?.map(s => s.trim());
  if (!headers?.length) throw new Error('Choose a valid header row.');
  // Empty styled trailing columns are ignored, but populated unnamed columns are rejected.
  let last = headers.length - 1; while (last >= 0 && !headers[last] && sheet.matrix.slice(headerRow).every(r => !r[last])) last--;
  const columns = headers.slice(0, last + 1);
  if (columns.some(h => !h) || new Set(columns).size !== columns.length) throw new Error('Selected header row must have unique, nonempty column names.');
  const rows = sheet.matrix.slice(headerRow).filter(r => r.some(Boolean)).map(r => r.slice(0, last + 1));
  if (!rows.length || rows.length > 1000) throw new Error('Choose a sheet with 1–1,000 transaction rows.');
  return { headers: columns, rows };
}
