# DHL Transaction Manager

Responsive corporate real estate dashboard built with React, TypeScript and Vite, with a US map, editable transaction records, notes exports, a draggable Gantt planner, BCA deadlines, and configurable status labels. This is a browser-local first version with synthetic demo data.

## Run

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vercel configuration is included. The GitHub destination is `Wolfwolf22/Transaction-Manager`.

## Dates and planning

- Date fields use `YYYY-MM-DD` strings. Arithmetic and formatting use UTC; the business-day clock uses America/New_York.
- Notification, critical, expiration, BCA preparation, planned start and planned finish are independent.
- Dragging a Gantt bar or using its left/right keys changes planning dates only. Arrow keys move seven days.
- Planning horizons are 8, 12 and 18 months. Off-screen deadlines remain in the row labels.
- Missing notification/critical dates and plans finishing after those dates are visible warnings. No deadline is inferred from an absent value.
- Status choices are provisional labels, editable in Settings. No BCA business-rule expansion or automatic lead time is assumed.

## Import

`eCom portfolio.xlsx` was inspected read-only to implement its actual Sheet1 layout. No corporate rows are included in this repository or deployment. The importer accepts XLSX and CSV, selects worksheets and header rows, validates rows, previews them, and appends only after the user confirms.

Recognized columns: IATA, Address, City, Country, Zip, Business Unit, BU Owner, Occupied SF, Lease Expiration Date, Option Terms, and the original spelling `Next Notificatoin Date (Critical Date)`.

The combined date column requires an explicit import choice: notification, critical, or both as separate initial fields. No default business interpretation is silently applied. Transaction names can be generated from IATA and address. Fields absent from the template remain unset, including pricing, map coordinates and planning dates. Progress starts at zero and status uses the first configured option. Unmapped source columns are preserved in `importData`.

Map coordinates are entered manually; missing coordinates remain flagged as unmapped. There is no external geocoding service. The visual connections on the map represent no business relationship or transport route.

## Complete export

The top-bar **Export all** action downloads an Excel workbook independent of the import layout:

- **Transactions:** every current transaction field, current/previous annual pricing, operating expenses, location, all six date fields, BCA deadline, progress, status, business ownership, option terms and derived annual base rent.
- **Notes:** complete notes linked by immutable transaction ID. Notes exceeding Excel's cell limit are split into ordered 30,000-character parts without losing characters.
- **Settings:** status options, schema version, saved/export timestamps, timezone, and interpretation notes.
- **Imported source fields:** every original imported column and value, linked by transaction ID, including columns that have no dashboard mapping.

Each transaction additionally has a notes-only text export. Settings provides a complete JSON backup and validated restore. XLSX is a readable full export; use JSON for exact workspace restoration.

## Persistence and scope

All edits are stored in this browser's localStorage. They are not shared between devices, browsers, deployments or users. Storage failures are reported, corrupt saved data is preserved, and backup restore asks before replacement. Cross-tab stale saves are blocked. There is no authentication, shared database, server-side reminder service, audit trail or lease-attachment feature.

Use synthetic data for public demonstrations. Before entering confidential production data, add organizational authentication, shared storage, authorization, audit history and operational backups. Export backups to avoid losing browser-local work.

## Verification

Automated tests cover date-only behavior across timezones, DST and year boundaries, deadline preservation during schedule shifts, malformed import values, the exact template column layout, original-column preservation, backup validation, notes export, and full XLSX save/reopen completeness with long notes, custom status labels and edits made after import.

The actual private workbook was separately validated locally: 3 rows, 11 columns, zero validation errors for each single-date interpretation. Its SHA256 was checked unchanged. Browser checks covered editing, notes download and persistence, actual bar dragging, keyboard movement, date conflict visibility and planning horizon switching.

## Geography attribution

US state boundaries are supplied by the ISC-licensed `us-atlas` package, derived from US Census Bureau boundaries. Geography is rendered locally; map use does not transmit transaction coordinates.
