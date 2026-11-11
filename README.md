# printer-use

**Let your agent use your printer.** Describe a print job in plain English, and printer-use turns it into an exact `lp` command you approve before anything reaches the printer. It comes as a desktop app and a CLI, both powered by the AI subscription you already have.

You bring the engine (Claude Code, OpenAI Codex, Grok, or any CLI you already pay for). printer-use never bundles a model and never stores keys.

```bash
$ printer-use print report.pdf "2 copies, double-sided, black and white, pages 1-3"
Print 2 double-sided black-and-white copies of pages 1-3 of report.pdf on Canon_PIXMA_G3000.

  lp -d Canon_PIXMA_G3000 -n 2 -o sides=two-sided-long-edge -o print-color-mode=monochrome -o page-ranges=1-3 report.pdf

Print this? [y/N]
```

<p align="center">
  <img src="docs/studio-demo.png" width="90%" alt="printer-use desktop app: chat on the right, visual printer stage on the left" />
</p>
<p align="center">
  <img src="docs/studio-demo-light.png" width="49%" alt="Light theme" />
  <img src="docs/onboarding.png" width="49%" alt="Onboarding: bring your own AI engine" />
</p>

## Two ways to use it

| | |
| --- | --- |
| **CLI** | `printer-use` in any terminal. Agents call it with `--json` and get structured output back. Nothing prints without `--yes` or a typed confirmation. |
| **Desktop app** | A chat column on the right, and a visual, animated stage showing the printer, your document, the resolved settings and live printer state. |

Both share the same core (`src/main`): CUPS, network discovery, diagnostics, the AI translation step and the `lp` builder.

## CLI

```bash
npm install
npm run build:cli
npm link            # puts `printer-use` on your PATH
```

| Command | What it does |
| --- | --- |
| `printer-use print <file...> ["request"]` | Translate a request into an `lp` command, confirm, print |
| `printer-use printers` | List CUPS printers (`*` marks the default) |
| `printer-use jobs` | List active print jobs |
| `printer-use cancel <job-id>` | Cancel a job |
| `printer-use default <printer>` | Set your default printer (per user, no `sudo`) |
| `printer-use discover` | Find printers on the network over Bonjour/mDNS |
| `printer-use diagnose <printer>` | Reachability, CUPS state reasons in plain English, queue depth |
| `printer-use engines` | Show which AI engines are installed |

| Option | |
| --- | --- |
| `-p, --printer <name>` | Target printer (overrides the engine's choice) |
| `-e, --engine <id>` | `claude-code`, `codex` or `grok`. Defaults to the first one installed, or `$PRINTER_USE_ENGINE` |
| `-n, --dry-run` | Show the resolved command without printing |
| `-y, --yes` | Print without asking |
| `--json` | Machine-readable output for agents |

Leave out the request (`printer-use print report.pdf`) to print with the printer's defaults, with no AI call at all.

### Using it from an agent

Tell your agent to preview first and print only after you agree:

```bash
printer-use print slides.pdf "4 pages per sheet, landscape" --dry-run --json
```

```json
{
  "ok": true,
  "dryRun": true,
  "summary": "Print slides.pdf landscape with 4 pages per sheet on Canon_PIXMA_G3000.",
  "command": "lp -d Canon_PIXMA_G3000 -o orientation-requested=4 -o number-up=4 slides.pdf",
  "argv": ["lp", "-d", "Canon_PIXMA_G3000", "-o", "orientation-requested=4", "-o", "number-up=4", "slides.pdf"],
  "applied": { "printer": "Canon_PIXMA_G3000", "orientation": "landscape", "numberUp": 4 },
  "warnings": []
}
```

In `--json` mode without `--yes`, printer-use refuses to print and returns the plan instead, so an agent can never print by accident.

## Desktop app

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
  cli/               the printer-use CLI (no Electron)
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
