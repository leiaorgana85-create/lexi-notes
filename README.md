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
- Home opens directly to global search + compact notes list.
- Pinned notes sort first.
- Each list row keeps title/date on the same line, a one-line preview, and outline Pin / Lock / Delete controls.
- Existing notes open in read mode; tapping the note body enters edit mode automatically, while URLs remain clickable.
- Swipe right across the note surface to return to the notes list; do not depend on the iOS screen-edge gesture. If editing, the draft is captured and sync starts in the background.
- New notes open directly in edit mode.
- Edit mode shows **Save** at the top right.
- Note-body actions use consistent outline icons for Email, Share and Delete.
- Formatting tools use matching outline icons for bullets, numbered list, checklist, outdent, indent, undo, redo and date insert.
- The floating **+** is an SVG control centered inside its circular button.
- Email uses `mailto:`; Share uses the native Web Share sheet when available.
- There is no user-facing Archive screen. Delete soft-archives the row in the Sheet so accidental deletion is recoverable.

## Responsiveness
- Typing no longer triggers an Apps Script write after every short pause. Edits stay local while typing and sync when the owner uses Save, Back or swipe-back.
- Unlocked-note edits are queued locally until the backend confirms the save, so the UI does not wait on Apps Script latency.
- Pin and Delete update the list optimistically and roll back if the backend rejects the action.
- Search filters the loaded local note index immediately. When a valid session PIN is available, locked-body search can still be enriched from the backend in the background.
- Unlocking a locked note still requires a backend read because the locked body is intentionally not kept in the normal local index.
- `gestures.js` is the single iPhone/Home Screen interaction layer for note-body tap-to-edit and surface swipe-back. It uses Pointer Events and suppresses the retired edge-only touch handlers before they can compete.

## Backend / Sheet
`NOTES` schema:

`ID | Created At | Updated At | Title | Body | Pinned | Locked | Archived | Sort Order`

The live Apps Script project is bound to `LEXI Notes Data`. `backend.gs` in this repository is the source copy of that backend for review/documentation; changing the GitHub file does **not** update the installed bound Apps Script automatically.

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

Current status (2026-10-15): the standalone GitHub Pages app is live and authenticated against the dedicated Lexi Notes Apps Script. The compact-list / outline-icon / explicit-save responsiveness pass is in the current source. Note-body tap-to-edit and surface swipe-back are consolidated in `gestures.js` and cached by service-worker shell v8. Full create/edit/pin/lock/delete browser/Sheet smoke testing must still pass before the temporary `lexi-travel/notes-app/` copy is removed.
