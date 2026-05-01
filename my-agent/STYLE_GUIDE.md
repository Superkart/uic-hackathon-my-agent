# Preventable Visit Detector — Style Guide

Design system reference for the UIC INFORMS Hackathon agent. Editorial / clinical voice with an oxblood + parchment palette, magazine-grade typography, and Cloudflare's `kumo` design system reskinned to match.

The system is opinionated and bold — it is not a generic "AI app." Pages should read like a printed care-coordinator console: serif display titles, mono-tracked editorial labels, sectioned content, and oxblood as the single saturated accent.

---

## Color System

### Primary — Oxblood

The single saturated accent. Used for active states, severity (critical / high), the masthead "Detector" word, the chat user bubble, the active tab underline, the timeline marker on the latest decision, the "Send" button, and the §III risk-pill `--danger` and `--critical` variants.

| Token                 | Hex       | Usage                                                            |
| --------------------- | --------- | ---------------------------------------------------------------- |
| `--color-oxblood-50`  | `#fdf3f3` | Tinted danger surface (light mode)                               |
| `--color-oxblood-100` | `#fadcdc` | Light pill backgrounds                                           |
| `--color-oxblood-200` | `#f0adad` | Hover tint                                                       |
| `--color-oxblood-300` | `#d97676` | Dark-mode primary text accent                                    |
| `--color-oxblood-400` | `#a83333` | —                                                                |
| `--color-oxblood-500` | `#5c0e0e` | **Primary action color** (buttons, accents, the "Detector" word) |
| `--color-oxblood-600` | `#3a0808` | Hover state for primary buttons                                  |
| `--color-oxblood-700` | `#2a0606` | —                                                                |
| `--color-oxblood-800` | `#1c0303` | —                                                                |
| `--color-oxblood-900` | `#0d0202` | Deep tint backgrounds                                            |

**Rule:** never use a second saturated color. Severity colors below (amber, ochre, deep-green) live in muted "burnt" registers so oxblood remains the single point of warmth on the page.

### Light Mode — Parchment

Warm paper-like tones evoking a clinical document. The chrome (rails, header) is one shade darker than the content well so the layout reads as a frame around a paper.

| CSS Variable                     | Hex       | Usage                              |
| -------------------------------- | --------- | ---------------------------------- |
| `--color-parchment-bg`           | `#FAF6EF` | Page background (content well)     |
| `--color-parchment-raised`       | `#F5EFE0` | Cards, rails                       |
| `--color-parchment-surface`      | `#EDE6D3` | Header, tab bar, elevated surfaces |
| `--color-parchment-hover`        | `#E5DBBF` | Hover states                       |
| `--color-parchment-border`       | `#D6C9A8` | Card / rail borders                |
| `--color-parchment-border-hover` | `#C4B48E` | Interactive hover borders          |

### Dark Mode — Instrument Navy

Cool navy / charcoal evoking a medical instrument display. Oxblood `oxblood-300` substitutes the saturated `oxblood-500` for primary text accents to maintain contrast.

| Token                             | Hex       | Usage                   |
| --------------------------------- | --------- | ----------------------- |
| `--color-instrument-bg`           | `#0D0E12` | Page background         |
| `--color-instrument-raised`       | `#111827` | Cards, rails            |
| `--color-instrument-surface`      | `#1A1D2E` | Header, tab bar, inputs |
| `--color-instrument-hover`        | `#252A3A` | Hover                   |
| `--color-instrument-border`       | `#1E2433` | Card / rail borders     |
| `--color-instrument-border-hover` | `#2D3548` | Hover borders           |
| `--color-instrument-text`         | `#e8ecf2` | Primary text            |
| `--color-instrument-muted`        | `#8b95a8` | Secondary text          |

### Severity (muted, oxblood-friendly)

Severity colors run desaturated so they don't compete with oxblood.

| Level      | Light                      | Dark                       | Used in                    |
| ---------- | -------------------------- | -------------------------- | -------------------------- |
| `critical` | oxblood-500 saturated fill | oxblood-500 saturated fill | RiskGauge, dashboard pills |
| `high`     | `#b45309` (burnt amber)    | `#d97706`                  | RiskGauge, dashboard pills |
| `medium`   | `#ca8a04` (ochre)          | `#eab308`                  | RiskGauge, dashboard pills |
| `low`      | `#2d5a3a` (forest)         | `#6ee7a8`                  | RiskGauge, dashboard pills |

---

## Typography

The display + body voice is editorial; data is mono with tabular figures so numbers align like a financial report.

### Font Families (loaded in `index.html` from Google Fonts)

| CSS variable     | Family                                               | Weights | Use                                                                              |
| ---------------- | ---------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `--font-display` | **Fraunces** (variable, with `opsz` and `SOFT` axes) | 420–700 | Top-level titles ("Visit Detector", "The Audit", "Lindsay Brekke" patient names) |
| `--font-body`    | **Newsreader** (variable, italic axis)               | 400–700 | Body prose, italic eyebrows, list items                                          |
| `--font-mono`    | **IBM Plex Mono**                                    | 300–600 | Editorial labels, stats numerals, risk scores, dates                             |
| `--font-stencil` | **Share Tech Mono**                                  | 400     | Fallback / decorative monospace                                                  |

### Size Scale

| Use                                              | Class / Size                                      | Notes                                      |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------ |
| Masthead title ("Visit Detector")                | `display-title` at `text-[42px]` to `text-[48px]` | Fraunces, `opsz` 96, `SOFT` 30             |
| Patient / section title (rails, dashboards)      | `display-title` at `text-[26px]`                  |                                            |
| Editorial eyebrow ("the preventable", "(today)") | `display-eyebrow` italic                          | Fraunces italic with `opsz` 36             |
| Numerals (stats, scores, IDs)                    | `numeral` class with `text-2xl` or `text-lg`      | IBM Plex Mono, tabular nums                |
| Editorial label (uppercase tracked)              | `label-mono`                                      | 10px, 0.22em letter-spacing, IBM Plex Mono |
| Tighter editorial label                          | `label-mono-tight`                                | 9.5px, 0.18em                              |
| Folio (page numbers, section numbers)            | `folio`                                           | 10px, 0.2em letter-spacing, muted color    |
| Body prose                                       | Newsreader at 14–15px                             | Default font-family on `<body>`            |

### Rules

- Display font (Fraunces) is reserved for **top-level titles only**. Sub-headings and labels stay in `label-mono`.
- All numbers in stat cards, risk scores, IDs, and dates use the `numeral` class with `font-feature-settings: "tnum"` so columns align.
- Synthea patient names (e.g. `Lindsay928 Brekke496`) are displayed with the digits **stripped from the headline** ("Lindsay Brekke") and the synthea ID surfaced in italic body text below ("synthea id · 928, age 47").

---

## Layout Patterns

### Three-Column Shell (`AppShell.tsx`)

```
┌──────────────────────────────────────────────────────────────┐
│  [pill] Visit Detector             UIC · INFORMS · ☼/☾       │
│  VOL. I — CARE COORDINATOR CONSOLE — DATE — NO. 001          │
├──────────┬─────────────────────────────────┬─────────────────┤
│          │  §I  §II  §III  ← editorial tabs│                 │
│ § I      │                                 │ § IV            │
│ ACTIVE   │   <App />  (chat / dashboards)  │ DECISION LEDGER │
│ SUBJECT  │                                 │                 │
│ § II     │                                 │ Live audit      │
│ § III    │                                 │ trail           │
└──────────┴─────────────────────────────────┴─────────────────┘
```

- Left rail: **300px**, `bg-raised`, contains the active patient context.
- Right rail: **340px**, `bg-raised`, contains the closed-loop audit ledger.
- Center: tab bar + flex-1 content well (`bg`).
- Header (`Header()`): full-width `bg-surface`, includes pill logo, masthead title, lockup row.

### Masthead

- Pill logo (`<PillIcon rotate />`) at `w-16 h-8`, rotated `-45deg`, oxblood gradient on the left half + parchment on the right.
- "Visit Detector" with the second word colored `var(--color-primary)`.
- Italic eyebrow ("the preventable") in Fraunces italic above the title.
- Lockup row (`.masthead-lockup`) with hairlines (`.masthead-rule`) separating issue volume, console label, date, and issue number — all in `label-mono`.

### Tab Bar (Editorial)

- No emoji. Uppercase `label-mono` labels prefixed with section numerals (`§I`, `§II`, `§III`).
- Active tab: 2px oxblood underline (`border-bottom-color: var(--color-primary)`); inactive tabs use `text-muted`.
- Section numeral colored oxblood on the active tab; muted otherwise.

### Section Numbering

The sidebars and tabs share a section system: `§ I — Active Subject`, `§ II — Active Conditions`, `§ III — Barriers`, `§ IV — Decision Ledger`. Use `folio` for the section-number eyebrow above each section title.

---

## Component Patterns

### Risk Pills (`.risk-pill`)

Outlined, uppercase, mono-tracked tags for severity / status. Used in the patient panel, dashboard rows, and patient identity cards.

```html
<span class="risk-pill risk-pill--ok">Care plan active</span>
<span class="risk-pill risk-pill--warn">High utilizer</span>
<span class="risk-pill risk-pill--danger pulse-glow">No care plan</span>
<span class="risk-pill risk-pill--critical">Critical</span>
```

| Variant      | Light                     | Dark                            | Use                                |
| ------------ | ------------------------- | ------------------------------- | ---------------------------------- |
| `--ok`       | forest text on pale-green | bright-green on dark-green tint | Care plan active, low risk         |
| `--warn`     | burnt-amber on cream      | amber on dark-amber tint        | High utilizer, medium risk         |
| `--danger`   | oxblood-500 on oxblood-50 | oxblood-300 on oxblood-tint     | No care plan, debt flag, high risk |
| `--critical` | white on oxblood-500 fill | white on oxblood-500 fill       | Critical risk band                 |

`.pulse-glow` adds a 2.4s ease-in-out glow ring on the latest danger pill.

### Stat Cell (`StatCell`)

2×2 grid of metric tiles in the active patient rail. Each cell shows a `label-mono-tight` label + a large `numeral` value. `emphasis="danger"` swaps the numeral color to `var(--color-primary)` and bumps weight to 600.

### Timeline (Audit Ledger)

```
.timeline-rail        — vertical hairline gradient on the left
.timeline-marker      — circular dot, 15px, oxblood border
.timeline-marker--latest — filled oxblood with a halo ring
```

Each decision in the ledger is a `<li>` positioned relative to the rail, with the marker absolutely positioned at `left: -24px`.

### EKG Hairline Divider (`.rule-ekg`)

A 1px divider with a fade-in/fade-out gradient — used between sections within the rails so lines feel like they belong on a chart.

### Card Pattern (kumo-styled, parchment-painted)

```
class="p-4 rounded-xl ring ring-kumo-line"
```

Globally repainted by the kumo override block (see below) — all `bg-kumo-*` tokens land on parchment surfaces inside `<main>`. Highlighted cards add `ring-kumo-danger` (oxblood ring).

### Pill Logo (`<PillIcon />`)

Inline SVG capsule, oxblood gradient on the left half, parchment gradient on the right, with a gloss strip and a center seam. Sizes used:

| Location              | Size       | Rotation |
| --------------------- | ---------- | -------- |
| Header masthead       | `w-16 h-8` | `-45deg` |
| Future favicon (TODO) | inline SVG | `-45deg` |

Each instance uses `useId()` for namespaced gradient IDs to avoid DOM collisions.

---

## Animations

| Class            | Effect                           | Duration                              |
| ---------------- | -------------------------------- | ------------------------------------- |
| `anim-fade-up`   | opacity 0 + translateY(14px) → 0 | 0.55s, cubic-bezier(0.2, 0.7, 0.2, 1) |
| `anim-fade-down` | opacity 0 + translateY(-8px) → 0 | 0.4s                                  |
| `anim-scale-in`  | opacity 0 + scale(0.96) → 1      | 0.4s                                  |
| `pulse-glow`     | oxblood box-shadow halo pulse    | 2.4s loop                             |

Stagger classes (`stagger-1` through `stagger-5`) apply increasing `animation-delay` (0.05s → 0.6s) for cascading section reveal on initial paint. The masthead fades down; the rails and chat fade up; the audit-ledger entries fade in sequentially.

---

## Kumo Override Scope

Cloudflare's `kumo` design system ships with a Tailwind-based color token set we override **inside `<main>` only**, so the chat / dashboard pick up parchment + oxblood without touching kumo upstream.

```
main .bg-kumo-elevated   → var(--color-bg)
main .bg-kumo-base       → var(--color-bg-surface)
main .bg-kumo-control    → var(--color-bg-surface)
main .bg-kumo-tint       → var(--color-bg-raised)   (agent bubbles)
main .bg-kumo-fill       → var(--color-bg-raised)
main .bg-kumo-contrast   → var(--color-oxblood-500) (user bubbles)
main .bg-kumo-brand      → var(--color-oxblood-500) (send button)
main .bg-kumo-danger     → var(--color-oxblood-500)
main .text-kumo-default  → var(--color-text)
main .text-kumo-inactive → var(--color-text-muted)
main .text-kumo-danger   → var(--color-oxblood-500) (oxblood-300 dark)
main .text-kumo-success  → forest / mint
main .text-kumo-accent   → var(--color-primary)
main .border-kumo-line   → var(--color-border)
main .border-kumo-accent → var(--color-primary)
main .ring-kumo-line     → var(--color-border)
main .ring-kumo-danger   → var(--color-oxblood-500)
```

Plus Tailwind ad-hoc severity colors (`bg-orange-500`, `bg-yellow-500`) tamed to burnt / ochre tones.

The kumo default chat toolbar (`<header class="bg-kumo-base">` containing the "Agent Starter / AI Chat / MCP / Clear" row) is hidden because the editorial tab bar replaces its function. The kumo chat container's `h-screen` is clamped to `100%` of its flex parent so the rails and chat align at the same baseline.

---

## Dark Mode

Toggled by setting `data-mode="dark"` on `<html>` (persisted to `localStorage`). The same CSS variables flip via the `:root` and `[data-mode="dark"]` selector blocks at the top of `styles.css`.

- Background: parchment → instrument-bg
- Cards: parchment-raised → instrument-raised
- Borders: parchment-border → instrument-border
- Primary text accent: oxblood-500 → oxblood-300

The masthead pill icon + the user chat bubble keep their oxblood-500 fill in dark mode (saturated against the navy reads as a warm focal point).

---

## Spacing & Layout

- Rails: `300px` left, `340px` right (fixed widths, `flex-shrink-0`).
- Card padding: `p-4` to `p-6` depending on density.
- Section padding inside rails: `p-6`.
- Tab bar: `px-6 py-3.5`, `border-b-2` for the active underline.
- `gap-3` for inline metadata, `gap-6` for vertical section spacing.

---

## Data Display Rules

- **Synthea names**: strip numeric suffixes from titles (`p.name.replace(/\d+/g, "")`). Surface the suffix in italic body copy below.
- **Numbers**: always wrap in `.numeral` for tabular figures and IBM Plex Mono.
- **Currency**: short-form for cohort cost (`$130K`, `$3.4M`), full thousands for line items (`$130,458`).
- **Care plan boolean**: render `✓` (active) or `—` (none); apply `emphasis="danger"` when none.
- **Risk score**: always shown as `score / max` (e.g. `8/14`) with the level pill.
- **PRAPARE / SDOH flags**: lowercase prose with an oxblood `✕` glyph leading the line.

---

## File Reference

| File                          | Purpose                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `src/styles.css`              | All theme tokens, animations, utility classes, kumo overrides               |
| `src/AppShell.tsx`            | 3-column shell; Header, PatientPanel, ChatFrame, AuditTrail                 |
| `src/PatientContext.tsx`      | Cross-tab patient state + `useActivePatientData()`                          |
| `src/components/PillIcon.tsx` | Inline oxblood pill SVG with gloss + seam                                   |
| `src/app.tsx`                 | Tab bar, Chat, MCP panel — kumo defaults reskinned via overrides            |
| `src/PatientMetrics.tsx`      | §II tab — single-patient metrics + risk gauge                               |
| `src/RiskDashboard.tsx`       | §III tab — population view, equity + cost panels, expandable rows           |
| `src/server.ts`               | Durable Object agent: tools, system prompt, decisions ledger schema         |
| `index.html`                  | Google Fonts imports (Fraunces, Newsreader, IBM Plex Mono, Share Tech Mono) |
