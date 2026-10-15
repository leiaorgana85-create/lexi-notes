# Lexi Notes

Standalone fast-access personal notes PWA for the Lexi Apps Ecosystem.

## Product boundary
- Lexi Notes owns quick/personal working notes, temporary lists, references and other information that does not belong to a specific Travel workflow.
- `LEXI Notes Data` Google Sheet is the source of truth.
- Lexi Travel Notes remains for static travel-reference material and does not share records with Lexi Notes.
- Do not keep independently editable copies of the same note in both apps.

## App
- GitHub Pages: https://leiaorgana85-create.github.io/lexi-notes/
- Repository: https://github.com/leiaorgana85-create/lexi-notes
- Google Sheet: https://docs.google.com/spreadsheets/d/1JVN3NOkGGAqgeLSpjhyh4woNJw6qJg3v_UA9Jx5IFow/edit
- Apps Script web app: https://script.google.com/macros/s/AKfycbwsZrm-TgtziRbM7AkJ538pmozw4CNsZA_tGApk6Osz-Sa9IXqvAl_SRbeMvdC-LUWK/exec
- Home Screen icon: https://leiaorgana85-create.github.io/lexi-assets/notes-logo.png

The app uses its own private `LEXI_NOTES_API_KEY`, separate from Lexi Spend and Lexi Travel. Never commit that key to GitHub.

## UI
- Dark theme.
- Home opens directly to global search plus separate **Pinned** and **Notes** sections.
- Pinned notes live only in the Pinned section; unpinned notes live in Notes. Each section sorts newest `Updated At` first.
- When notes exist, the **Pinned** and **Notes** headings remain visible even if one section is temporarily empty.
- Each list row keeps title/date on the same line, a one-line preview, and outline Pin / Lock / Delete controls. The row width is constrained to the same content width as the Search box so controls stay on-screen.
- New notes open directly in edit mode with a truly blank title field. The live backend still uses `Untitled Note` as its fallback storage/display value for a blank title, so the PWA deliberately normalizes that backend placeholder back to blank on load/search/unlock.
- Existing notes open in read mode; tapping anywhere in the note content surface enters edit mode automatically, while URLs and toolbar controls remain clickable.
- Read mode also has an explicit outline Edit button before Email as a fallback entry into edit mode.
- Swipe right across the note surface to return to the notes list; do not depend on the iOS screen-edge gesture. If editing, the draft is captured and sync starts in the background.
- Edit mode shows a compact **Save** button at the top right.
- Checklist rows render as clickable outline checkboxes in read mode. Tapping a checkbox flips `[ ]` ↔ `[x]`, updates the note timestamp, and saves/syncs the note without entering edit mode.
- Checklist controls use an enlarged touch target; taps within roughly the first 52 px of a checklist row are treated as checkbox taps rather than tap-to-edit.
- Note-body actions use consistent outline icons for Edit, Email, Share and Delete.
- Formatting tools use matching outline icons for bullets, numbered list, checklist, outdent, indent, undo, redo and date insert.
- The Lexi Notes masthead is intentionally small, with its outline note icon after the **Lexi Notes** text and a smaller Refresh control on the right.
- The floating **+** is an SVG control centered inside its circular button.
- Email uses `mailto:`; Share uses the native Web Share sheet when available.
- There is no user-facing Archive screen. Delete soft-archives the row in the Sheet so accidental deletion is recoverable.

## Responsiveness / write transport
- Typing no longer triggers an Apps Script write after every short pause. Edits stay local while typing and sync when the owner uses Save, Back or swipe-back.
- Unlocked-note edits are queued locally until the backend confirms the save, so the UI does not wait on Apps Script latency.
- Checklist toggles update the read view immediately and sync in the background.
- Pin and Delete update the list optimistically and roll back if the backend rejects the action.
- Search filters the loaded local note index immediately. When a valid session PIN is available, locked-body search can still be enriched from the backend in the background.
- Unlocking a locked note still requires a backend read because the locked body is intentionally not kept in the normal local index.
- `gestures.js` is the iPhone/Home Screen interaction layer for full-surface tap-to-edit and surface swipe-back.
- `ui-fixes.js` owns the forgiving checklist hit area and persistent empty section headings; `ui-fixes.css` contains those touch-target overrides plus list-page width/header refinements.
- `write-transport.js` wraps only Lexi Notes Apps Script POST writes. Version 2 serializes every write for the same note ID so save/delete operations cannot overlap. If an upsert gets an ambiguous Apps Script redirect/404 response, the transport verifies the first request for longer but does **not** immediately resend it; the existing pending-upsert queue can retry later, after the first request has completed. This prevents two concurrent new-note upserts from both missing the row and appending duplicate IDs. Pin/lock/delete/setpin may still use one verified fallback resend because those actions do not create rows.
- The read surface fills the available note viewport, horizontal overflow is suppressed, note-view bottom padding is reduced while the floating New Note button is hidden, and overscroll is contained to reduce the loose/slippery feel on iPhone.

## Backend / Sheet
`NOTES` schema:

`ID | Created At | Updated At | Title | Body | Pinned | Locked | Archived | Sort Order`

The live Apps Script project is bound to `LEXI Notes Data`. `backend.gs` in this repository is the source copy of that backend for review/documentation; changing the GitHub file does **not** update the installed bound Apps Script automatically.

On 2026-10-15, three accidental duplicate Sheet rows created by the client retry race were removed. For each affected ID, the newer archived canonical row was preserved, so the soft-delete audit record remains while the stale active duplicate cannot reappear in the app. The installed bound Apps Script itself was not changed in that repair; duplicate prevention is currently enforced by the PWA write transport.

Script Properties used by the live backend:
- `LEXI_NOTES_API_KEY` — private API key; never commit the value.
- `LEXI_NOTES_PIN_HASH` — SHA-256 hash created when the owner first establishes a note-lock PIN.

## Lock model
- Locking is per-note.
- First lock prompts the owner to establish a PIN of at least 4 characters.
- Normal backend list/search responses redact locked note bodies.
- A locked body is returned only after backend PIN validation.
- The PWA keeps the PIN only in `sessionStorage` for the current session.
- The normal local note-index cache strips locked note bodies.
- This is an **app-access lock, not encryption of the Google Sheet**. Direct Sheet access can still read the underlying Body cells.

## Deployment
Static PWA files live at the repository root and deploy from the `main` branch root through GitHub Pages.

Current status (2026-10-15): the standalone GitHub Pages app is live and authenticated against the dedicated Lexi Notes Apps Script. Full-surface tap-to-edit and surface swipe-back remain in `gestures.js?v=3`. The sectioned-list / blank-title / explicit-Edit / clickable-checklist / compact-Save pass remains in `app.js?v=2` and `styles.css?v=3`. Persistent section headings, forgiving checklist touch zone, and list-page sizing/header refinements are in `ui-fixes.js?v=1` / `ui-fixes.css?v=1`; serialized/idempotent client-side write handling is in `write-transport.js?v=2`; all are cached by service-worker shell v14. The duplicate-ID Sheet repair has been completed and verified. Full create/edit/pin/lock/delete browser/Sheet smoke testing must still pass before the temporary `lexi-travel/notes-app/` copy is removed.
