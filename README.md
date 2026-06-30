# Discus

Discus is an Electron desktop application for finding and managing duplicate files on Windows. It scans drives or directories, groups duplicate files by content hash, and lets you move duplicates to a review folder before permanently deleting them. An optional AI suggestions feature (powered by OpenAI) recommends which copy to keep within each duplicate group.

## Features

- Fast file scanner with real-time progress display
- Content-based duplicate detection (hash comparison)
- GPU-accelerated scanning when Warp is available, CPU fallback otherwise
- Review folder workflow — move files out of the way, restore if needed
- AI-powered keep/delete suggestions (requires OpenAI API key)

## Getting Started

### Prerequisites

- **Node.js 20+**
- **Python 3.10+**
- (Optional) An OpenAI API key for AI suggestions

### Install

```
npm install
pip install -r sidecar/requirements.txt
```

### Run

```
npm start
```

Set the `DISCUS` environment variable to your OpenAI API key before starting if you want AI suggestions:

```powershell
$env:DISCUS = "sk-..."
npm start
```

### Verify

See [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md) for the full manual smoke test procedure to verify all core flows work end-to-end.
