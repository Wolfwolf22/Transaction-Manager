# DHL Transaction Manager — Revision 2

Browser-local corporate real estate workspace built with React, TypeScript and Vite. Public code and deployments contain synthetic transactions only. Internal BCA policy and calendar values are supplied separately as a local settings file.

## Transaction pages

Each record has a dedicated `#transaction/<id>` URL. That record must exist in the browser workspace for a direct link to work. Pages contain overview and option terms, financial comparisons, market properties, checklist, timestamped notes, BCA routing and an interactive location map.

Financial inputs remain USD. Set a chosen **EUR per USD** corporate exchange rate in Settings; no live or default rate is substituted. Area inputs remain sq ft and display m² using 0.09290304 m² per sq ft. Annual price per m² divides the annual price per sq ft by that factor. Previous and proposed areas and operating expenses are separate inputs. Annual costs and rates show USD, EUR, dollar differences and percentage changes. Missing previous values remain unset; a zero prior amount has no percentage change.

Market comparables have editable addresses and annual USD per sq ft, dual currency/area displays and differences from the proposed rate. Checklist completion controls progress; an empty checklist has no percentage. Migrated manual progress is preserved separately. Individual notes retain creation time, edited time and prior text; deletion is recoverable. Legacy notes have an unknown original creation time plus a migration timestamp. Times display in New York and export in UTC.

Save explicitly. Pending notes, checklist items and comparable drafts must be added or discarded before saving. Navigation warns about unsaved changes.

## BCA setup

In Settings, choose **Load local BCA settings**, select the separately supplied JSON, review it, load it into the draft, then **Save settings**. Enter the chosen corporate exchange rate when ready to evaluate EUR thresholds. In each transaction, enter the BCA total commitment and term, then select a route and approval cycle explicitly.

Each year contains editable thresholds, submission-stage mapping, calendar cycles, source/revision information and caveats. Automatic mode requires confirmed interpretation, both amount and term criteria, exactly one matching rule and a configured stage. Overlaps, gaps, missing dates and unconfirmed rules require manual review. Commitment is not inferred from rent, operating expenses or term. No unsupplied year or corporate board deadline is inferred; missed dates never roll forward automatically.

Every transaction shows BCA status. Global and corporate routes receive high-priority emphasis. The warning window is editable; 30 days is an application default. Saved calendar changes update selected submission dates. Legacy preparation dates remain separate from submission dates.

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
- Dragging a Gantt bar or using its left/right keys changes planning dates only. Arrow keys move seven days. Selected BCA submission dates and contractual dates remain fixed.
- Planning horizons are 8, 12 and 18 months. Off-screen deadlines remain in the row labels.
- Missing notification/critical dates and plans finishing after those dates are visible warnings. No deadline is inferred from an absent value.
- Status choices are provisional labels, editable in Settings. No unsupported BCA precedence or lead time is assumed. BCA conflicts and high-priority routes appear in planner rows. Critical dates in Deadline Watch use red emphasis plus an explicit warning label.

## Import

`eCom portfolio.xlsx` was inspected read-only to implement its actual Sheet1 layout. No corporate rows are included in this repository or deployment. The importer accepts XLSX and CSV, selects worksheets and header rows, validates rows, previews them, and appends only after the user confirms.

Recognized columns: IATA, Address, City, Country, Zip, Business Unit, BU Owner, Occupied SF, Lease Expiration Date, Option Terms, and the original spelling `Next Notificatoin Date (Critical Date)`.

The combined date column requires an explicit import choice: notification, critical, or both as separate initial fields. No default business interpretation is silently applied. Transaction names can be generated from IATA and address. Fields absent from the template remain unset, including pricing, map coordinates and planning dates. Progress starts at zero and status uses the first configured option. Unmapped source columns are preserved in `importData`.

Map coordinates can be entered manually or set by clicking the interactive detail map. Missing coordinates remain flagged as unmapped. There is no geocoding service. Visual connections on the overview represent no business relationship or transport route.

## Complete export

The top-bar **Export all** action downloads an Excel workbook independent of the import layout:

- **Transactions:** every current transaction field, current/previous annual pricing, operating expenses, location, all six date fields, BCA deadline, progress, status, business ownership, option terms and derived annual base rent.
- **Notes / Note history:** complete entries, original/edited/deleted timestamps and previous text, linked by transaction and note IDs. Text exceeding Excel's cell limit is split into ordered 30,000-character parts.
- **Checklists / Market comparables:** every editable item, completion state, property and rate.
- **BCA rules / BCA calendars:** saved annual thresholds, stages, dates, source traces and caveats.
- **Settings:** status options, manual exchange rate, warning window, schema version, timestamps and interpretation notes.
- **Complete workspace JSON:** exact serialized backup split into ordered parts, preserving every field.
- **Imported source fields:** every original imported column and value, linked by transaction ID, including columns that have no dashboard mapping.

Each transaction additionally has a notes-only text export including history. Settings provides a complete JSON backup and validated v1/v2 restore. XLSX is a readable full export; use JSON for direct workspace restoration.

Data belongs to the exact website origin. To move from an older preview address, export its JSON backup in Settings, then restore it at the current preview. Keep using the stable preview address. On the same origin, valid v1 storage migrates in memory and is saved as v2 on the next save; the original raw v1 data is copied to a separate browser backup key before writing. Original fields and notes are preserved without invented historical timestamps.

## Persistence and scope

All edits are stored in this browser's localStorage. They are not shared between devices, browsers, website origins or users. Storage failures are reported, corrupt saved data is preserved, and backup restore asks before replacement. Cross-tab stale transaction saves are blocked. There is no authentication, shared database, background reminder service or lease-attachment feature. Note history is editable local data, not an immutable audit log.

Use synthetic data for public demonstrations. Before entering confidential production data, add organizational authentication, shared storage, authorization, audit history and operational backups. Export backups to avoid losing browser-local work.

## Verification

The 17 automated tests cover date-only behavior across timezones/DST, fixed deadlines during planning shifts, import validation and source columns, v1 migration and malformed nested data, area/currency math, checklist progress, overlapping/missing/confirmed BCA routes, calendar changes and exact XLSX save/reopen recovery including long notes, edited/deleted history, settings and every added field.

Separate local tests verify the provided workbook and BCA configuration without retaining their contents in the repository; both source hashes remain unchanged. Browser checks cover full-page routing, save/reload persistence, pending-note protection, timestamped edits, checklist completion, manual currency conversion, editable calendar propagation, high-priority warnings, fixed BCA dates during planner keyboard movement and interactive maps. The first version also passed actual pointer-drag and download verification; download automation is not a revision release gate because workbook contents are tested directly.

## Geography attribution

Overview state boundaries are supplied by the ISC-licensed `us-atlas` package, derived from US Census Bureau boundaries, and render locally. Detail maps use Leaflet and © OpenStreetMap contributors. OpenStreetMap receives tile requests for the visible map viewport; notes and financial data are not sent. Attribution remains visible on the map.
