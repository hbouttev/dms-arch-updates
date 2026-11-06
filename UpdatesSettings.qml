import QtQuick
import qs.Common
import qs.DCommon.Widgets
import qs.Modules.Plugins
import qs.Services

PluginSettings {
    id: root
    pluginId: "cachyUpdates"

    readonly property var daemon: PluginService.pluginDaemonInstances?.[pluginId] ?? null

    StyledText {
        width: parent.width
        text: I18n.trFor("cachyUpdates", "Repositories, AUR and Flatpak are checked with checkupdates, your AUR helper and flatpak, following ~/.config/arch-update/arch-update.conf (NoAUR, NoFlatpak, AURHelper). Updates run through Cachy-Update; mise tools through mise upgrade --global.")
        wrapMode: Text.WordWrap
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.surfaceVariantText
    }

    SelectionSetting {
        settingKey: "intervalMinutes"
        label: I18n.trFor("cachyUpdates", "Check every")
        description: I18n.trFor("cachyUpdates", "Failed checks are retried sooner, backing off up to this interval")
        options: [
            {
                label: I18n.trFor("cachyUpdates", "15 minutes"),
                value: "15"
            },
            {
                label: I18n.trFor("cachyUpdates", "30 minutes"),
                value: "30"
            },
            {
                label: I18n.trFor("cachyUpdates", "1 hour"),
                value: "60"
            },
            {
                label: I18n.trFor("cachyUpdates", "2 hours"),
                value: "120"
            },
            {
                label: I18n.trFor("cachyUpdates", "6 hours"),
                value: "360"
            },
            {
                label: I18n.trFor("cachyUpdates", "12 hours"),
                value: "720"
            },
            {
                label: I18n.trFor("cachyUpdates", "24 hours"),
                value: "1440"
            }
        ]
        defaultValue: "60"
    }

    SelectionSetting {
        settingKey: "timeoutSeconds"
        label: I18n.trFor("cachyUpdates", "Check timeout")
        description: I18n.trFor("cachyUpdates", "Per source; a source that takes longer is reported as failed")
        options: [
            {
                label: "30 s",
                value: "30"
            },
            {
                label: "60 s",
                value: "60"
            },
            {
                label: "2 min",
                value: "120"
            },
            {
                label: "5 min",
                value: "300"
            }
        ]
        defaultValue: "120"
    }

    StringSetting {
        settingKey: "terminalCommand"
        label: I18n.trFor("cachyUpdates", "Terminal command")
        description: I18n.trFor("cachyUpdates", "Leave empty to use the DMS terminal setting, then $TERMINAL, then the first installed terminal. Otherwise, a command that opens a terminal running the command appended to it, e.g. \"kitty --hold\".") + (root.daemon ? "\n" + I18n.trFor("cachyUpdates", "Currently: %1").arg(root.daemon.terminalDescription) : "")
        placeholder: I18n.trFor("cachyUpdates", "Automatic")
        defaultValue: ""
    }

    ToggleSetting {
        settingKey: "miseEnabled"
        label: I18n.trFor("cachyUpdates", "Check mise tools")
        description: I18n.trFor("cachyUpdates", "Tools in the global mise config, within their configured versions")
        defaultValue: true
    }

    ToggleSetting {
        settingKey: "miseBumpEnabled"
        label: I18n.trFor("cachyUpdates", "Show mise upgrades beyond configured versions")
        description: I18n.trFor("cachyUpdates", "Listed in the dashboard only and not counted in the bar; applied with “Bump mise versions…”")
        defaultValue: true
    }
}
