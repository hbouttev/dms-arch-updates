import QtQuick
import qs.Common
import qs.DCommon.Widgets
import qs.Modules.Plugins
import qs.Services

PluginSettings {
    id: root
    pluginId: "archUpdates"

    readonly property var daemon: PluginService.pluginDaemonInstances?.[pluginId] ?? null

    StyledText {
        width: parent.width
        text: I18n.trFor("archUpdates", "Repositories, AUR and Flatpak are checked with checkupdates, your AUR helper and flatpak, following the NoAUR, NoFlatpak and AURHelper options of ~/.config/arch-update/arch-update.conf when it exists. mise tools are upgraded with mise upgrade --global.")
        wrapMode: Text.WordWrap
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.surfaceVariantText
    }

    UpdateMethodSetting {
        settings: root
        daemon: root.daemon
    }

    SelectionSetting {
        settingKey: "intervalMinutes"
        label: I18n.trFor("archUpdates", "Check every")
        description: I18n.trFor("archUpdates", "Failed checks are retried sooner, backing off up to this interval")
        options: [
            {
                label: I18n.trFor("archUpdates", "15 minutes"),
                value: "15"
            },
            {
                label: I18n.trFor("archUpdates", "30 minutes"),
                value: "30"
            },
            {
                label: I18n.trFor("archUpdates", "1 hour"),
                value: "60"
            },
            {
                label: I18n.trFor("archUpdates", "2 hours"),
                value: "120"
            },
            {
                label: I18n.trFor("archUpdates", "6 hours"),
                value: "360"
            },
            {
                label: I18n.trFor("archUpdates", "12 hours"),
                value: "720"
            },
            {
                label: I18n.trFor("archUpdates", "24 hours"),
                value: "1440"
            }
        ]
        defaultValue: "60"
    }

    SelectionSetting {
        settingKey: "timeoutSeconds"
        label: I18n.trFor("archUpdates", "Check timeout")
        description: I18n.trFor("archUpdates", "Per source; a source that takes longer is reported as failed")
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
        label: I18n.trFor("archUpdates", "Terminal command")
        description: I18n.trFor("archUpdates", "Leave empty to use the DMS terminal setting, then $TERMINAL, then the first installed terminal. Otherwise, a command that opens a terminal running the command appended to it, e.g. \"kitty --hold\".") + (root.daemon ? "\n" + I18n.trFor("archUpdates", "Currently: %1").arg(root.daemon.terminalDescription) : "")
        placeholder: I18n.trFor("archUpdates", "Automatic")
        defaultValue: ""
    }

    ToggleSetting {
        settingKey: "miseEnabled"
        label: I18n.trFor("archUpdates", "Check mise tools")
        description: I18n.trFor("archUpdates", "Tools in the global mise config, within their configured versions")
        defaultValue: true
    }

    ToggleSetting {
        settingKey: "miseBumpEnabled"
        label: I18n.trFor("archUpdates", "Show mise upgrades beyond configured versions")
        description: I18n.trFor("archUpdates", "Listed in the dashboard only and not counted in the bar; applied with “Bump mise versions…”")
        defaultValue: true
    }
}
