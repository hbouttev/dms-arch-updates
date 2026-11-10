# Changelog

What changed for users in each version, newest first, grouped as Added, Changed, Removed and
Fixed. DMS offers every change on `main` as a plugin update; versions mark the tested states,
and each has a git tag (`v0.5.0`).

## 0.5.0 (2026-11-11)

A new look that follows the shell's current Material 3 design.

### Added

- A summary card on top of the popout and the dashboard tab: the update count, when the last
  check ran and the refresh button. It is tinted only when updates are waiting.
- While a check runs, the card's badge turns into the shell's loading indicator.

### Changed

- Sources form one grouped list, as in the shell's own update list.
- The update buttons sit on the right, with the main one filled and rightmost.
- The bar pill icon is in the accent color, or the warning color when a check failed.
- On the settings page, the system update method choices form a grouped list too.
- Package versions use the regular font instead of a monospace one.

### Removed

- The "Check for updates" button: the refresh button in the summary card does the same.

### Fixed

- A source being checked showed both a spinner and "Checking…"; the spinner now takes the
  place of its status alone.
- The next check time no longer shows the date when it falls after midnight.

## 0.4.3 (2026-11-09)

First version in the DMS plugin registry: repository, AUR, Flatpak and mise updates in a bar
pill, a popout and a dashboard tab, with updates run in your terminal by Arch-Update,
Cachy-Update or your AUR helper. Earlier versions (0.1.0 to 0.4.2, from 2026-11-06) were the
plugin's first development, first as CachyOS Updates.
