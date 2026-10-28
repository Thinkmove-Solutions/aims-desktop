# AIMS Desktop — Install Guide

AIMS Desktop is a small background agent that runs on any always-on Windows, macOS, or Linux PC
on the restaurant's local network. It relays print jobs from the AIMS cloud app to your LAN
printers and enables native OS features (notifications, silent printing).

---

## Requirements

- The PC must be on the **same WiFi/LAN** as your receipt and kitchen printers
- The PC should stay **powered on** during trading hours (or always-on)
- Internet access is required (to reach the AIMS backend via WebSocket)

---

## Step 1 — Download the installer

Go to the [Releases page](https://github.com/thinkmovesolutions/aims-desktop/releases/latest)
and download the file for your operating system:

| OS | File | Notes |
|---|---|---|
| Windows | `aims-desktop-Setup.exe` | Standard Windows installer |
| macOS | `aims-desktop.dmg` | Drag to Applications |
| Linux (Debian/Ubuntu) | `aims-desktop.deb` | `sudo dpkg -i aims-desktop.deb` |

---

## Step 2 — Install

**Windows:** Run `aims-desktop-Setup.exe`. It installs silently and launches automatically.

**macOS:** Open the `.dmg`, drag **AIMS Desktop** to Applications, then open it from Applications.
macOS may show a security prompt on first open — go to **System Settings → Privacy & Security** and
click **Open Anyway**.

**Linux:** `sudo dpkg -i aims-desktop.deb` then run `aims-desktop` from your application menu or
terminal.

---

## Step 3 — Get the agent token from AIMS

1. Open [AIMS Settings](https://app.aaimsoft.com) in your browser
2. Go to **Settings → Printers**
3. Under **Local Print Agent**, click **Pair a New Agent**
4. A token dialog appears — **do not close it yet**

---

## Step 4 — Connect AIMS Desktop

**If AIMS Desktop is running on the same PC as your browser:**

The token dialog will show a **"Connect to AIMS Desktop"** button automatically.
Click it — AIMS Desktop is configured instantly. Done.

**If AIMS Desktop is running on a different PC (headless shop PC, no browser):**

1. Click **Download agent-config.json** in the token dialog
2. Copy the downloaded `agent-config.json` to the shop PC (USB, network share, etc.)
3. On the shop PC, open AIMS Desktop from the system tray (bottom-right on Windows,
   top-right on macOS)
4. Click **Settings**, go to the **Setup** tab
5. Paste the contents of `agent-config.json` into the text field and click **Save**

---

## Step 5 — Verify

- The AIMS Desktop tray icon turns **green** when connected
- Back in AIMS Settings, the **Local Print Agent** card shows **Connected**
- Send a test print from AIMS to confirm jobs reach your printer

---

## Auto-start

AIMS Desktop starts automatically with the operating system by default. To disable:
open Settings from the tray icon → **Settings** tab → toggle **Start on login** off.

---

## Auto-update

AIMS Desktop checks for updates hourly. Updates install silently in the background and
apply on the next restart of the app.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Tray icon stays red / orange | Check internet connection; check that the AIMS backend is reachable |
| "Connect to AIMS Desktop" button not visible | AIMS Desktop is not running on this PC — start it first |
| Print jobs arrive but nothing prints | Verify the printer IP in AIMS Settings → Printers matches the actual printer IP |
| Token rejected after re-pairing | Re-download `agent-config.json` and re-paste in AIMS Desktop Settings |

Debug log location: `/tmp/aims-electron-debug.log` (macOS/Linux) or `%TEMP%\aims-electron-debug.log` (Windows)
