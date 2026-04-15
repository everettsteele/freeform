# Form Upgrades — Name Field, Reorder, Compact Responses

Date: 2026-04-15
Status: Approved (by user, no further review required before implementation)

## Motivation

A large batch of partner-inquiry forms is about to go out. The current response UI shows only a timestamp per submission, making it impossible to see who responded at a glance. The builder also has no way to reorder fields — awkward when iterating on the form layout.

## Scope

Three surgical changes:

1. A new `name` field type with two modes: "Full name" (single input) or "First + Last" (two inputs).
2. Up/down arrow reorder controls on field cards in the builder.
3. Compact row layout for the responses list, with the submitter's name prominently shown.

Explicitly out of scope: search, filter, sort, pagination, drag-and-drop reorder, response detail routes.

## Design

### 1. `name` field type

**Field object shape:**
```js
{ id, type: 'name', label, mode: 'full' | 'split', required }
```

**Builder:** new "👤 Name" button in the left panel. Field card editor shows a Mode select (`Full name` / `First + Last`). No placeholder input for this type.

**Public form (`form.html`):**
- `mode === 'full'`: one `<input type="text" name="${field.id}">`.
- `mode === 'split'`: two side-by-side inputs named `${field.id}__first` and `${field.id}__last` with "First" / "Last" placeholders.

Submit handler assembles split values into `{ first, last }` before POST.

**Stored data shape (`responses.data_json`):**
- Full: `{ label, type: 'name', value: "Jane Smith" }`
- Split: `{ label, type: 'name', value: { first: "Jane", last: "Smith" } }`

**Submit validation (`src/routes/responses.js`):**
- Full: required check uses truthiness of string.
- Split: required check = both `first` and `last` non-empty (trimmed).

**CSV export:** split mode emits two columns (`${label} - First`, `${label} - Last`); full mode emits one (`${label}`).

### 2. Reorder controls

Each non-divider field card gets two small buttons in the header: **↑** and **↓**. Dividers get them too (useful for sectioning). Buttons swap adjacent array entries and re-render. First card's ↑ is disabled; last card's ↓ is disabled.

### 3. Compact responses list

**Row:** single line — `[Submitter]   [Timestamp] · [▸ view]   [Delete]`. Clicking the row (outside Delete) toggles an inline detail panel below it (the existing `renderResponseFields` output).

**`getSubmitter(fields, data)` helper** — picks a display string in this order:
1. First field with `type === 'name'`. Full mode: trim `value`. Split mode: trim `"${first} ${last}"`. If result is empty, fall through.
2. First field with `type === 'email'` that has a non-empty value.
3. Null → row shows only the timestamp on the left.

**CSS:** new styles for `.resp-row` (flex, 40–48px tall, 1px bottom border, hover tint) replacing the current bordered-card-per-response. Detail panel stays visually tied to its row.

## Data & backwards compatibility

- Existing responses have no `name` field — they cleanly fall through to email, then to timestamp.
- No schema migration needed. `fields_json` and `data_json` absorb new shapes.
- New `mode` key on field objects is additive; old forms continue to work.

## Files touched

- `views/builder.html` — new field button, Name editor (mode select), ↑/↓ handlers.
- `views/form.html` — `renderField` branch for `type === 'name'`; submit assembles split values.
- `views/responses.html` — compact row layout, `getSubmitter` helper, new CSS.
- `src/routes/responses.js` — submit validation for `name` field (both modes); CSV header/value handling for split mode.

## Testing

Manual smoke test (no automated tests exist in the repo):
1. Build a form with a Full Name field and submit → responses list shows the name.
2. Build a form with a Split Name + an Email field; submit both fields → list shows `"First Last"`.
3. Submit split form leaving Last blank on required field → server returns 400.
4. Reorder fields in builder via arrows, save, reload → order persisted.
5. Old form without name/email → responses list shows timestamp-only row.
6. Export CSV with split name → two columns present.
