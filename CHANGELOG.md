# Changelog

What changed for users in each version, newest first. DMS offers every change on `main` as a
plugin update; versions mark the tested states, and each has a git tag (`v0.5.0`).

## 0.5.0 (2026-11-11)

A new look that follows the shell's current Material 3 design.

- The popout and the dashboard tab open with a summary card: the update count, when the last
  check ran and the refresh button. The card is tinted only when updates are waiting, and its
  badge turns into the shell's loading indicator while a check runs.
- Sources form one grouped list, as in the shell's own update list. While a source is being
  checked, a spinner takes the place of its status.
- The update buttons sit on the right, with the main one filled and rightmost. The
  "Check for updates" button is gone: the refresh button in the summary card does the same.
- The bar pill icon is in the accent color, or the warning color when a check failed.
- On the settings page, the system update method choices form a grouped list too.
- The next check time no longer shows the date when it falls after midnight.

## 0.4.3 (2026-11-09)

First version in the DMS plugin registry: repository, AUR, Flatpak and mise updates in a bar
pill, a popout and a dashboard tab, with updates run in your terminal by Arch-Update,
Cachy-Update or your AUR helper. Earlier versions (0.1.0 to 0.4.2, from 2026-11-06) were the
plugin's first development, first as CachyOS Updates.
