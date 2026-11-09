import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Modules.Plugins
import qs.Services
import "logic/Updates.js" as U

// Single owner of update state. DMS instantiates it once per shell, independently of the
// bar widgets (one per screen) and of the dash tab (created only while shown). Views bind
// to its properties through PluginService.pluginDaemonInstances and call its functions.
// A PluginComponent without bar pills, as DMS daemons are; pluginId and pluginService are
// set by DMS when it creates it.
PluginComponent {
    id: root

    property var popoutService: null

    // Settings (see UpdatesSettings.qml)
    property int intervalMinutes: 60
    property int timeoutSeconds: 120
    // Empty: automatic (DMS terminal setting, then $TERMINAL, then an installed terminal)
    property string terminalCommand: ""
    property bool miseEnabled: true
    property bool miseBumpEnabled: true
    // "auto", "arch-update" (Arch-Update or Cachy-Update) or "direct" (AUR helper or pacman)
    property string updateMethodSetting: "auto"

    // State
    property var sources: U.emptySources()
    property var checkingIds: []
    property real lastRoundAt: 0
    property real nextCheckAt: 0
    property int errorStreak: 0
    property var runningUpdates: ({})
    property real now: Date.now()

    readonly property bool checking: checkingIds.length > 0
    readonly property int totalCount: U.countOf(sources)
    readonly property int systemCount: U.countOf(sources, U.SYSTEM_SOURCE_IDS)
    readonly property int miseCount: U.countOf(sources, ["mise"])
    readonly property int bumpCount: U.bumpCount(sources)
    readonly property bool hasErrors: U.hasErrors(sources)
    readonly property bool incomplete: U.incomplete(sources)
    readonly property bool neverChecked: U.neverChecked(sources)
    readonly property bool updateRunning: Object.keys(runningUpdates).length > 0
    // False when mise checks are off or the last check found no mise: "all" then runs the
    // system update alone, and the views hide the mise actions.
    readonly property bool miseInUse: miseEnabled && sources.mise.state !== "disabled"

    readonly property string scriptsDir: decodeURIComponent(Qt.resolvedUrl("scripts").toString().replace(/^file:\/\//, ""))
    // Terminal used for updates; see U.resolveTerminal.
    property var installedTerminals: null
    readonly property string dmsTerminal: SessionData.terminalOverride || ""
    readonly property string envTerminal: Quickshell.env("TERMINAL") || ""
    readonly property var terminalCandidates: U.terminalCandidates(dmsTerminal, envTerminal)
    readonly property var terminal: U.resolveTerminal({
        custom: terminalCommand,
        dmsOverride: dmsTerminal,
        envTerminal: envTerminal,
        installed: installedTerminals
    })
    readonly property string terminalDescription: texts.terminalDescription(terminal)

    // Update tools found by scripts/detect.sh, null until detected; see U.resolveUpdateMethod.
    property var updateTools: null
    readonly property var updateMethod: U.resolveUpdateMethod(updateMethodSetting, updateTools)
    readonly property string systemUpdateDescription: texts.systemUpdateDescription(updateMethod)
    readonly property string updateMethodNote: texts.fallbackNote(updateMethod)

    readonly property UpdateTexts texts: UpdateTexts {}

    readonly property real intervalMs: Math.max(5, intervalMinutes) * 60 * 1000
    readonly property var updateModes: ["system", "mise", "mise-bump", "all"]

    property var _pending: ({})
    property bool _recheckQueued: false

    // ---- Public API ---------------------------------------------------------------

    // Starts a check of every source. Returns false if one is already running.
    function checkNow(reason) {
        if (checking) {
            if (reason === "after-update")
                _recheckQueued = true;
            return false;
        }
        const ids = [];
        _pending = {};
        for (const id of U.SOURCE_IDS) {
            if (id === "mise" && !miseEnabled) {
                _pending.mise = {
                    state: "disabled",
                    reasonCode: "mise-disabled",
                    reason: "Disabled in plugin settings",
                    reasonArgs: [],
                    items: [],
                    bumpItems: []
                };
                continue;
            }
            ids.push(id);
        }
        checkingIds = ids;
        console.info("archUpdates: checking", ids.join(", "), "(" + (reason || "manual") + ")");
        for (const id of ids) {
            const argv = ["timeout", "-k", "10", String(timeoutSeconds), "bash", scriptsDir + "/check.sh", id];
            if (id === "mise" && miseBumpEnabled)
                argv.push("--bump");
            if (!processFor(id).start(argv))
                _onSourceFinished(id, 1, "", "busy\tThe previous check of this source is still running");
        }
        if (ids.length === 0)
            _commit();
        else
            watchdog.restart();
        return true;
    }

    // Opens a terminal running scripts/run-update.sh <mode>, outside DMS's cgroup so that
    // restarting or reloading DMS does not interrupt a transaction.
    function launch(mode) {
        if (!updateModes.includes(mode))
            return false;
        if (mode === "all" && !miseInUse)
            mode = "system";
        const term = terminal.argv;
        if (term.length === 0) {
            ToastService.showError(I18n.trFor("archUpdates", "No terminal found"), I18n.trFor("archUpdates", "Set a terminal in DMS settings, in $TERMINAL, or in the Arch Updates plugin settings."));
            return false;
        }
        // "env bash" rather than "bash": Ghostty injects its shell integration into commands
        // that start with a known shell name.
        const script = ["env", "bash", scriptsDir + "/run-update.sh", mode];
        if (mode === "system" || mode === "all")
            script.push(updateMethod.method);
        const argv = ["systemd-run", "--user", "--scope", "--collect", "--quiet"].concat(term, script);
        console.info("archUpdates: launching", JSON.stringify(argv));
        Quickshell.execDetached(argv);
        _setRunning(mode, true);
        return true;
    }

    function processFor(id) {
        switch (id) {
        case "repo":
            return repoProc;
        case "aur":
            return aurProc;
        case "flatpak":
            return flatpakProc;
        default:
            return miseProc;
        }
    }

    function statusJson() {
        const out = {
            total: totalCount,
            system: systemCount,
            mise: miseCount,
            miseBeyondConfig: bumpCount,
            checking: checking,
            incomplete: incomplete,
            updateRunning: updateRunning,
            lastCheck: lastRoundAt ? new Date(lastRoundAt).toISOString() : null,
            nextCheck: nextCheckAt ? new Date(nextCheckAt).toISOString() : null,
            terminal: {
                command: terminal.argv,
                description: terminalDescription
            },
            systemUpdate: {
                setting: updateMethodSetting,
                method: updateMethod.method,
                description: systemUpdateDescription,
                note: updateMethodNote || undefined,
                tools: updateTools
            },
            sources: {}
        };
        for (const id of U.SOURCE_IDS) {
            const s = sources[id];
            out.sources[id] = {
                state: s.state,
                updates: s.items.length,
                checkedAt: s.checkedAt ? new Date(s.checkedAt).toISOString() : null,
                error: texts.errorText(s) || undefined,
                warning: texts.warningText(s) || undefined,
                reason: texts.reasonText(s) || undefined
            };
        }
        return JSON.stringify(out, null, 2);
    }

    // ---- Internals ----------------------------------------------------------------

    function _onSourceFinished(id, exitCode, out, err) {
        if (!checkingIds.includes(id))
            return;
        const result = U.classifyResult(id, exitCode, out, err, timeoutSeconds);
        if (result.state === "error")
            console.warn("archUpdates:", id, "check failed:", result.error);
        _pending[id] = result;
        checkingIds = checkingIds.filter(x => x !== id);
        if (!checking)
            _commit();
    }

    // Results are applied together at the end of a round, so counts never jitter while
    // sources finish one by one.
    function _commit() {
        watchdog.stop();
        const t = Date.now();
        const next = {};
        for (const id of U.SOURCE_IDS)
            next[id] = _pending[id] ? U.mergeResult(sources[id], _pending[id], t) : sources[id];
        _pending = {};
        sources = next;
        now = t;
        lastRoundAt = t;
        errorStreak = U.hasErrors(next) ? errorStreak + 1 : 0;
        nextCheckAt = t + U.retryDelayMs(errorStreak, intervalMs);
        _persist();
        if (_recheckQueued) {
            _recheckQueued = false;
            recheckTimer.restart();
        }
    }

    function _setRunning(mode, running) {
        const next = Object.assign({}, runningUpdates);
        if (running)
            next[mode] = Date.now();
        else
            delete next[mode];
        runningUpdates = next;
    }

    function _persist() {
        if (!pluginService)
            return;
        pluginService.savePluginState(pluginId, "cache", {
            version: 1,
            sources: sources,
            lastRoundAt: lastRoundAt,
            errorStreak: errorStreak
        });
    }

    function _restore() {
        if (!pluginService)
            return;
        const cache = pluginService.loadPluginState(pluginId, "cache", null);
        if (!cache || cache.version !== 1)
            return;
        sources = U.restoreSources(cache.sources);
        lastRoundAt = Number(cache.lastRoundAt) || 0;
        errorStreak = Number(cache.errorStreak) || 0;
    }

    function _setting(key, fallback) {
        return pluginService ? pluginService.loadPluginData(pluginId, key, fallback) : fallback;
    }

    function _loadSettings() {
        intervalMinutes = parseInt(_setting("intervalMinutes", "60")) || 60;
        timeoutSeconds = parseInt(_setting("timeoutSeconds", "120")) || 120;
        terminalCommand = String(_setting("terminalCommand", "") || "");
        miseEnabled = _setting("miseEnabled", true) !== false;
        miseBumpEnabled = _setting("miseBumpEnabled", true) !== false;
        updateMethodSetting = String(_setting("updateMethod", "auto") || "auto");
    }

    function _schedule(minDelayMs) {
        const due = lastRoundAt + U.retryDelayMs(errorStreak, intervalMs);
        nextCheckAt = Math.max(Date.now() + minDelayMs, due);
    }

    // Fires close to nextCheckAt; the periodic tick is the fallback after suspend.
    onNextCheckAtChanged: {
        const delay = nextCheckAt - Date.now();
        if (delay > 0 && delay < 3600 * 1000) {
            dueTimer.interval = delay + 250;
            dueTimer.restart();
        }
    }

    function _tick() {
        now = Date.now();
        for (const mode in runningUpdates) {
            // The terminal reports when it ends; this only covers a lost report.
            if (now - runningUpdates[mode] > 6 * 3600 * 1000)
                _setRunning(mode, false);
        }
        if (!checking && nextCheckAt > 0 && now >= nextCheckAt)
            checkNow("scheduled");
    }

    function probeTerminals() {
        if (terminalProbe.running)
            return;
        terminalProbe.command = ["sh", "-c", 'for t in "$@"; do command -v "$t" >/dev/null 2>&1 && echo "$t"; done; exit 0', "probe"].concat(terminalCandidates);
        terminalProbe.running = true;
    }

    // Installed tools can change with any update, and the settings page asks again when shown.
    function detectTools() {
        if (!toolProbe.running)
            toolProbe.running = true;
    }

    onTerminalCandidatesChanged: probeTerminals()
    onIntervalMinutesChanged: if (lastRoundAt > 0) _schedule(5000)
    onMiseEnabledChanged: if (lastRoundAt > 0) _schedule(5000)
    onMiseBumpEnabledChanged: if (lastRoundAt > 0) _schedule(5000)

    Component.onCompleted: {
        _loadSettings();
        _restore();
        // Show cached results right away; check when they are due, but never sooner than
        // a short delay after startup so login and shell reloads stay light.
        _schedule(neverChecked ? 10 * 1000 : 45 * 1000);
        probeTerminals();
        detectTools();
        console.info("archUpdates: daemon started, next check", new Date(nextCheckAt).toLocaleTimeString());
    }

    Connections {
        target: root.pluginService
        function onPluginDataChanged(changedPluginId) {
            if (changedPluginId === root.pluginId)
                root._loadSettings();
        }
    }

    // A wall-clock tick rather than one long Timer: it stays correct across suspend.
    Timer {
        interval: 30 * 1000
        repeat: true
        running: true
        onTriggered: root._tick()
    }

    Timer {
        id: dueTimer
        repeat: false
        onTriggered: root._tick()
    }

    Timer {
        id: watchdog
        interval: (root.timeoutSeconds + 30) * 1000
        repeat: false
        onTriggered: {
            for (const id of root.checkingIds)
                root.processFor(id).abandon(124);
        }
    }

    Timer {
        id: recheckTimer
        interval: 3000
        repeat: false
        onTriggered: root.checkNow("after-update")
    }

    Process {
        id: terminalProbe
        running: false
        stdout: StdioCollector {
            onStreamFinished: {
                root.installedTerminals = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
                console.info("archUpdates: update terminal:", root.terminalDescription);
            }
        }
    }

    Process {
        id: toolProbe
        running: false
        command: ["bash", root.scriptsDir + "/detect.sh"]
        stdout: StdioCollector {
            onStreamFinished: {
                try {
                    root.updateTools = JSON.parse(text);
                    console.info("archUpdates: system update:", root.systemUpdateDescription);
                } catch (e) {
                    console.warn("archUpdates: could not detect update tools:", e.message);
                }
            }
        }
    }

    CheckProcess {
        id: repoProc
        onFinished: (exitCode, out, err) => root._onSourceFinished("repo", exitCode, out, err)
    }

    CheckProcess {
        id: aurProc
        onFinished: (exitCode, out, err) => root._onSourceFinished("aur", exitCode, out, err)
    }

    CheckProcess {
        id: flatpakProc
        onFinished: (exitCode, out, err) => root._onSourceFinished("flatpak", exitCode, out, err)
    }

    CheckProcess {
        id: miseProc
        onFinished: (exitCode, out, err) => root._onSourceFinished("mise", exitCode, out, err)
    }

    // dms ipc call archUpdates <function> [args]
    IpcHandler {
        target: "archUpdates"

        function check(): string {
            return root.checkNow("ipc") ? "checking" : "a check is already running";
        }

        function status(): string {
            return root.statusJson();
        }

        function update(mode: string): string {
            const wanted = mode || "all";
            const launched = wanted === "all" && !root.miseInUse ? "system (mise is not in use)" : wanted;
            return root.launch(wanted) ? "launched " + launched : "unknown mode; use system, mise, mise-bump or all";
        }

        // Called by scripts/run-update.sh
        function started(mode: string): string {
            root._setRunning(mode, true);
            return "ok";
        }

        function finished(mode: string, exitCode: string): string {
            root._setRunning(mode, false);
            console.info("archUpdates: update", mode, "finished with code", exitCode);
            recheckTimer.restart();
            root.detectTools();
            return "ok";
        }
    }
}
