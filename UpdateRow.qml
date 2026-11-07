import QtQuick
import qs.Common
import qs.DCommon.Widgets
import "logic/Updates.js" as U

// "name    1.0-1 → 1.1-1" with an optional dim note.
Item {
    id: root

    property var item: ({})
    property bool dimmed: false

    readonly property UpdateTexts texts: UpdateTexts {}
    readonly property string note: texts.itemNote(item)

    readonly property string versions: {
        const from = item.from || "";
        const to = item.to || "";
        if (from && to)
            return from + " → " + to;
        return to || from;
    }

    implicitHeight: Math.max(nameText.implicitHeight, versionText.implicitHeight) + Theme.spacingXXS * 2

    StyledText {
        id: nameText
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: Math.min(implicitWidth, parent.width * 0.55)
        elide: Text.ElideRight
        text: root.note ? U.escapeHtml(root.item.name) + "&nbsp;&nbsp;<font color=\"" + Theme.surfaceVariantText + "\">" + U.escapeHtml(root.note) + "</font>" : root.item.name
        textFormat: root.note ? Text.StyledText : Text.PlainText
        font.pixelSize: Theme.fontSizeSmall
        color: root.dimmed ? Theme.surfaceVariantText : Theme.surfaceText
    }

    StyledText {
        id: versionText
        anchors.right: parent.right
        anchors.left: nameText.right
        anchors.leftMargin: Theme.spacingM
        anchors.verticalCenter: parent.verticalCenter
        horizontalAlignment: Text.AlignRight
        elide: Text.ElideLeft
        text: root.versions
        font.pixelSize: Theme.fontSizeSmall
        font.family: Theme.monoFontFamily
        color: Theme.surfaceVariantText
    }
}
