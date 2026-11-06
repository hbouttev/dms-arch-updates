import QtQuick
import qs.Common
import qs.DCommon.Widgets
import "logic/Updates.js" as U

// One update source (repositories, AUR, Flatpak or mise): status line, problems and the
// list of available updates.
StyledRect {
    id: root

    property string sourceId: ""
    property var source: U.emptySource(sourceId)
    property bool checking: false
    property bool compact: false
    property real now: Date.now()

    readonly property var info: U.SOURCE_INFO[sourceId] || {
        label: sourceId,
        icon: "help"
    }
    readonly property int count: source.state === "disabled" ? 0 : source.items.length
    readonly property bool failed: source.state === "error"
    readonly property bool stale: failed && source.checkedAt > 0
    readonly property bool showBump: !compact && sourceId === "mise" && source.state !== "disabled" && source.bumpItems.length > 0

    readonly property string statusText: {
        if (checking)
            return I18n.trFor("cachyUpdates", "Checking…");
        switch (source.state) {
        case "unknown":
            return I18n.trFor("cachyUpdates", "Not checked yet");
        case "disabled":
            return I18n.trFor("cachyUpdates", "Not used");
        case "error":
            return stale ? I18n.trFor("cachyUpdates", "Check failed · last success %1").arg(U.formatTime(source.checkedAt, now)) : I18n.trFor("cachyUpdates", "Check failed");
        default:
            return (count > 0 ? "" : I18n.trFor("cachyUpdates", "Up to date") + " · ") + U.formatTime(source.checkedAt, now);
        }
    }

    readonly property color statusColor: failed ? Theme.error : (source.partial ? Theme.warning : Theme.surfaceVariantText)

    width: parent ? parent.width : 0
    implicitHeight: content.implicitHeight + Theme.spacingM * 2
    radius: Theme.cornerRadius
    color: Theme.surfaceContainerHigh

    Column {
        id: content
        x: Theme.spacingM
        y: Theme.spacingM
        width: parent.width - Theme.spacingM * 2
        spacing: Theme.spacingS

        Item {
            width: parent.width
            height: Math.max(sourceIcon.height, titleText.implicitHeight)

            DIcon {
                id: sourceIcon
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                name: root.info.icon
                size: Theme.iconSizeSmall + 4
                color: root.count > 0 ? Theme.primary : Theme.surfaceVariantText
            }

            StyledText {
                id: titleText
                anchors.left: sourceIcon.right
                anchors.leftMargin: Theme.spacingS
                anchors.verticalCenter: parent.verticalCenter
                text: root.info.label
                font.pixelSize: Theme.fontSizeMedium
                font.weight: Theme.fontWeightMedium
                color: Theme.surfaceText
            }

            StyledRect {
                id: countBadge
                visible: root.count > 0
                anchors.left: titleText.right
                anchors.leftMargin: Theme.spacingS
                anchors.verticalCenter: parent.verticalCenter
                height: countText.implicitHeight + Theme.spacingXXS * 2
                width: Math.max(height, countText.implicitWidth + Theme.spacingS * 2)
                radius: height / 2
                color: Theme.primary

                StyledText {
                    id: countText
                    anchors.centerIn: parent
                    text: root.count
                    font.pixelSize: Theme.fontSizeSmall
                    font.weight: Theme.fontWeightMedium
                    color: Theme.onPrimary
                }
            }

            DSpinner {
                id: spinner
                visible: root.checking
                running: visible
                anchors.right: statusLabel.left
                anchors.rightMargin: Theme.spacingXS
                anchors.verticalCenter: parent.verticalCenter
                size: Theme.iconSizeSmall
                strokeWidth: 2
            }

            StyledText {
                id: statusLabel
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.left: countBadge.visible ? countBadge.right : titleText.right
                anchors.leftMargin: Theme.spacingM + (spinner.visible ? spinner.width + Theme.spacingXS : 0)
                horizontalAlignment: Text.AlignRight
                elide: Text.ElideRight
                text: root.statusText
                font.pixelSize: Theme.fontSizeSmall
                color: root.statusColor
            }
        }

        StyledText {
            visible: root.failed && root.source.error.length > 0
            width: parent.width
            text: root.source.error
            wrapMode: Text.Wrap
            maximumLineCount: root.compact ? 2 : 6
            elide: Text.ElideRight
            font.pixelSize: Theme.fontSizeSmall
            color: Theme.error
        }

        StyledText {
            visible: !root.compact && root.source.state === "ok" && root.source.warning.length > 0
            width: parent.width
            text: root.source.warning
            wrapMode: Text.Wrap
            maximumLineCount: 4
            elide: Text.ElideRight
            font.pixelSize: Theme.fontSizeSmall
            color: root.source.partial ? Theme.warning : Theme.surfaceVariantText
        }

        StyledText {
            visible: root.source.state === "disabled" && root.source.reason.length > 0
            width: parent.width
            text: root.source.reason
            wrapMode: Text.Wrap
            font.pixelSize: Theme.fontSizeSmall
            color: Theme.surfaceVariantText
        }

        Column {
            visible: root.count > 0
            width: parent.width
            spacing: Theme.spacingXXS

            Repeater {
                model: root.source.state === "disabled" ? [] : root.source.items

                delegate: UpdateRow {
                    width: parent.width
                    item: modelData
                }
            }
        }

        Column {
            visible: root.showBump
            width: parent.width
            spacing: Theme.spacingXXS
            topPadding: Theme.spacingXS

            StyledText {
                width: parent.width
                text: I18n.trFor("cachyUpdates", "Beyond configured versions (not counted)")
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Theme.fontWeightMedium
                color: Theme.surfaceVariantText
            }

            Repeater {
                model: root.showBump ? root.source.bumpItems : []

                delegate: UpdateRow {
                    width: parent.width
                    item: modelData
                    dimmed: true
                }
            }
        }
    }
}
