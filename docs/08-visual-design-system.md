# Visual Design System

## Direction

Artmonia ERP should feel like a premium operational studio system: fast, calm, modern, and lightly artistic. The reference style is an airy SaaS dashboard with a compact icon rail, white panels, soft gray workspace, cobalt/violet highlight cards, pastel status accents, clean charts, and dense tables.

Artmonia-specific difference:

- Add refined painterly details, not decorative clutter.
- Use brush-wash background motion and small palette color swatches as brand cues.
- Keep ERP readability and speed above illustration.
- Use art-studio warmth through color and texture, not through heavy graphics.
- The app must be full-bleed in the browser. Do not wrap the ERP in a large floating outer frame that creates an "app inside a screen" feeling.

## Visual Tokens

- Workspace: `#f2f5fa`
- Surface: `#ffffff`
- Surface muted: `#f8faff`
- Ink: `#10131a`
- Muted text: `#6f7787`
- Hairline: `#e4e9f2`
- Primary blue: `#3158ff`
- Primary violet: `#6d48ff`
- Deep control: `#2d3038`
- Mint success: `#65d98b`
- Coral alert: `#ff7972`
- Yellow waiting: `#ffe28a`
- Sky info: `#90adff`
- Apricot: `#f7a36f`

## Geometry

- Repeated cards/panels: 8px radius
- Large app frame: 28px radius
- Icon buttons: circular or 10px radius square
- Sidebar width: 72px desktop
- Main gutter: 24px desktop, 16px tablet/mobile
- Table row height: 58px minimum

## Typography

- Use Geist/Inter-like sans-serif.
- Dashboard greeting: 28-32px, 700 weight
- Page title: 28px, 700 weight
- Card values: 28-34px, 700 weight
- Labels: 12-13px, 600 weight
- Body/cell text: 13-14px
- Muted helper text: 12px
- Letter spacing: 0

## Component Families

### App Shell

- Full-height left compact icon rail with abstract wave mark.
- Top utility bar with search, date, notification/settings icons, avatar.
- Main content sits directly on a soft gray full-browser workspace.
- Role-specific nav items are icon-first with tooltips later.

### Cards

- White surfaces with subtle border and soft shadow.
- Primary KPI card can use cobalt/violet gradient.
- Status cards use pastel top bands, not full saturated fills.
- Avoid nested cards.

### Tables

- Dense, readable, server-driven tables.
- Sticky-feeling header style through light gray band.
- Status chips are small, rounded, and color-coded.
- Payment/debt indicators should be visible but quiet.

### Charts

- Use rounded bar charts in cobalt/violet.
- Donut/palette charts use small art swatch colors.
- Dashboard cards should have fixed height to avoid layout jumps.

### Art Motifs

- One large soft painterly wash can sit behind app frames or inside empty states.
- Small brushstroke/palette swatch details can appear in headers or status cards.
- No clutter, no stock photos, no childish paint splashes.

## First Screens

MVP visual implementation should start with:

1. Owner Dashboard
2. Student/Finance List
3. Student Profile
4. Payment Ledger
5. Settings shell

The first implementation should prove the shell, dashboard density, table style, status chips, and smooth loading states before detailed forms are expanded.
