# Discus Smoke Test

Manual end-to-end verification procedure for the Discus duplicate-file finder.

---

## Prerequisites

1. **Python 3.10+**
   ```
   pip install -r sidecar/requirements.txt
   ```

2. **Node.js 20+**
   ```
   npm install
   ```

3. **AI suggestions** (optional)
   Set the `DISCUS` environment variable to a valid OpenAI API key before starting the app:
   ```
   # Windows (PowerShell)
   $env:DISCUS = "sk-..."

   # Windows (cmd)
   set DISCUS=sk-...
   ```
   If `DISCUS` is not set, AI suggestion features are disabled and a warning banner is shown.

---

## Start the App

From the worktree root:

```
npm start
```

**Expected:**
- An Electron window opens titled "Discus".
- The GPU badge in the header shows either **"CPU Mode"** or **"Warp GPU Active"** depending on hardware.
- No crash dialogs or error popups appear on launch.

---

## Scanner Panel Test

1. Locate the **Scanner** panel (left side or top tab).
2. Open the **Drive** dropdown — it should list available drives (e.g., `C:\`).
3. Select `C:\` (or any accessible drive).
4. Click **Start Scan**.

**Expected:**
- Progress bar advances as files are scanned.
- "Current path" label updates to show the directory being scanned.
- Elapsed timer counts upward in seconds.
- When the scan completes, the **Results** tab becomes active automatically and duplicate groups are listed.

---

## Results Panel Test

1. After the scan, confirm you are on the **Results** tab.
2. Verify at least one duplicate group appears in the list.
   - Windows system directories typically contain many duplicates; if no results appear on a partial scan, let the scan run longer or scan a directory known to contain duplicates.
3. Click **Select All Suggested** — pre-checked checkboxes should appear on the recommended files within each group.
4. Manually select at least one file by checking its checkbox.
5. Click **Move Selected to Review**.

**Expected:**
- The selected file(s) disappear from the Results list.
- A confirmation or status message indicates the files were moved to the review folder.

---

## Review Folder Panel Test

1. Click the **Review Folder** tab.
2. Verify the file(s) moved in the previous step appear in the list with their original paths shown.
3. Click **Restore** on one of the listed files.

**Expected:**
- The file is restored to its original location on disk.
- The row disappears from the Review Folder list.

---

## AI Suggestions Test

### With `DISCUS` set

1. Start the app with a valid `DISCUS` OpenAI API key (see Prerequisites).
2. Run a scan and navigate to the Results tab.
3. Expand a duplicate group.

**Expected:** A suggestion callout or annotation appears within the group, showing AI-generated text recommending which file to keep.

### Without `DISCUS` set

1. Start the app without the `DISCUS` environment variable.

**Expected:** A warning banner appears at the top of the window indicating that AI suggestions are unavailable. The rest of the app functions normally.

---

## Verify No Crashes

1. Close the Electron window using the window close button (X).

**Expected:**
- No crash dialog appears.
- The process exits cleanly (verify in Task Manager or process list that no `electron` or `python` sidecar processes remain orphaned).

---

## Pass Criteria

All steps above produce the expected results with no unhandled exceptions, crash dialogs, or frozen UI.
