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

The app uses its own private `LEXI_NOTES_API_KEY`, separate from Lexi Spend and Lexi Travel. Never commit that key to GitHub.

## UI
- Dark theme.
- Home opens directly to global search + notes list.
- Pinned notes sort first.
- New note opens directly in edit mode.
- Existing notes open in read mode so URLs are clickable automatically.
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
Static PWA files live at the repository root and are intended to deploy from the `main` branch root through GitHub Pages.

Current status (2026-10-15): the standalone repository contains the verified PWA and backend source, and the dedicated Apps Script web app is deployed and wired into `app.js`. GitHub Pages activation and end-to-end browser/Sheet smoke testing must pass before the standalone cutover is considered fully verified. The temporary `lexi-travel/notes-app/` copy should remain until that cutover is confirmed.
