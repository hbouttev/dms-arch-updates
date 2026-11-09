import QtQuick
import qs.Common
import qs.DCommon.Widgets
import qs.Modules.Plugins

// Bar pill: hidden (and taking no space) unless updates are available. Click opens the
// popout; right click opens the dashboard tab. One instance per bar and screen; all of
// them read the same daemon, so nothing is checked twice.
PluginComponent {
    id: root

    property var popoutService: null

    readonly property var daemon: pluginService?.pluginDaemonInstances?.[pluginId] ?? null
    readonly property int count: daemon ? daemon.totalCount : 0
    readonly property bool incomplete: daemon ? daemon.incomplete : false
    // Only the count decides visibility: checks in progress or failed checks never make
    // a hidden pill appear.
    readonly property bool shown: count > 0

    onShownChanged: setVisibilityOverride(shown)
    Component.onCompleted: setVisibilityOverride(shown)

    // Follows the font size, like DMS's process list popout: 448 px at the default size.
    readonly property real popoutSize: Math.round(Theme.fontSizeMedium * 32)

    popoutWidth: popoutSize

    pillRightClickAction: (x, y, width, section, screen) => {
        if (popoutService)
            popoutService.toggleDankDash("plugin_" + pluginId, x, y, width, section, screen);
    }

    popoutContent: Component {
        PopoutComponent {
            id: popout

            UpdatesPanel {
                width: parent.width
                daemon: root.daemon
                compact: true
                maxListHeight: root.popoutSize
                onLaunched: {
                    if (popout.closePopout)
                        popout.closePopout();
                }
            }
        }
    }

    horizontalBarPill: Component {
        Row {
            spacing: Theme.spacingXS

            DIcon {
                anchors.verticalCenter: parent.verticalCenter
                name: "system_update_alt"
                size: root.iconSize
                color: root.incomplete ? Theme.warning : Theme.widgetIconColor
            }

            StyledText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.count
                font.pixelSize: root.textSize
                color: Theme.widgetTextColor
            }
        }
    }

    verticalBarPill: Component {
        Column {
            spacing: Theme.spacingXXS

            DIcon {
                anchors.horizontalCenter: parent.horizontalCenter
                name: "system_update_alt"
                size: root.iconSize
                color: root.incomplete ? Theme.warning : Theme.widgetIconColor
            }

            StyledText {
                anchors.horizontalCenter: parent.horizontalCenter
                text: root.count
                font.pixelSize: root.textSize
                color: Theme.widgetTextColor
            }
        }
    }
}
