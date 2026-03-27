# Process Marketplace Meeting Transcript

Process a Teams meeting transcript from the `incoming/` folder. Can be run standalone or triggered automatically when stopping a Marketplace Meeting timer.

> **IMPORTANT:** Before performing any date/time actions, check the current date/time (e.g., `date`) to ensure you are using real time, not training data.

## Arguments

`$ARGUMENTS`

## Folder Structure

```
sme-mart/.claude/notes/meetings/
├── incoming/          ← NEW transcript only (single .docx), empty after processing
├── processed/         ← date-prefixed .docx original + .txt extraction
└── *.md               ← completed summarizer output only
```

**Base path:** `~/Projects/w3geekery/zerobias-org-forks/app/package/w3geekery/sme-mart/.claude/notes/meetings`

## Flow

1. Check `incoming/` for a .docx file
2. If empty → "Please copy your transcript to `sme-mart/.claude/notes/meetings/incoming/` then run `/tt:transcript`"
3. If found:
   a. Extract text — try `textutil -convert txt -stdout incoming/<file>.docx`. If that fails (format error), use Python zipfile extraction:
   ```python
   import zipfile, xml.etree.ElementTree as ET
   doc = zipfile.ZipFile('path/to/file.docx')
   tree = ET.parse(doc.open('word/document.xml'))
   # extract text from w:t elements
   ```
   b. Save text to `processed/YYYY-MM-DD-marketplace-meeting-transcript.txt`
   c. Move .docx to `processed/YYYY-MM-DD-marketplace-meeting-transcript.docx`
   d. Read the meeting summarizer skill: `sme-mart/.claude/skills/sme-mart-meeting-summarizer.md` (and its template)
   e. Process transcript through summarizer
   f. Save summary to `meetings/YYYY-MM-DD-marketplace.md` — include `**Time:** HH:MM AM – HH:MM PM PT` in the header (from the timer's start/end times)
   g. Call `mcp__tt__update_timer` to add summary highlights to the Marketplace Meeting timer entry — format as scannable markdown with a heading and bullet points:
   ```
   ### Meeting w/ Brian
   - Topic 1 summary
   - Topic 2 summary
   - Key decision or action item
   ```
   h. Present action items and offer next steps

## Date Detection

The meeting date comes from (in order):
1. The .docx file's modification date
2. Today's date if stopping a running timer
3. Ask Clark if ambiguous

## After Processing

- `incoming/` must be **empty** (docx moved to processed)
- Summary `.md` file exists in meetings folder
- Timer notes updated with highlights
- Action items presented to Clark
