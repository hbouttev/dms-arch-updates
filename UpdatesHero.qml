import QtQuick
import QtQuick.Layouts
import qs.Common
import qs.DCommon.Widgets

// The summary card on top of the popout and the dashboard tab, like the shell's hero cards
// (battery popout, Weather tab): an icon in an expressive shape, the status as a title, the
// check details and the refresh button. Tinted with the primary container color only when
// there is something to update, so it draws the eye only then.
DCard {
    id: root

    property bool compact: false
    property bool ready: false
    property int total: 0
    property bool checking: false
    property bool incomplete: false
    property bool neverChecked: true
    property string titleText: ""
    property string subtitleText: ""

    signal refreshRequested

    readonly property bool hasUpdates: total > 0
    readonly property bool troubled: !hasUpdates && (incomplete || !ready)

    tone: hasUpdates ? "primary" : ""
    restRadius: Theme.cornerRadiusLarge
    pad: compact ? Theme.spacingM : Theme.spacingL
    implicitHeight: row.implicitHeight + pad * 2
    Accessible.name: titleText
    Accessible.description: subtitleText

    RowLayout {
        id: row
        width: parent.width
        spacing: root.compact ? Theme.spacingM : Theme.spacingL

        Item {
            Layout.alignment: Qt.AlignVCenter
            Layout.preferredWidth: Math.round(Theme.iconSize * (root.compact ? 2.5 : 3.5))
            Layout.preferredHeight: Layout.preferredWidth

            // Cookie shape while updates wait, a plain circle otherwise.
            DMaterialShape {
                anchors.fill: parent
                shape: root.hasUpdates ? "cookie9" : "circle"
                color: root.hasUpdates ? Theme.primary : (root.troubled ? Theme.withAlpha(Theme.warning, 0.24) : Theme.secondaryContainer)

                DIcon {
                    anchors.centerIn: parent
                    name: root.hasUpdates ? "system_update_alt" : (root.troubled ? "error" : (root.neverChecked ? "schedule" : "check"))
                    size: Math.round(parent.width / 2)
                    color: root.hasUpdates ? Theme.onPrimary : (root.troubled ? Theme.warning : Theme.onSecondaryContainer)
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignVCenter
            spacing: Theme.spacingXXS

            StyledText {
                Layout.fillWidth: true
                text: root.titleText
                wrapMode: Text.Wrap
                font.pixelSize: Theme.fontSizeXLarge
                font.weight: Theme.fontWeightMedium
                color: root.troubled ? Theme.warning : root.contentColor
            }

            StyledText {
                Layout.fillWidth: true
                visible: text.length > 0
                text: root.subtitleText
                wrapMode: Text.Wrap
                font.pixelSize: Theme.fontSizeSmall
                color: root.mutedColor
            }
        }

        DRefreshButton {
            Layout.alignment: Qt.AlignVCenter
            visible: root.ready
            busy: root.checking
            iconColor: root.contentColor
            tooltipText: I18n.trFor("archUpdates", "Check for updates")
            onClicked: root.refreshRequested()
        }
    }
}
