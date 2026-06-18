# Process Meeting Transcript (Teams or Slack Huddle)

Process a meeting transcript from the `incoming/` folder — supports MS Teams `.docx` and Slack Huddle (`.txt`/`.md`/`.vtt`). Can be run standalone or triggered automatically when stopping a Marketplace Meeting timer.

## Source Detection

The `$ARGUMENTS` may contain a source hint: `teams` or `slack`. If absent, auto-detect from the file in `incoming/`:

| File found | Source | Summarizer |
|---|---|---|
| `*.docx` | Teams | `sme-mart-meeting-summarizer.md` |
| `*.txt`, `*.md`, `*.vtt` | Slack huddle | `sme-mart-slack-huddle-summarizer.md` |

Explicit `$ARGUMENTS` override auto-detection.

> **IMPORTANT:** Before performing any date/time actions, check the current date/time (e.g., `date`) to ensure you are using real time, not training data.

## Arguments

`$ARGUMENTS`

## Folder Structure

```
sme-mart/.planning/notes/meetings/
├── incoming/          ← NEW transcript only (single .docx), empty after processing
├── processed/         ← date-prefixed .docx original + .txt extraction
└── *.md               ← completed summarizer output only
```

**Base path:** `~/Projects/w3geekery/zerobias-org-forks/app/package/w3geekery/sme-mart/.planning/notes/meetings`

## Flow

1. Check `incoming/` for a transcript file (`.docx`, `.txt`, `.md`, or `.vtt`). **Ignore `.gitkeep`** — it's intentional (keeps the folder tracked in git).
2. If no transcript found → "Please copy your transcript to `sme-mart/.planning/notes/meetings/incoming/` then run `/tt:transcript`"
3. If found — branch on source:

### 3A. Teams (`.docx`)

   Extract text. **Teams `.docx` files commonly fail `textutil`** with `"The file isn't in the correct format."` — this is expected, not an error in your environment. Try `textutil` first, then fall back to Python zipfile.

   Filenames from Teams usually contain spaces (e.g. `Marketplace--Meeting Transcript.docx`) — always double-quote paths.

   **Step 1 — try textutil:**
   ```bash
   cd <meetings-base-path>
   textutil -convert txt -stdout "incoming/<file>.docx" > "processed/YYYY-MM-DD-marketplace-meeting-transcript.txt" 2>&1
   ```
   Verify: `head -c 200 processed/YYYY-MM-DD-...-transcript.txt` — if the output starts with `Error reading ...` or the file is suspiciously small (e.g. 1 line), textutil failed — proceed to Step 2.

   **Step 2 — Python zipfile fallback** (writes paragraph-per-line, skipping empty paragraphs):
   ```bash
   cd <meetings-base-path>
   python3 -c "
   import zipfile, xml.etree.ElementTree as ET
   NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
   with zipfile.ZipFile('incoming/<file>.docx') as z:
       tree = ET.parse(z.open('word/document.xml'))
   lines = []
   for p in tree.iter(f'{NS}p'):
       texts = [t.text for t in p.iter(f'{NS}t') if t.text]
       line = ''.join(texts)
       if line.strip():
           lines.append(line)
   out = '\n'.join(lines)
   with open('processed/YYYY-MM-DD-marketplace-meeting-transcript.txt', 'w') as f:
       f.write(out)
   print(f'wrote {len(lines)} lines, {len(out)} chars')
   "
   ```
   Verify: `wc -l` should return more than 10 lines for a real meeting.

   `.txt` is already written in place by the extraction above. Move `.docx` to `processed/YYYY-MM-DD-marketplace-meeting-transcript.docx`, then proceed to **Step 4 (Summarize)** below with summarizer = `sme-mart-meeting-summarizer.md`.

### 3B. Slack Huddle (`.txt` / `.md` / `.vtt`)

   No docx extraction needed.

   **`.txt` or `.md`** — copy directly to `processed/YYYY-MM-DD-slack-huddle-transcript.{ext}` (preserve extension). No transformation.

   **`.vtt`** — strip WebVTT cue numbers and timestamp lines, keep speaker-tagged content:
   ```bash
   cd <meetings-base-path>
   python3 -c "
   import re
   with open('incoming/<file>.vtt') as f:
       raw = f.read()
   # drop WEBVTT header, cue numbers, timestamp lines, blank lines between cues
   lines = []
   for line in raw.splitlines():
       s = line.strip()
       if not s or s == 'WEBVTT': continue
       if re.match(r'^\d+$', s): continue
       if '-->' in s: continue
       lines.append(s)
   with open('processed/YYYY-MM-DD-slack-huddle-transcript.txt', 'w') as f:
       f.write('\n'.join(lines))
   print(f'wrote {len(lines)} lines')
   "
   ```

   Move the original to `processed/YYYY-MM-DD-slack-huddle-transcript.<orig-ext>`, then proceed to **Step 4 (Summarize)** below with summarizer = `sme-mart-slack-huddle-summarizer.md`.

## Step 4 — Summarize (both sources)

   a. Read the selected summarizer skill (and its base template if referenced)
   b. Process transcript through summarizer
   c. Save summary:
      - Teams → `meetings/YYYY-MM-DD-marketplace.md`
      - Slack → `meetings/YYYY-MM-DD-slack-huddle-<topic-slug>.md`

      Include `**Time:** HH:MM AM – HH:MM PM PT` in the header (from the timer's start/end times) and `**Source:** Teams` or `**Source:** Slack Huddle`.
   d. Call `mcp__tt__update_timer` to add highlights — format with a source-specific heading so `/tt:backfill` can distinguish them:

      **Teams:**
      ```
      ### Meeting w/ Brian
      - Topic 1 summary
      - Topic 2 summary
      - Key decision or action item
      ```

      **Slack Huddle:**
      ```
      ### Slack Huddle w/ <primary participant(s)>
      - Decision or topic 1
      - Decision or topic 2
      - Action item
      ```
   e. Present action items and offer next steps

## Date Detection

The meeting date comes from (in order):
1. The transcript file's modification date
2. Today's date if stopping a running timer
3. Ask Clark if ambiguous

## After Processing

- `incoming/` must be **empty** except for `.gitkeep` (the real transcript is moved to `processed/`)
- Summary `.md` file exists in meetings folder
- Timer notes updated with highlights
- Action items presented to Clark
