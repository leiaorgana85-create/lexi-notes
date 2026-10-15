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
- Home opens directly to global search + notes list.
- Pinned notes sort first.
- Pin and Lock controls live only on each note card in the notes list.
- Existing notes open in read mode; tapping the note body enters edit mode automatically, while URLs remain clickable.
- New notes open directly in edit mode.
- Edit mode shows **Save** at the top right.
- Formatting tools: bullets, numbered list, checklist, indent/outdent, undo/redo and date insert.
- Email uses `mailto:`; Share uses the native Web Share sheet when available.
- There is no user-facing Archive screen. Delete soft-archives the row in the Sheet so accidental deletion is recoverable.

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

Current status (2026-10-15): the standalone GitHub Pages app is live and the owner has successfully authenticated it against the dedicated Lexi Notes Apps Script using the current private API key. Source, backend and Sheet remain aligned to the 9-column schema. The list-only Pin/Lock + tap-body-to-edit + top-right Save UI refinement and the dedicated `notes-logo.png` icon are deployed in the current source. Full create/edit/pin/lock/delete browser/Sheet smoke testing must still pass before the temporary `lexi-travel/notes-app/` copy is removed.
