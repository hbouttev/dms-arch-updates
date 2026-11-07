import QtQuick
import qs.Common
import "logic/Updates.js" as U

// All wording built from data: logic/Updates.js and the scripts return codes and values,
// and these functions turn them into text. Everything shown goes through I18n.trFor here,
// with the plugin id written out, so DMS's translation tooling finds each string.
//
// Codes come from scripts/check.sh and common.sh (coded messages), logic/Updates.js and
// UpdatesDaemon.qml; tests/run.mjs checks that each one has a case below. An unknown code
// falls back to the English text that came with it.
QtObject {
    function sourceLabel(id) {
        switch (id) {
        case "repo":
            return I18n.trFor("archUpdates", "Repositories");
        case "aur":
            return I18n.trFor("archUpdates", "AUR");
        case "flatpak":
            return I18n.trFor("archUpdates", "Flatpak");
        case "mise":
            return I18n.trFor("archUpdates", "mise");
        default:
            return id;
        }
    }

    function elapsed(ms, now) {
        const e = U.elapsed(ms, now);
        switch (e.unit) {
        case "never":
            return I18n.trFor("archUpdates", "never");
        case "now":
            return I18n.trFor("archUpdates", "just now");
        case "minutes":
            return I18n.trFor("archUpdates", "%1 min ago").arg(e.value);
        case "hours":
            return I18n.trFor("archUpdates", "%1 h ago").arg(e.value);
        default:
            return I18n.trFor("archUpdates", "%1 d ago").arg(e.value);
        }
    }

    // Why a source does not apply (state "disabled").
    function reasonText(source) {
        const a = source.reasonArgs || [];
        switch (source.reasonCode) {
        case "no-aur":
            return I18n.trFor("archUpdates", "Disabled by NoAUR in arch-update.conf");
        case "aur-helper-missing":
            return I18n.trFor("archUpdates", "AURHelper=%1 is set in arch-update.conf but not installed").arg(a[0]);
        case "no-aur-helper":
            return I18n.trFor("archUpdates", "No AUR helper installed (paru, yay or pikaur)");
        case "no-flatpak-config":
            return I18n.trFor("archUpdates", "Disabled by NoFlatpak in arch-update.conf");
        case "flatpak-missing":
            return I18n.trFor("archUpdates", "Flatpak is not installed");
        case "no-flatpak-apps":
            return I18n.trFor("archUpdates", "No Flatpak applications installed");
        case "mise-missing":
            return I18n.trFor("archUpdates", "mise is not installed");
        case "mise-disabled":
            return I18n.trFor("archUpdates", "Disabled in plugin settings");
        case "not-applicable":
            return I18n.trFor("archUpdates", "Not applicable");
        default:
            return source.reason || "";
        }
    }

    // Why the last check failed. A tool's own error output has no code and is shown as is.
    function errorText(source) {
        const a = source.errorArgs || [];
        switch (source.errorCode) {
        case "timeout":
            return I18n.trFor("archUpdates", "Timed out after %1 s").arg(a[0]);
        case "exit":
            return I18n.trFor("archUpdates", "Exited with code %1").arg(a[0]);
        case "parse":
            return I18n.trFor("archUpdates", "Could not read the result: %1").arg(a[0]);
        case "busy":
            return I18n.trFor("archUpdates", "The previous check of this source is still running");
        case "checkupdates-missing":
            return I18n.trFor("archUpdates", "checkupdates not found (install pacman-contrib)");
        case "checkupdates-failed":
            return I18n.trFor("archUpdates", "checkupdates exited with code %1").arg(a[0]);
        case "aur-check-failed":
            return I18n.trFor("archUpdates", "%1 -Qua exited with code %2").arg(a[0]).arg(a[1]);
        case "flatpak-check-failed":
            return I18n.trFor("archUpdates", "Could not list Flatpak updates (%1 installation)").arg(a[0]);
        case "mise-check-failed":
            return I18n.trFor("archUpdates", "mise outdated exited with an error");
        default:
            return source.error || "";
        }
    }

    // Warnings from the tools (shown as is), plus the ones the plugin detects itself.
    function warningText(source) {
        const lines = source.warning ? [source.warning] : [];
        if (source.bumpFailed)
            lines.push(I18n.trFor("archUpdates", "Could not list upgrades beyond the configured versions"));
        return lines.join("\n");
    }

    // Short note after an update's name, or "" (notes from the tools are kept as they are).
    function itemNote(item) {
        if (item.requested)
            return I18n.trFor("archUpdates", "requested %1").arg(item.requested);
        return item.note || "";
    }

    function terminalSource(source) {
        switch (source) {
        case "custom":
            return I18n.trFor("archUpdates", "custom command");
        case "dms":
            return I18n.trFor("archUpdates", "DMS terminal setting");
        case "env":
            return "$TERMINAL";
        default:
            return I18n.trFor("archUpdates", "first installed terminal");
        }
    }

    // "ghostty (DMS terminal setting)", with any configured terminal that is not installed.
    function terminalDescription(t) {
        const missing = t && t.missing && t.missing.length ? I18n.trFor("archUpdates", "%1 not found").arg(t.missing.join(", ")) : "";
        if (!t || t.argv.length === 0)
            return missing ? I18n.trFor("archUpdates", "No terminal found (%1)").arg(missing) : I18n.trFor("archUpdates", "No terminal found");
        const text = I18n.trFor("archUpdates", "%1 (%2)").arg(t.name).arg(terminalSource(t.source));
        return missing ? I18n.trFor("archUpdates", "%1; %2").arg(text).arg(missing) : text;
    }

    // What the system update runs, from U.resolveUpdateMethod.
    function systemUpdateDescription(m) {
        if (!m || !m.label)
            return I18n.trFor("archUpdates", "System update: repositories, AUR and Flatpak");
        if (m.method === "arch-update")
            return I18n.trFor("archUpdates", "%1: repositories, AUR and Flatpak, with Arch news and maintenance steps").arg(m.label);
        if (m.aurHelper)
            return m.flatpak ? I18n.trFor("archUpdates", "%1 (repositories and AUR), then flatpak update").arg(m.label) : I18n.trFor("archUpdates", "%1 (repositories and AUR)").arg(m.label);
        return m.flatpak ? I18n.trFor("archUpdates", "%1 (repositories), then flatpak update").arg(m.label) : I18n.trFor("archUpdates", "%1 (repositories)").arg(m.label);
    }

    function fallbackNote(m) {
        return m && m.fallback ? I18n.trFor("archUpdates", "%1 is not installed, so updates run directly.").arg(U.archUpdateName("")) : "";
    }
}
