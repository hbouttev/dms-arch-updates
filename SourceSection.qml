import QtQuick
import qs.Common
import qs.DCommon.Widgets
import "logic/Updates.js" as U

// One update source (repositories, AUR, Flatpak or mise): status line, problems and the
// list of available updates. The sources form one grouped list, like the shell's own update
// list: each is a segment, with the outer corners rounded on the first and last.
DListRow {
    id: root

    property string sourceId: ""
    property var source: U.emptySource(sourceId)
    property bool checking: false
    property bool compact: false
    property real now: Date.now()
    // False while the view is not on screen (the dash keeps its content alive when closed).
    property bool live: true

    readonly property UpdateTexts texts: UpdateTexts {}
    readonly property string errorText: texts.errorText(source)
    readonly property string warningText: texts.warningText(source)
    readonly property string reasonText: texts.reasonText(source)
    readonly property int count: source.state === "disabled" ? 0 : source.items.length
    readonly property bool failed: source.state === "error"
    readonly property bool stale: failed && source.checkedAt > 0
    readonly property bool showBump: !compact && sourceId === "mise" && source.state !== "disabled" && source.bumpItems.length > 0

    readonly property string statusText: {
        if (checking)
            return I18n.trFor("archUpdates", "Checking…");
        switch (source.state) {
        case "unknown":
            return I18n.trFor("archUpdates", "Not checked yet");
        case "disabled":
            return I18n.trFor("archUpdates", "Not used");
        case "error":
            return stale ? I18n.trFor("archUpdates", "Check failed · last success %1").arg(U.formatTime(source.checkedAt, now)) : I18n.trFor("archUpdates", "Check failed");
        default:
            return count > 0 ? U.formatTime(source.checkedAt, now) : I18n.trFor("archUpdates", "Up to date · %1").arg(U.formatTime(source.checkedAt, now));
        }
    }

    readonly property color statusColor: failed ? Theme.error : (source.partial ? Theme.warning : supportingContentColor)

    width: parent ? parent.width : 0
    implicitHeight: content.implicitHeight + Theme.spacingM * 2

    Column {
        id: content
        x: Theme.spacingL
        y: Theme.spacingM
        width: parent.width - Theme.spacingL * 2
        spacing: Theme.spacingS

        Item {
            width: parent.width
            height: Math.max(sourceIcon.height, titleText.implicitHeight)

            DIcon {
                id: sourceIcon
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                name: U.SOURCE_ICONS[root.sourceId] || "help"
                size: Theme.iconSizeMedium
                color: root.count > 0 ? Theme.primary : root.supportingContentColor
            }

            StyledText {
                id: titleText
                anchors.left: sourceIcon.right
                anchors.leftMargin: Theme.spacingS
                anchors.verticalCenter: parent.verticalCenter
                text: root.texts.sourceLabel(root.sourceId)
                font.pixelSize: Theme.fontSizeMedium
                font.weight: Theme.fontWeightMedium
                color: root.contentColor
            }

            DBadge {
                id: countBadge
                visible: root.count > 0
                anchors.left: titleText.right
                anchors.leftMargin: Theme.spacingS
                anchors.verticalCenter: parent.verticalCenter
                text: String(root.count)
            }

            // While checking, the spinner alone takes the status's place: the hero card says
            // "Checking…" in words, and each source finishes on its own.
            DSpinner {
                visible: root.checking
                running: visible && root.live
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                size: Theme.iconSizeSmall
                Accessible.role: Accessible.ProgressBar
                Accessible.name: root.statusText
            }

            StyledText {
                id: statusLabel
                visible: !root.checking
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.left: countBadge.visible ? countBadge.right : titleText.right
                anchors.leftMargin: Theme.spacingM
                horizontalAlignment: Text.AlignRight
                elide: Text.ElideRight
                text: root.statusText
                font.pixelSize: Theme.fontSizeSmall
                color: root.statusColor
            }
        }

        StyledText {
            visible: root.failed && root.errorText.length > 0
            width: parent.width
            text: root.errorText
            wrapMode: Text.Wrap
            maximumLineCount: root.compact ? 2 : 6
            elide: Text.ElideRight
            font.pixelSize: Theme.fontSizeSmall
            color: Theme.error
        }

        StyledText {
            visible: !root.compact && root.source.state === "ok" && root.warningText.length > 0
            width: parent.width
            text: root.warningText
            wrapMode: Text.Wrap
            maximumLineCount: 4
            elide: Text.ElideRight
            font.pixelSize: Theme.fontSizeSmall
            color: root.source.partial ? Theme.warning : root.supportingContentColor
        }

        StyledText {
            visible: root.source.state === "disabled" && root.reasonText.length > 0
            width: parent.width
            text: root.reasonText
            wrapMode: Text.Wrap
            font.pixelSize: Theme.fontSizeSmall
            color: root.supportingContentColor
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
                text: I18n.trFor("archUpdates", "Beyond configured versions (not counted)")
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Theme.fontWeightMedium
                color: root.supportingContentColor
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
