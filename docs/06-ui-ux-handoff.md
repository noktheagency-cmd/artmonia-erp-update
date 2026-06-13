# UI/UX Handoff

This file defines what should be decided when the UI/UX direction arrives.

## Product Surface

MVP screens:

- Login
- ERP shell/navigation
- Today workspace
- Owner dashboard
- CRM board/list
- Lead detail
- Student list
- Student profile
- Payment ledger
- Debt aging
- Teacher profile
- Payout preview
- Reports/export
- Settings

## Design Priorities

- Fast daily operation over decorative layout
- Dense but readable ERP screens
- Clear status chips and finance indicators
- Stable table layout with no jumping rows
- Keyboard-friendly forms for finance and operations
- Strong empty/error/loading states
- Role-specific navigation

## UI Data Contracts Needed

For each screen, define:

- Primary user role
- Main table/card fields
- Filters
- Sort options
- Primary action
- Secondary actions
- Empty state
- Error state
- Loading state
- Permission restrictions

## Performance Requirements For UI

- The first viewport should not wait for every dashboard card.
- Tables must show stable skeleton rows while loading.
- Filters should update through server query params or controlled fetch, not full client-side dataset filtering.
- Large modals should be lazy-loaded.
- Avoid nested card-heavy layouts for operational screens.
- Finance action buttons must stay disabled during pending mutation and show clear result state.

## Suggested Navigation

```text
Dashboard
Today
CRM
Students
Finance
Teachers
Reports
Settings
```

P1 navigation additions:

```text
Groups
Schedule
Attendance
```

## UI/UX Inputs Needed From Client

- Brand colors and logo
- Preferred visual density: compact, comfortable, or spacious
- Dashboard priority order for Owner
- CRM pipeline column names and language
- Table columns for Student List
- Finance workflow preference for payment entry
- Whether the interface language should be Azerbaijani, Turkish, English, or mixed
- Any example apps/screens the client likes

## Implementation Note

The UI should be built after the technical foundation is scaffolded, but data contracts should be finalized before detailed styling. This prevents expensive UI rework when business rules change.
