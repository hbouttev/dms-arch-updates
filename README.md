# CachyOS Updates for DMS

A [Dux Shell (DMS)](https://duxlabs.dev/docs/dms/) plugin that shows available updates for
CachyOS repositories, the AUR, Flatpak and [mise](https://mise.jdx.dev) tools, and runs them in
a terminal:

- system updates go through **Cachy-Update** (`cachy-update`), keeping its Arch news, pacnew,
  orphan, cache and reboot steps;
- mise tools go through **`mise upgrade --global`**, which stays within the versions requested
  in `~/.config/mise/config.toml`.

Updates open in your terminal, chosen the same way DMS chooses it (see [Terminal](#terminal)).

The plugin only checks, displays and launches. It never runs an update on its own.

## Surfaces

| Surface | Behaviour |
| --- | --- |
| Bar pill | Icon and update count. Hidden, taking no space, when there is nothing to update. Background checks never make it appear or flash. Click: popout. Right click: dashboard tab. The icon turns to the warning color if some check failed. |
| Popout | Sources with updates or problems, a re-check button, and *Update all* / *System* / *mise*. |
| Dashboard tab *Updates* | Every source with its status, last check time, errors and warnings; *Check for updates*, the same update actions, and *Bump mise versions…* when upgrades exist past the configured versions. Available while the pill is hidden: `dms ipc call dash open plugin_cachyUpdates`. |
| Settings | Settings → Plugins → CachyOS Updates: check interval, timeout, terminal override, mise options. |

## How checking works

A daemon component owns all state: one instance per shell, whatever the number of bars or
screens, and it keeps running while no view is open. The bar pills, popout and dashboard tab
only read it.

Each source is checked by [`scripts/check.sh`](scripts/check.sh), which reports success,
"not applicable" or failure explicitly:

| Source | Command | Follows |
| --- | --- | --- |
| Repositories | `checkupdates`, with a private sync database in `$XDG_RUNTIME_DIR/dms-cachy-updates/` | pacman's `IgnorePkg` |
| AUR | `<helper> -Qua` | `NoAUR` and `AURHelper` in `~/.config/arch-update/arch-update.conf`, otherwise paru, yay, then pikaur (as Cachy-Update) |
| Flatpak | `flatpak remote-ls --updates`, for the user and system installations that have something installed | `NoFlatpak`, `flatpak mask` patterns |
| mise | `mise outdated --global --json` (and `--bump` for the dashboard-only list) | versions requested in the global config |

- All sources run in parallel, each under `timeout`, and results are applied together when the
  round ends. A second check never starts while one runs.
- A failed source keeps its previous results, marked as failed with the time of the last
  success. A failure is never shown as "up to date". If mise reports tools it could not check,
  the source is marked incomplete.
- Results are cached in DMS's plugin state, so after a shell restart the pill shows the last
  known count at once. The next check runs when the interval is due (at the earliest 45 s after
  startup). Failed rounds are retried after 5, 10, 20… minutes, capped at the interval.
- Upgrades past the configured mise versions are listed in the dashboard only and are not
  counted, so pinned tools never keep the pill visible.

## Running updates

Update actions open `<terminal> env bash scripts/run-update.sh <mode>` through
`systemd-run --user --scope`, so the terminal lives in its own cgroup: reloading or restarting
DMS does not interrupt a transaction. The tools keep their normal output and prompts.

| Mode | Runs |
| --- | --- |
| `system` | `cachy-update` |
| `mise` | `mise upgrade --global` |
| `all` | `cachy-update`, then `mise upgrade --global` |
| `mise-bump` | `mise upgrade --global --bump --interactive` (choose tools; rewrites their requested versions) |

The script tells the daemon when it starts and ends (`dms ipc call cachyUpdates started|finished`),
including when the window is closed, and the daemon then checks again.

### Terminal

With the plugin's *Terminal command* setting left empty (the default), the terminal is, in order:

1. DMS's own terminal setting (the one DMS uses for `Terminal=true` applications);
2. `$TERMINAL`;
3. the first installed of `xdg-terminal-exec`, ghostty, kitty, foot, alacritty, wezterm,
   konsole, gnome-terminal, ptyxis, xfce4-terminal, xterm.

A configured terminal that is not installed is skipped (and reported). The plugin adds the
right "run this command" arguments for known terminals (`-e` for Ghostty, Alacritty, Konsole,
xterm; nothing for kitty and foot; `start --` for WezTerm; `--` for GNOME Terminal and Ptyxis;
`-x` for xfce4-terminal and Terminator; `-e` for anything else). The dashboard footer and the
settings page show which terminal is used and why.

Setting *Terminal command* overrides all of this with a literal prefix, for a terminal the
table does not know or to add flags, e.g. `kitty --hold` or `ghostty --title=Updates -e`.

## IPC

```sh
dms ipc call cachyUpdates check            # start a check
dms ipc call cachyUpdates status           # JSON summary, including the terminal used
dms ipc call cachyUpdates update all       # or system, mise, mise-bump
dms ipc call dash open plugin_cachyUpdates # open the dashboard tab
```

## Install

Requirements: DMS ≥ 2.1, `cachy-update`, `pacman-contrib` (checkupdates), `mise`, a terminal
(see [Terminal](#terminal)), systemd user session. An AUR helper and Flatpak are optional.

```sh
git clone https://github.com/hbouttev/dms-cachyos-updates.git ~/src/dms-cachyos-updates
ln -s ~/src/dms-cachyos-updates ~/.config/dms/plugins/cachyUpdates
dms ipc call plugin-scan scan
dms ipc call plugins enable cachyUpdates
```

Then add *CachyOS Updates* to a bar in Settings → Bar (or add `{"id": "cachyUpdates", "enabled": true}`
to a bar's widget list in `~/.config/dms/settings.json`).

### Coexistence with other updaters

The plugin does not touch Cachy-Update's own checker. If `arch-update.timer` or the
`arch-update-tray` applet are enabled, they keep checking and notifying independently; disable
them if the plugin replaces them. The plugin never writes Cachy-Update's state files.

## Development

```text
plugin.json           manifest (composite: daemon + bar widget + dash tab)
UpdatesDaemon.qml     scheduling, checks, state, persistence, IPC, launching
UpdatesWidget.qml     bar pill and popout
UpdatesTab.qml        dashboard tab
UpdatesPanel.qml      the view shared by the popout (compact) and the tab
SourceSection.qml     one source card; UpdateRow.qml: one update line
CheckProcess.qml      Process wrapper that reports exit code, stdout and stderr together
UpdatesSettings.qml   settings page
logic/Updates.js      parsing, state merging, formatting (pure functions)
scripts/check.sh      per-source checks
scripts/run-update.sh update runner in the terminal
tests/run.mjs         tests for logic/Updates.js
```

```sh
node tests/run.mjs                           # logic tests
scripts/check.sh aur; echo $?                # one source by hand (0 ok, 3 n/a, else failure)
dms ipc call plugins reload cachyUpdates     # reload after editing
journalctl --user -u dms -f | grep -i cachy  # logs
```

`dms ipc call plugins reload` picks up QML changes, but not changes to `logic/Updates.js`:
Qt caches `.pragma library` scripts until the shell restarts, so run `dms restart` after
editing it. Likewise, a new QML or JS file next to existing ones needs `dms restart` (DMS keeps
a plugin's file list from its first load).
