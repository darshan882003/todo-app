# Today — Daily Goals App

A beautiful, offline-first daily to-do and goals tracker that runs entirely on your Android phone via Termux.

## Features

- **Start screen** with personalized greeting and daily summary
- **Add tasks** one by one or in bulk (strips bullets/numbers)
- **Checkboxes** with satisfying animations
- **Daily score ring** with percentage and motivational messages
- **7-day history** with visual bars
- **Routine goals** — default daily goals with repeat rules (daily, weekdays, weekends, custom)
- **Timeline view** — vertical day schedule with "now" line
- **Categories** — organize goals with colored tags
- **Priorities** — low, medium, high with weighted scoring
- **Subtasks** — break goals into smaller steps
- **Notes** — add context to each goal
- **PDF reports** — generate printable progress reports for any date range
- **Notifications** — daily reminders, time's up check-ins with action buttons (Done / Extend / Skip)
- **PIN lock** — 6-digit PIN with Web Crypto API (PBKDF2-HMAC-SHA-256)
- **Auto-lock** — locks after 1 minute in background (configurable)
- **Themes** — light, dark, auto (system preference)
- **Badges** — earn achievements for streaks and milestones
- **Backup/Restore** — export/import JSON to Downloads folder
- **PWA** — install to home screen, works offline

## Requirements

- Android phone with Chrome
- Termux (from F-Droid)
- Python (`pkg install python`)
- Git (`pkg install git`)

## Quick Start (Phone)

```bash
# In Termux
cd ~
git clone https://github.com/darshan882003/todo-app.git
cd todo-app
python -m http.server 8000 --bind 127.0.0.1
```

Open Chrome and go to `http://127.0.0.1:8000`

## Updating

**On ThinkPad (Windows):**
```cmd
cd "C:\Users\Prajwal PK\OneDrive\Desktop\todo-app"
# Replace files, then:
git add -A
git commit -m "your message"
git push
```

**On Phone (Termux - second session):**
```bash
cd ~/todo-app
git pull
# Then pull-to-refresh in Chrome (sometimes twice)
```

## Project Structure

```
todo-app/
├── index.html          # Main layout
├── sw.js               # Service worker (must stay in root)
├── manifest.json       # PWA manifest
├── css/
│   ├── base.css        # Design tokens, reset
│   ├── components.css  # All component styles
│   ├── animations.css  # Animations & transitions
│   └── print.css       # Print/PDF styles
├── js/
│   ├── app.js          # Main entry point
│   ├── db.js           # IndexedDB wrapper + migration
│   ├── crypto.js       # PIN hashing (PBKDF2)
│   ├── lock.js         # PIN lock screen & logic
│   ├── tasks.js        # Task CRUD
│   ├── score.js        # Score calculations
│   ├── notifications.js # Notification system
│   ├── routine.js      # Default daily goals
│   ├── timeline.js     # Timeline view
│   ├── categories.js   # Categories/tags
│   ├── badges.js       # Achievements
│   ├── backup.js       # Export/import
│   └── report.js       # PDF reports
└── assets/icons/       # PWA icons
```

## Data Storage

- Uses **IndexedDB** (with automatic migration from localStorage)
- All data stays on your phone — no cloud, no accounts
- Backup regularly using the Backup page

## Security

- PIN is **never stored** — only a PBKDF2 hash (600,000 iterations)
- Brute-force protection: escalating lockouts after 5 failed attempts
- No recovery — forgotten PIN = reset app (data lost unless backed up)
- `crypto.subtle` works on `localhost` (secure context)

## Customization

Edit `css/base.css` to change design tokens:
```css
:root {
  --mint: #5eead4;
  --violet: #8b7cff;
  --amber: #ffc86b;
  --rose: #ff7a9c;
  /* ... */
}
```

## License

MIT — free for personal use.