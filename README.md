<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="printer-use" width="560">
  </picture>
  <br>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/tagline-dark.svg">
    <img src="assets/tagline-light.svg" alt="Let your agent use your printer." width="520">
  </picture>
</div>

---

<p>
  <a href="#use-it-with-your-agent-mcp"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/button-start-dark.svg"><img src="assets/button-start-light.svg" alt="Quick start" height="40" align="top"></picture></a>
  <a href="#cli"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/button-cli-dark.svg"><img src="assets/button-cli-light.svg" alt="CLI" height="40" align="top"></picture></a>
  <a href="#desktop-app"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/button-app-dark.svg"><img src="assets/button-app-light.svg" alt="Desktop app" height="40" align="top"></picture></a>
  <a href="#what-it-does"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/callout-dark.svg"><img src="assets/callout-light.svg" alt="Nothing prints or changes until you say yes." height="40" align="top"></picture></a>
</p>

---

**Printer setup, repair and printing for any AI agent, with guardrails.**

Adding a printer, picking the right driver and working out why it says "stopped" is where people get stuck, and where agents guess. printer-use gives your agent tools that get it right, and makes sure nothing prints or changes without you saying yes.

Use it from Claude, Codex or any agent as an **MCP server**, from a terminal as a **CLI**, or as a **desktop app**.

```bash
$ printer-use fix Canon_PIXMA_G3000
✓ Resumed the printer (cupsenable)

Needs a person:
  • Out of paper

Now: idle, 0 job(s) queued.
```

## What it does

- **Sets up printers properly.** Give it an IP address and it checks which protocol the printer actually speaks. It only uses driverless IPP when the printer supports it, and otherwise finds the matching vendor driver. A common agent mistake is forcing IPP on printers that don't speak it.
- **Fixes what software can fix.** It resumes stopped printers, turns job acceptance back on and clears stuck jobs. Problems a person has to deal with, like paper, ink, jams or a printer that's off, it reports in plain English.
- **Prints exactly what was asked.** Options come from a fixed list (copies, double-sided, color, quality, orientation, paper size, pages, pages per sheet, fit, collate). Anything invalid is rejected, not guessed at. The command is built in code and run without a shell.
- **Asks first.** Printing, adding a printer and fixes always show the exact command and wait for a yes. Agents get a separate preview step.

## Use it with your agent (MCP)

```bash
git clone https://github.com/october-dev/printer-use.git
cd printer-use && npm install && npm run build:cli && npm link
```

**Claude Code**

```bash
claude mcp add printer-use -- printer-use mcp
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.printer-use]
command = "printer-use"
args = ["mcp"]
```

**Claude desktop app** (`claude_desktop_config.json`)

```json
{ "mcpServers": { "printer-use": { "command": "printer-use", "args": ["mcp"] } } }
```

Then just ask: *"set up the printer at 192.168.1.20"*, *"why won't my printer print?"*, *"print this double-sided."*

| Tool | Changes anything? | What it does |
| --- | --- | --- |
| `list_printers` | No | Printers on this computer, their state and the default |
| `list_jobs` | No | Print jobs that haven't finished |
| `discover_printers` | No | Printers on the network, including ones not set up yet |
| `diagnose_printer` | No | Reachability, error reasons in plain English, queue depth |
| `plan_printer_setup` | No | The right protocol, driver and exact `lpadmin` command for a printer's IP |
| `preview_print` | No | The exact `lp` command for a job |
| `set_up_printer` | Yes | Adds the printer from the plan |
| `fix_printer` | Yes | Resumes, re-enables, optionally clears stuck jobs |
| `print_file` | Yes | Prints |
| `print_test_page` | Yes | Prints a one-page test sheet |
| `cancel_job` | Yes | Cancels a job |
| `set_default_printer` | Yes | Sets your default printer |

Tools that change something are marked destructive, so your agent app asks you before running them.

## CLI

The same steps in a terminal. After `npm link` above:

```bash
printer-use setup 192.168.1.20 --model "Canon G3000"   # add a printer with the right driver
printer-use fix Canon_PIXMA_G3000 --clear-queue        # resume, re-enable, clear stuck jobs
printer-use diagnose Canon_PIXMA_G3000                 # what's wrong, in plain English
printer-use print report.pdf --copies 2 --duplex --mono --pages 1-3
printer-use print report.pdf "2 copies, double-sided, black and white"
```

| Command | What it does |
| --- | --- |
| `print <file...> [options]` | Print with explicit options |
| `print <file...> "request"` | Describe the job; your AI engine picks the options |
| `setup <ip-or-host>` | Add a network printer with the right protocol and driver |
| `fix <printer>` | Apply software fixes and report what a person must fix |
| `diagnose <printer>` | Reachability, error reasons, queue depth |
| `test-page <printer>` | Print a one-page test sheet |
| `printers` / `jobs` | List printers / active jobs |
| `cancel <job-id>` | Cancel a job |
| `default <printer>` | Set your default printer (per user, no `sudo`) |
| `discover` | Find printers on the network |
| `engines` | Show which AI engines are installed |
| `mcp` | Run as an MCP server |

**Print options:** `--copies <n>`, `--duplex` / `--duplex-short`, `--mono` / `--color`, `--quality draft|normal|high`, `--landscape`, `--media A4|Letter|…`, `--pages 1-3,7`, `--per-sheet 1|2|4|6|9|16`, `--fit`, `--collate`.

**Everywhere:** `-p, --printer`, `-n, --dry-run` (show the command, change nothing), `-y, --yes` (don't ask), `--json` (structured output). In `--json` mode without `--yes`, printer-use refuses to act and returns the plan instead.

A plain-English request (`print report.pdf "4 per page, landscape"`) goes to the AI CLI you already have (Claude Code, Codex or Grok, or set `$PRINTER_USE_ENGINE`). Flags you add win over the engine's reading.

<p align="center">
  <img src="docs/studio-demo.png" width="90%" alt="printer-use desktop app: chat on the right, visual printer stage on the left" />
</p>

## Desktop app

For people who would rather click than type: a chat column on the right and an animated printer stage showing your document, the settings and live printer state.

```bash
npm install      # installs deps and downloads the Electron runtime
npm run dev      # launches the app with hot reload
```

When you run a job, the sheet feeds in and the printed page **emerges from the front slot, revealing its content top first**, the way a real printer lays down ink. The animation is hand-built with framer-motion and an SVG slot clip, and it follows the real job status rather than a canned playback (see `src/renderer/src/components/PrinterScene.tsx`). Native macOS vibrancy, SF Pro, light and dark.

<p align="center">
  <img src="docs/anim-printing.png" width="49%" alt="Printing: page emerging from the slot" />
  <img src="docs/anim-done.png" width="49%" alt="Done: page ejected into the tray" />
</p>

- **Onboarding** detects installed engines (`claude`, `codex`, `grok`) on your `PATH`, or lets you add any custom CLI.
- **Chat**: attach a file, describe the job, and get back a summary, the exact `lp` line and a Run button.
- **Printer switcher** in the toolbar, which also sets your default.
- **Add a printer** through Bonjour/mDNS discovery for AirPrint devices, or by IP for driver-only printers.
- **Job queue** across all printers, with cancel.

## Why this design

Printing is a place where "the AI just did something" is not good enough — a wrong option
wastes paper, ink, and time. So the trust model is deliberate:

```
natural language  →  AI engine  →  structured options (JSON)  →  deterministic lp command  →  you approve  →  print
```

- The AI is only allowed to produce a **whitelisted set of options** (copies, sides,
  color, quality, media, page ranges, pages-per-sheet, collate, orientation, fit-to-page).
- printer-use **deterministically** maps those to an `lp` invocation — raw model text is never
  executed, and unknown fields are dropped with a warning.
- The **exact command is shown** before it runs, e.g.:

  ```
  lp -d Canon_PIXMA_G3000 -n 2 -o sides=two-sided-long-edge -o print-color-mode=monochrome -o page-ranges=1-3 report.pdf
  ```

- Every command is run with an explicit `argv` array (never a shell string), so there is
  no command-injection surface.

## How printing works (macOS / CUPS)

Everything routes through CUPS, the standard macOS print system:

| Action            | Command                                                        |
| ----------------- | -------------------------------------------------------------- |
| Discover / status | `lpstat -l -p`, `lpstat -v`, `lpstat -a`, `lpstat -d`          |
| Network discovery | `dns-sd -B _ipp._tcp` (and `_ipps`, `_printer`, `_pdl-datastream`) |
| Submit a job      | `lp -d <printer> -n <copies> -o <opts…> <file>`                |
| Job queue         | `lpstat -W not-completed -o`                                   |
| Cancel a job      | `cancel <printer>-<job>`                                       |
| Set default       | `lpoptions -d <printer>` (per-user, no `sudo`)                 |
| Add a queue       | `lpadmin -p <name> -E -v <uri> …`                              |

## Connect & diagnose

<p align="center">
  <img src="docs/connect.png" width="49%" alt="Connect a printer — auto-scan + add by IP" />
  <img src="docs/diagnostics.png" width="49%" alt="Diagnostics — reachability, issues, AI troubleshooting, quick fixes" />
</p>

- **Connect** — auto-scans the network (Bonjour/mDNS), resolves each device's model and
  capabilities from its TXT record, TCP-probes its print ports to show what's actually
  reachable, and connects in one click with the right driver. Driver-only printers are
  added by IP with automatic protocol/driver detection.
- **Diagnose** — for any printer: a reachability check (per-port TCP probes), CUPS state
  reasons translated to plain English (paper jam, out of ink, offline, paused…), the queue
  depth, and one-click fixes (resume, accept jobs, clear queue, print a test page, remove).
  **Ask your AI engine to explain and fix** feeds the diagnostics to your engine for a
  plain-English diagnosis — it even knows the Canon G-series lamp/5100 error codes.

### Add-printer driver logic (important)

Not every printer speaks AirPrint. The app picks the right driver strategy:

1. **IPP Everywhere (driverless)** — used *only* when the device advertises `ipp`/`ipps`
   over Bonjour. `lpadmin -m everywhere` requires a real IPP endpoint.
2. **Installed vendor PPD** — for driver-only printers (no IPP). The app scans installed
   PPDs and matches by make/model, then adds with `lpadmin -P <ppd>`.
3. **No driver found** — prompts you to install the vendor CUPS driver, then retry.

> Example: the Canon PIXMA G3000 is **LPD-only (port 515), no AirPrint**. The correct add is
> a vendor PPD, not IPP Everywhere:
>
> ```bash
> lpadmin -p Canon_PIXMA_G3000 -E -v lpd://192.168.1.16/ \
>   -P "/Library/Printers/PPDs/Contents/Resources/Canon G3000 series.ppd.gz"
> ```
>
> Adding a queue may require admin rights; if `lpadmin` reports it's not authorized, the
> app shows you the exact `sudo lpadmin …` line to run in Terminal.

## Development

Requirements: macOS, Node 20 or newer, and at least one AI CLI on your `PATH` (`claude`, `codex` or `grok`), or bring your own.

```bash
npm run dev        # desktop app with hot reload
npm run build      # bundle main / preload / renderer into out/
npm run start      # preview the production build
npm run typecheck  # type-check both the node and web sides
npm run build:cli  # bundle the CLI into out/cli/printer-use.mjs
npm run package    # build an unpacked .app (electron-builder --dir)
```

## Bring-your-own engine

An engine is just a CLI that takes a prompt and prints a response. Built-in presets:

| Engine        | Command invoked                          |
| ------------- | ---------------------------------------- |
| Claude Code   | `claude -p "{PROMPT}" --output-format json` |
| OpenAI Codex  | `codex exec --skip-git-repo-check "{PROMPT}"` |
| Grok CLI      | `grok -p "{PROMPT}"`                     |
| Custom        | any `bin` + args containing `{PROMPT}`   |

The `{PROMPT}` token is replaced with the full request; nothing is sent anywhere except
through the CLI you chose, using *your* authenticated subscription.

## Architecture

```
src/
  cli/               the printer-use CLI and MCP server (no Electron)
  core/              setup, fix and print planning shared by the CLI and MCP server
  shared/            types + IPC channel names + provider presets (imported by all sides)
  main/              Electron main process
    index.ts         window, theme, IPC handlers
    cups.ts          discover / status / queue / submit / cancel / add-printer (+ driver logic)
    discovery.ts     Bonjour/mDNS browse + resolve via dns-sd
    providers.ts     detect + invoke engine CLIs
    nl.ts            prompt → engine → interpretation → deterministic lp command
    lp-builder.ts    whitelisted PrintOptions → validated `lp` argv (the safety core)
    exec.ts          execFile wrapper (argv only, PATH-hardened)
    store.ts         config persistence in userData
  preload/           contextBridge API (typed window.api)
  renderer/          React + Tailwind + framer-motion UI
    studio.tsx       shared state controller (files, printers, chat, status) via context
    components/
      ChatDock.tsx     the chat column
      Stage.tsx        the visual stage (toolbar, scene, settings chips, state)
      PrinterScene.tsx animated SVG printer + document + printing animation
      Onboarding · Settings · AddPrinterModal · QueueModal · toast · ui
```

## Testing the pipeline

`scripts/smoke.ts` runs a real request through the actual `nl` + `lp-builder` source and
asserts the resolved command. Example (using Claude Code as the engine):

```bash
claude -p "$(cat prompt.txt)" --output-format json > raw.json
./node_modules/.bin/esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs
node /tmp/smoke.mjs raw.json
# → COMMAND : lp -d Canon_PIXMA_G3000 -n 2 -o sides=two-sided-long-edge -o print-color-mode=monochrome -o page-ranges=1-3 report.pdf
# → PASS ✓
```

## Security

printer-use never runs model output. The model can only fill in a fixed list of options, the command is built from those options in code, and every command runs as an argv array with no shell. See [SECURITY.md](SECURITY.md) to report a problem.

## License

[MIT](LICENSE)
