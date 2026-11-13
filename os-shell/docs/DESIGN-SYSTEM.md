# Design system — Deep Ocean Glass 2.0

All tokens live in `src/app/globals.css` (`:root` for light, `.dark` for dark). Components read tokens; avoid hard-coded colours in new code.

## Principles
1. **Glass for chrome, solid for work.** Wallpaper, menu bar, dock, widgets and dialogs use translucency. Window bodies are 96% opaque; tables, marks grids and side panels are solid (`--card-solid`). Do not add blur to dense data surfaces.
2. **One accent.** `--accent` = the school colour (or the app colour inside its window). Status colours are semantic only.
3. **Never colour alone.** Every status has an icon and/or text (state chips, `.status`, priority dots carry screen-reader text).
4. **Quiet motion.** Spring window open/minimise, dock magnification, 0.12–0.18 s hovers. All of it is disabled by `prefers-reduced-motion`.

## Typography
| Token | Size | Use |
|---|---|---|
| `--fs-title` / `.app-title` | 26 px (22 px on phones) | App page titles (Action Center) |
| `--fs-h` / `.section-title` | 18 px | Section headings |
| `--fs-body` | 14.5 px (Bangla 15.5 px) | Body, tables |
| `--fs-small` | 13 px | Secondary text |
| `--fs-label` / `.label` | 12.5 px | Form labels |

- Latin: **Montserrat Variable**. Bangla: **Hind Siliguri** (UI), **Noto Serif Bengali** (`.serif-bn` headings). Fonts are bundled (no network).
- Bangla body uses line-height 1.7 and no letter spacing.
- Numbers in tables and counts use tabular numerals (`.num`, `.table td`).

## Spacing, radius, size
- Spacing: `--sp-1` 4 px … `--sp-8` 32 px (4 px grid).
- Radius: `--r-sm` 8, `--r-md` 12, `--r-lg` 16, `--r-xl` 20.
- Controls: `--h-control` 40 px (buttons, inputs, selects); `--h-control-sm` 32 px (`.btn-sm`, toolbars in dense tables). Icon buttons are square at the same heights. Menu-bar buttons are 26 px (desktop-only chrome).
- Table rows ≈ 40 px; marks grid rows stay compact (34 px) for data entry.

## Elevation
`--elev-1` (cards, panels) · `--elev-2` (popovers) · `--elev-3` (dialogs, windows). Windows add a stronger shadow when focused (`.win-focus`); inactive windows show grey traffic lights and a dimmer title.

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | #0c2233 | #e6f0f7 | Primary text |
| `--ink-2` | #3d586c | #a9c0d0 | Secondary text |
| `--ink-3` | #557286 | #8ea8ba | Tertiary text (≈4.5:1 on panels) |
| `--ok` | #1f7a4d | #5fc59a | Success / verified |
| `--warn` | #9a5b00 | #f5b84a | Warning / needs action |
| `--danger` | #b42318 | #f97066 | Errors / urgent |
| `--info` | #1d63b8 | #6aa8f0 | In progress |

## Components
- Buttons: `.btn`, `.btn-primary`, `.btn-danger`, `.btn-ghost`, `.btn-icon`, `.btn-sm`, `.btn-lg`.
- Segmented control: `.seg` with `role="tab"` + `aria-selected`.
- Status pill: `.status` + `status-ok | warn | danger | info | muted`.
- Priority dot: `.prio` + `prio-high | medium | low` (always paired with `.sr-only` text).
- Count badge: `.count-badge`.
- List row: `.list-row` (Action Center).
- Sticky table column: `.sticky-col` on the first `th`/`td`.
- Dialogs: `Modal` / `Drawer` in `src/components/ui.tsx` (Radix Dialog: focus trap, Esc to close).
