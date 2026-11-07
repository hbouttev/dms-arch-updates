import QtQuick
import qs.Common
import qs.DCommon.Widgets
import "logic/Updates.js" as U

// "System update method" on the settings page: one row per method, each saying what it runs.
// A choice that is not installed stays listed, greyed out and not selectable, with how to get
// it, so the option is discoverable. DMS's dropdown cannot disable a single entry.
Column {
    id: root

    // The PluginSettings page (to load and save) and the daemon (for the detected tools).
    required property var settings
    property var daemon: null

    readonly property string settingKey: "updateMethod"
    property string value: "auto"

    readonly property var tools: daemon ? daemon.updateTools : null
    readonly property UpdateTexts texts: UpdateTexts {}
    // Unknown until detected: then nothing is greyed out.
    readonly property bool archUpdateInstalled: !tools || !!tools.archUpdate

    readonly property var choices: [
        {
            value: "auto",
            title: I18n.trFor("archUpdates", "Automatic"),
            description: I18n.trFor("archUpdates", "Arch-Update or Cachy-Update when installed, otherwise direct.") + (tools ? " " + I18n.trFor("archUpdates", "Currently: %1.").arg(texts.systemUpdateDescription(U.resolveUpdateMethod("auto", tools))) : ""),
            available: true
        },
        {
            value: "arch-update",
            title: U.archUpdateName(tools ? tools.archUpdate : ""),
            description: archUpdateInstalled ? I18n.trFor("archUpdates", "Repositories, AUR and Flatpak, plus Arch news, pacnew files, orphan packages, package cache cleanup and reboot notices.") : I18n.trFor("archUpdates", "Not installed. Install arch-update from the AUR, or cachy-update on CachyOS, to use it."),
            available: archUpdateInstalled
        },
        {
            value: "direct",
            title: I18n.trFor("archUpdates", "Direct"),
            description: (tools ? texts.systemUpdateDescription(U.resolveUpdateMethod("direct", tools)) : I18n.trFor("archUpdates", "Your AUR helper's -Syu (repositories and AUR), or pacman -Syu, then flatpak update")) + ". " + I18n.trFor("archUpdates", "No news or maintenance steps."),
            available: true
        }
    ]

    function loadValue() {
        const v = String(settings.loadValue(settingKey, "auto") || "auto");
        value = U.UPDATE_METHODS.includes(v) ? v : "auto";
    }

    function choose(v) {
        if (v === value)
            return;
        value = v;
        settings.saveValue(settingKey, v);
    }

    width: parent.width
    spacing: Theme.spacingS

    Component.onCompleted: {
        loadValue();
        if (daemon)
            daemon.detectTools();
    }

    StyledText {
        width: parent.width
        text: I18n.trFor("archUpdates", "System update method")
        font.pixelSize: Theme.fontSizeMedium
        font.weight: Font.Medium
        color: Theme.surfaceText
    }

    StyledText {
        width: parent.width
        text: I18n.trFor("archUpdates", "What “Update all” and the system update button run. Checks are the same for every method.")
        wrapMode: Text.WordWrap
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.surfaceVariantText
    }

    Repeater {
        model: root.choices

        delegate: StyledRect {
            id: row

            required property var modelData
            readonly property bool selected: root.value === modelData.value

            width: root.width
            implicitHeight: rowContent.implicitHeight + Theme.spacingM * 2
            radius: Theme.cornerRadius
            color: selected ? Theme.surfaceContainerHighest : "transparent"
            opacity: modelData.available ? 1 : 0.5

            border.width: activeFocus ? Theme.focusRingWidth : 0
            border.color: Theme.focusRingColor

            activeFocusOnTab: modelData.available
            Keys.onSpacePressed: root.choose(modelData.value)
            Keys.onReturnPressed: root.choose(modelData.value)

            Accessible.role: Accessible.RadioButton
            Accessible.name: modelData.title
            Accessible.description: modelData.description
            Accessible.checked: selected
            Accessible.onPressAction: if (modelData.available) root.choose(modelData.value)

            Row {
                id: rowContent
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: Theme.spacingM
                anchors.rightMargin: Theme.spacingM
                spacing: Theme.spacingM

                DIcon {
                    anchors.verticalCenter: parent.verticalCenter
                    name: row.selected ? "radio_button_checked" : "radio_button_unchecked"
                    size: Theme.iconSize
                    color: row.selected ? Theme.primary : Theme.surfaceVariantText
                }

                Column {
                    width: parent.width - Theme.iconSize - parent.spacing
                    spacing: Theme.spacingXXS

                    StyledText {
                        width: parent.width
                        text: row.modelData.title
                        font.pixelSize: Theme.fontSizeMedium
                        color: Theme.surfaceText
                    }

                    StyledText {
                        width: parent.width
                        text: row.modelData.description
                        wrapMode: Text.WordWrap
                        font.pixelSize: Theme.fontSizeSmall
                        color: Theme.surfaceVariantText
                    }
                }
            }

            // Hover, press and focus feedback, and the click
            StateLayer {
                disabled: !row.modelData.available
                enabled: row.modelData.available
                focused: row.activeFocus
                stateColor: Theme.surfaceText
                onClicked: root.choose(row.modelData.value)
            }
        }
    }

    // The saved choice is no longer installed (it was removed after being chosen).
    StyledText {
        width: parent.width
        visible: text.length > 0
        text: root.daemon ? root.daemon.updateMethodNote : ""
        wrapMode: Text.WordWrap
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.warning
    }
}
