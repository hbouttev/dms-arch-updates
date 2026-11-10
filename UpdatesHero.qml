import QtQuick
import QtQuick.Layouts
import qs.Common
import qs.DCommon.Widgets

// The summary card on top of the popout and the dashboard tab, like the shell's hero cards
// (battery popout, Weather tab): an icon in an expressive shape, the status as a title, the
// check details and the refresh button. Tinted with the primary container color only when
// there is something to update, so it draws the eye only then. While a check runs, the shape
// becomes the shell's morphing loading indicator.
DCard {
    id: root

    property bool compact: false
    property bool ready: false
    property int total: 0
    property bool checking: false
    property bool incomplete: false
    property bool neverChecked: true
    // False while not on screen (the dash keeps its content alive when closed).
    property bool live: true
    property string titleText: ""
    property string subtitleText: ""

    signal refreshRequested

    readonly property bool hasUpdates: total > 0
    readonly property bool troubled: !hasUpdates && (incomplete || !ready)
    readonly property string iconName: hasUpdates ? "system_update_alt" : (troubled ? "error" : (neverChecked ? "schedule" : "check"))

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

            DMaterialShape {
                anchors.fill: parent
                visible: !root.checking
                shape: root.hasUpdates ? "cookie9" : "circle"
                color: root.hasUpdates ? Theme.primary : (root.troubled ? Theme.withAlpha(Theme.warning, 0.24) : Theme.secondaryContainer)

                DIcon {
                    anchors.centerIn: parent
                    name: root.iconName
                    size: Math.round(parent.width / 2)
                    color: root.hasUpdates ? Theme.onPrimary : (root.troubled ? Theme.warning : Theme.onSecondaryContainer)
                }
            }

            // Created only while checking on screen, like the shell's own loading indicators:
            // it paints its shapes once when created, and a copy kept hidden in the dashboard
            // could come back blank. The indicator's shape fills only 38/48 of its size, so it is
            // drawn larger to match the badge. No icon inside: the shapes shift as they morph,
            // and a still icon would look off-center, which is why the shell never adds one.
            // It takes the badge's color, so the badge comes alive rather than an accent
            // shape appearing for a routine check; the faint warning tint is too pale for it.
            Loader {
                id: indicator
                anchors.centerIn: parent
                width: Math.round(parent.width * 48 / 38)
                height: width
                active: root.checking && root.live
                sourceComponent: DLoadingIndicator {
                    size: indicator.width
                    color: root.hasUpdates ? Theme.primary : Theme.secondaryContainer
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

        // The badge shows the check running, so the button only greys out meanwhile.
        DRefreshButton {
            Layout.alignment: Qt.AlignVCenter
            visible: root.ready
            enabled: !root.checking
            iconColor: root.contentColor
            tooltipText: I18n.trFor("archUpdates", "Check for updates")
            onClicked: root.refreshRequested()
        }
    }
}
