import QtQuick
import qs.Common
import qs.Modules.Plugins
import qs.Modules.DDash

// Dashboard tab (dms ipc call dash open plugin_archUpdates). Always available, also
// while the bar pill is hidden. Created only while shown; the daemon keeps the state.
DashTabComponent {
    id: root

    // Injected by the dash host: how many 96 px rows fit on this screen.
    property int rowBudget: DashMetrics.minimumTabRows

    readonly property var daemon: pluginService?.pluginDaemonInstances?.[pluginId] ?? null
    readonly property real maxHeight: DashMetrics.heightForRows(Math.max(DashMetrics.minimumTabRows, rowBudget))

    implicitHeight: Math.max(DashMetrics.tabMinHeight, Math.min(panel.implicitHeight, maxHeight))

    menuActions: [
        {
            label: I18n.trFor("archUpdates", "Check for updates"),
            iconName: "refresh",
            enabled: root.daemon !== null && !root.daemon.checking,
            action: () => root.daemon.checkNow("manual")
        }
    ]

    function handleKeyEvent(event) {
        if (event.modifiers & (Qt.ControlModifier | Qt.AltModifier))
            return false;
        if (event.key === Qt.Key_R && daemon) {
            daemon.checkNow("manual");
            return true;
        }
        return false;
    }

    UpdatesPanel {
        id: panel
        anchors.fill: parent
        daemon: root.daemon
        compact: false
        live: root.live

        // Get out of the way of the update terminal.
        onLaunched: {
            if (root.dashHost)
                root.dashHost.dashVisible = false;
        }
    }
}
