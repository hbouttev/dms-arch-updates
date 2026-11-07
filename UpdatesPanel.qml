import QtQuick
import QtQuick.Layouts
import qs.Common
import qs.DCommon.Widgets
import "logic/Updates.js" as U

// The one update view, used by the bar popout (compact) and the dashboard tab (full).
// All state and actions live in the daemon; this only renders it.
ColumnLayout {
    id: root

    property var daemon: null
    // Compact: only sources with updates or problems, and only the relevant actions.
    property bool compact: false
    // Height limit of the scrolling source list (the popout passes a fixed value; in the
    // dashboard the panel is given a height and the list takes the remaining space).
    property real maxListHeight: Infinity

    // Emitted after an update terminal was launched (the popout closes itself).
    signal launched

    readonly property bool ready: daemon !== null
    readonly property real now: daemon ? daemon.now : Date.now()
    readonly property var sources: daemon ? daemon.sources : U.emptySources()
    readonly property int total: daemon ? daemon.totalCount : 0
    readonly property int systemCount: daemon ? daemon.systemCount : 0
    readonly property int miseCount: daemon ? daemon.miseCount : 0
    readonly property int bumpCount: daemon ? daemon.bumpCount : 0
    readonly property bool checking: daemon ? daemon.checking : false
    readonly property bool incomplete: daemon ? daemon.incomplete : false
    readonly property bool neverChecked: daemon ? daemon.neverChecked : true
    readonly property var checkingIds: daemon ? daemon.checkingIds : []
    // Name of the system update command ("Cachy-Update", "yay -Syu", ...), empty if unknown
    readonly property string systemLabel: daemon ? daemon.updateMethod.label : ""

    readonly property var visibleIds: U.SOURCE_IDS.filter(id => {
        if (!compact)
            return true;
        const s = sources[id];
        return s.state !== "disabled" && (s.items.length > 0 || s.state === "error" || s.partial);
    })

    readonly property string titleText: {
        if (!ready)
            return I18n.trFor("archUpdates", "Updates");
        if (total > 0)
            return total === 1 ? I18n.trFor("archUpdates", "1 update available") : I18n.trFor("archUpdates", "%1 updates available").arg(total);
        if (neverChecked)
            return checking ? I18n.trFor("archUpdates", "Checking for updates…") : I18n.trFor("archUpdates", "Not checked yet");
        if (incomplete)
            return I18n.trFor("archUpdates", "No updates found, some checks failed");
        return I18n.trFor("archUpdates", "Everything is up to date");
    }

    readonly property string subtitleText: {
        if (!ready)
            return I18n.trFor("archUpdates", "The plugin's background service is not running. Re-enable the plugin in Settings → Plugins.");
        const parts = [];
        if (checking)
            parts.push(I18n.trFor("archUpdates", "Checking…"));
        else if (daemon.lastRoundAt > 0)
            parts.push(I18n.trFor("archUpdates", "Checked %1").arg(U.formatAgo(daemon.lastRoundAt, now)));
        if (incomplete && total > 0)
            parts.push(I18n.trFor("archUpdates", "some checks failed"));
        if (!compact && !checking && daemon.nextCheckAt > now)
            parts.push(I18n.trFor("archUpdates", "next at %1").arg(U.formatTime(daemon.nextCheckAt, now)));
        return parts.join(" · ");
    }

    function run(mode) {
        if (daemon && daemon.launch(mode))
            root.launched();
    }

    spacing: Theme.spacingM

    // ---- Header -------------------------------------------------------------------

    RowLayout {
        Layout.fillWidth: true
        spacing: Theme.spacingM

        DIcon {
            Layout.alignment: Qt.AlignVCenter
            name: root.total > 0 ? "system_update_alt" : (root.incomplete || !root.ready ? "error" : (root.neverChecked ? "schedule" : "check_circle"))
            size: Theme.iconSize + 4
            color: root.total > 0 ? Theme.primary : (root.incomplete || !root.ready ? Theme.warning : Theme.surfaceVariantText)
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 0

            StyledText {
                Layout.fillWidth: true
                text: root.titleText
                elide: Text.ElideRight
                font.pixelSize: Theme.fontSizeLarge
                font.weight: Theme.fontWeightMedium
                color: Theme.surfaceText
            }

            StyledText {
                Layout.fillWidth: true
                visible: text.length > 0
                text: root.subtitleText
                wrapMode: Text.Wrap
                font.pixelSize: Theme.fontSizeSmall
                color: Theme.surfaceVariantText
            }
        }

        DActionButton {
            Layout.alignment: Qt.AlignVCenter
            visible: root.ready && root.compact
            enabled: !root.checking
            iconName: "refresh"
            buttonSize: Theme.buttonHeightXS
            tooltipText: I18n.trFor("archUpdates", "Check for updates")
            Accessible.name: tooltipText
            onClicked: root.daemon.checkNow("manual")
        }
    }

    StyledRect {
        Layout.fillWidth: true
        visible: root.ready && root.daemon.updateRunning
        implicitHeight: runningRow.implicitHeight + Theme.spacingS * 2
        radius: Theme.cornerRadius
        color: Theme.primaryContainer

        RowLayout {
            id: runningRow
            anchors.fill: parent
            anchors.margins: Theme.spacingS
            spacing: Theme.spacingS

            DIcon {
                name: "terminal"
                size: Theme.iconSizeSmall + 2
                color: Theme.onPrimaryContainer
            }

            StyledText {
                Layout.fillWidth: true
                text: I18n.trFor("archUpdates", "An update is running in a terminal. Results refresh when it ends.")
                wrapMode: Text.Wrap
                font.pixelSize: Theme.fontSizeSmall
                color: Theme.onPrimaryContainer
            }
        }
    }

    // ---- Sources ------------------------------------------------------------------

    Flickable {
        id: list
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.preferredHeight: listColumn.implicitHeight
        Layout.maximumHeight: root.maxListHeight
        visible: root.ready
        contentWidth: width
        contentHeight: listColumn.implicitHeight
        clip: true
        interactive: contentHeight > height
        boundsBehavior: Flickable.StopAtBounds

        Column {
            id: listColumn
            width: list.width
            spacing: Theme.spacingS

            Repeater {
                model: root.visibleIds

                delegate: SourceSection {
                    sourceId: modelData
                    source: root.sources[modelData]
                    checking: root.checkingIds.includes(modelData)
                    compact: root.compact
                    now: root.now
                }
            }
        }
    }

    // ---- Actions ------------------------------------------------------------------

    Flow {
        Layout.fillWidth: true
        visible: root.ready
        spacing: Theme.spacingS

        DButton {
            visible: !root.compact
            enabled: !root.checking
            busy: root.checking
            text: root.checking ? I18n.trFor("archUpdates", "Checking…") : I18n.trFor("archUpdates", "Check for updates")
            iconName: "refresh"
            backgroundColor: Theme.surfaceContainerHighest
            textColor: Theme.surfaceText
            onClicked: root.daemon.checkNow("manual")
        }

        DButton {
            visible: !root.compact || (root.systemCount > 0 && root.miseCount > 0)
            text: I18n.trFor("archUpdates", "Update all")
            iconName: "system_update_alt"
            tooltipText: I18n.trFor("archUpdates", "%1, then mise upgrade --global, in one terminal").arg(root.ready ? root.daemon.systemUpdateDescription : "")
            onClicked: root.run("all")
        }

        DButton {
            visible: !root.compact || root.systemCount > 0 || root.miseCount === 0
            text: root.compact ? I18n.trFor("archUpdates", "System") : (root.systemLabel ? I18n.trFor("archUpdates", "Run %1").arg(root.systemLabel) : I18n.trFor("archUpdates", "Update system"))
            iconName: "terminal"
            backgroundColor: root.compact && root.miseCount === 0 ? Theme.primary : Theme.secondaryContainer
            textColor: root.compact && root.miseCount === 0 ? Theme.onPrimary : Theme.onSecondaryContainer
            tooltipText: root.ready ? root.daemon.systemUpdateDescription : ""
            onClicked: root.run("system")
        }

        DButton {
            visible: !root.compact || root.miseCount > 0
            text: root.compact ? I18n.trFor("archUpdates", "mise") : I18n.trFor("archUpdates", "Upgrade mise tools")
            iconName: "construction"
            backgroundColor: root.compact && root.systemCount === 0 ? Theme.primary : Theme.secondaryContainer
            textColor: root.compact && root.systemCount === 0 ? Theme.onPrimary : Theme.onSecondaryContainer
            tooltipText: I18n.trFor("archUpdates", "mise upgrade --global, within the versions in your config")
            onClicked: root.run("mise")
        }

        DButton {
            visible: !root.compact && root.bumpCount > 0
            text: I18n.trFor("archUpdates", "Bump mise versions…")
            iconName: "upgrade"
            backgroundColor: Theme.surfaceContainerHighest
            textColor: Theme.surfaceText
            tooltipText: I18n.trFor("archUpdates", "mise upgrade --global --bump --interactive: pick tools to move past their configured versions (rewrites config.toml)")
            onClicked: root.run("mise-bump")
        }
    }

    // Only shown when the update buttons cannot work; the terminal in use is on the settings page.
    StyledText {
        Layout.fillWidth: true
        visible: root.ready && root.daemon.terminal.argv.length === 0
        text: visible ? `${root.daemon.terminalDescription} · ${I18n.trFor("archUpdates", "set one in DMS settings, $TERMINAL or the plugin settings")}` : ""
        wrapMode: Text.Wrap
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.error
    }
}
