.pragma library

// Pure helpers shared by the daemon and the views. No QML or Quickshell APIs here,
// so tests/run.mjs can load this file under Node.
//
// No user-facing wording either: functions return codes and values, and UpdateTexts.qml
// turns them into translatable text (I18n.trFor only works, and is only extracted, in QML).
// English text kept here is a fallback for unknown codes and for the status IPC.

const SOURCE_IDS = ["repo", "aur", "flatpak", "mise"];
const SYSTEM_SOURCE_IDS = ["repo", "aur", "flatpak"];

const SOURCE_ICONS = {
    repo: "inventory_2",
    aur: "deployed_code",
    flatpak: "apps",
    mise: "construction"
};

// Exit codes of scripts/check.sh and of timeout(1).
const EXIT_OK = 0;
const EXIT_NOT_APPLICABLE = 3;
const EXIT_TIMEOUT = 124;
const EXIT_KILLED = 137;

const SOURCE_STATES = ["ok", "error", "disabled", "unknown"];

function emptySource(id) {
    return {
        id,
        // "unknown": never checked; "ok": last check succeeded;
        // "error": last check failed (items are from the last success, if any);
        // "disabled": source does not apply (reason says why).
        state: "unknown",
        items: [],
        bumpItems: [],
        checkedAt: 0,
        attemptedAt: 0,
        // Why the last check failed: errorCode names a known failure (args fill it in) and
        // is empty when error holds the tool's own output, shown as is.
        error: "",
        errorCode: "",
        errorArgs: [],
        // Tool warnings, shown as is
        warning: "",
        // true when the check succeeded but some entries could not be checked
        partial: false,
        // mise: the list beyond the configured versions could not be fetched
        bumpFailed: false,
        // Why a disabled source does not apply (same code/args scheme as errors)
        reason: "",
        reasonCode: "",
        reasonArgs: []
    };
}

function emptySources() {
    const out = {};
    for (const id of SOURCE_IDS)
        out[id] = emptySource(id);
    return out;
}

// Restores persisted state, tolerating missing or malformed entries.
function restoreSources(saved) {
    const out = emptySources();
    if (!saved || typeof saved !== "object")
        return out;
    for (const id of SOURCE_IDS) {
        const s = saved[id];
        if (!s || typeof s !== "object")
            continue;
        Object.assign(out[id], {
            state: SOURCE_STATES.includes(s.state) ? s.state : "unknown",
            items: Array.isArray(s.items) ? s.items : [],
            bumpItems: Array.isArray(s.bumpItems) ? s.bumpItems : [],
            checkedAt: Number(s.checkedAt) || 0,
            attemptedAt: Number(s.attemptedAt) || 0,
            error: String(s.error || ""),
            errorCode: String(s.errorCode || ""),
            errorArgs: Array.isArray(s.errorArgs) ? s.errorArgs.map(String) : [],
            warning: String(s.warning || ""),
            partial: s.partial === true,
            bumpFailed: s.bumpFailed === true,
            reason: String(s.reason || ""),
            reasonCode: String(s.reasonCode || ""),
            reasonArgs: Array.isArray(s.reasonArgs) ? s.reasonArgs.map(String) : []
        });
    }
    return out;
}

function stripAnsi(text) {
    return String(text || "").replace(/\x1B\[[0-9;?]*[A-Za-z]/g, "");
}

function nonEmptyLines(text) {
    return stripAnsi(text).split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

// Parses pacman-style lines: "name 1.0-1 -> 1.1-1 [note]".
function parseArrowList(text) {
    return nonEmptyLines(text).map(line => {
        const parts = line.split(/\s+/);
        if (parts.indexOf("->") === 2)
            return { name: parts[0], from: parts[1], to: parts[3] || "", note: parts.slice(4).join(" ") };
        return { name: parts[0], from: "", to: "", note: parts.slice(1).join(" ") };
    });
}

function parseAur(text) {
    return parseArrowList(nonEmptyLines(text).filter(l => !/\[ignored\]$/.test(l)).join("\n"));
}

// Lines produced by check.sh: application \t name \t version \t branch \t installation
function parseFlatpak(text) {
    const items = [];
    for (const line of stripAnsi(text).split("\n")) {
        const [app, name, version, branch, inst] = line.split("\t").map(f => (f || "").trim());
        if (!app)
            continue;
        items.push({
            name: name || app,
            from: "",
            to: version || branch || "",
            note: [name ? app : "", inst].filter(x => x).join(" · ")
        });
    }
    return items;
}

function miseEntries(obj) {
    if (!obj || typeof obj !== "object")
        return [];
    return Object.keys(obj).sort().map(key => {
        const t = obj[key] || {};
        return {
            name: t.name || key,
            from: String(t.current || ""),
            to: String(t.latest || ""),
            requested: String(t.requested || ""),
            bump: String(t.bump ?? "")
        };
    });
}

// check.sh prints {"outdated": <mise outdated --json>, "bump": <mise outdated --bump --json> | null,
// "bumpFailed": bool}. Upgrades that only exist past the configured version request become
// bumpItems. Items carry `requested` when it is a pinned version, for the note shown.
function parseMise(text) {
    const data = JSON.parse(String(text || "").trim() || "{}");
    const outdated = miseEntries(data.outdated);
    const byName = {};
    const items = outdated.map(t => {
        byName[t.name] = t;
        return { name: t.name, from: t.from, to: t.to, note: "", requested: t.requested !== "latest" ? t.requested : "" };
    });
    const bumpItems = [];
    for (const t of miseEntries(data.bump)) {
        const within = byName[t.name];
        if (!t.bump && within)
            continue;
        if (within && within.to === t.to)
            continue;
        if (!t.bump && t.requested === "latest")
            continue;
        bumpItems.push({ name: t.name, from: t.from, to: t.to, note: t.bump ? `${t.requested} → ${t.bump}` : "" });
    }
    return { items, bumpItems, bumpFailed: data.bumpFailed === true };
}

function cleanLines(text) {
    return nonEmptyLines(text).map(l => l.replace(/^==>\s*ERROR:\s*/, "").replace(/^error:\s*/i, "").replace(/^mise\s+(WARN|ERROR)\s+/, ""));
}

function lastLines(text, count) {
    return cleanLines(text).slice(-count).join("\n");
}

// A coded message from check.sh: "code<TAB>English text[<TAB>argument...]", or null.
function parseCoded(line) {
    const m = /^([a-z][a-z0-9-]*)\t([^\t]*)((?:\t[^\t]*)*)$/.exec(String(line || "").trim());
    return m ? { code: m[1], text: m[2], args: m[3] ? m[3].slice(1).split("\t") : [] } : null;
}

// The last line of a script message, split into code, English text and arguments. A line
// that is not coded (a tool's own output) comes back with an empty code.
function scriptMessage(text, lines) {
    const all = stripAnsi(text).split("\n").map(l => l.replace(/\s+$/, "")).filter(l => l.trim().length > 0);
    const coded = parseCoded(all[all.length - 1]);
    if (coded)
        return coded;
    return { code: "", text: lastLines(text, lines), args: [] };
}

// A warning summary, plus whether it means some updates could not be checked.
function summarizeWarnings(id, stderr) {
    const lines = cleanLines(stderr);
    if (!lines.length)
        return { warning: "", partial: false };
    const partial = lines.filter(l => /could not check/i.test(l));
    if (partial.length)
        return { warning: partial.join("\n"), partial: true };
    return { warning: lines.slice(-2).join("\n"), partial: false };
}

function errorResult(result, code, text, args) {
    return Object.assign(result, { state: "error", errorCode: code, error: text, errorArgs: args.map(String) });
}

// Turns one check.sh run into a result: {state, items, bumpItems, error, errorCode, errorArgs,
// warning, partial, bumpFailed, reason, reasonCode, reasonArgs}.
function classifyResult(id, exitCode, stdout, stderr, timeoutSec) {
    const result = { state: "ok", items: [], bumpItems: [], error: "", errorCode: "", errorArgs: [], warning: "", partial: false, bumpFailed: false, reason: "", reasonCode: "", reasonArgs: [] };
    if (exitCode === EXIT_NOT_APPLICABLE) {
        const m = scriptMessage(stdout, 1);
        return Object.assign(result, { state: "disabled", reasonCode: m.code || (m.text ? "" : "not-applicable"), reason: m.text || "Not applicable", reasonArgs: m.args });
    }
    if (exitCode === EXIT_TIMEOUT || exitCode === EXIT_KILLED)
        return errorResult(result, "timeout", `Timed out after ${timeoutSec} s`, [timeoutSec]);
    if (exitCode !== EXIT_OK) {
        const m = scriptMessage(stderr, 3);
        if (!m.text)
            return errorResult(result, "exit", `Exited with code ${exitCode}`, [exitCode]);
        return errorResult(result, m.code, m.text, m.args);
    }
    try {
        if (id === "repo")
            result.items = parseArrowList(stdout);
        else if (id === "aur")
            result.items = parseAur(stdout);
        else if (id === "flatpak")
            result.items = parseFlatpak(stdout);
        else if (id === "mise")
            Object.assign(result, parseMise(stdout));
    } catch (e) {
        return errorResult(result, "parse", `Could not parse output: ${e.message}`, [e.message]);
    }
    Object.assign(result, summarizeWarnings(id, stderr));
    if (result.bumpFailed)
        result.partial = true;
    return result;
}

// Applies a check result to the previous source state. A failed check keeps the last
// successful items so the count never drops to a false "up to date".
function mergeResult(prev, result, now) {
    const next = emptySource(prev.id);
    next.attemptedAt = now;
    if (result.state === "ok") {
        Object.assign(next, {
            state: "ok",
            items: result.items,
            bumpItems: result.bumpItems || [],
            checkedAt: now,
            warning: result.warning || "",
            partial: !!result.partial,
            bumpFailed: !!result.bumpFailed
        });
    } else if (result.state === "disabled") {
        Object.assign(next, { state: "disabled", reason: result.reason || "", reasonCode: result.reasonCode || "", reasonArgs: result.reasonArgs || [], checkedAt: now });
    } else {
        const wasDisabled = prev.state === "disabled";
        Object.assign(next, {
            state: "error",
            error: result.error || "",
            errorCode: result.errorCode || "",
            errorArgs: result.errorArgs || [],
            items: wasDisabled ? [] : prev.items,
            bumpItems: wasDisabled ? [] : prev.bumpItems,
            checkedAt: wasDisabled ? 0 : prev.checkedAt
        });
    }
    return next;
}

function countOf(sources, ids = SOURCE_IDS) {
    let n = 0;
    for (const id of ids) {
        const s = sources?.[id];
        if (s && s.state !== "disabled")
            n += s.items.length;
    }
    return n;
}

function bumpCount(sources) {
    const s = sources?.mise;
    return s && s.state !== "disabled" ? s.bumpItems.length : 0;
}

function hasErrors(sources) {
    return SOURCE_IDS.some(id => sources?.[id]?.state === "error");
}

// True when some source failed or could only be checked partially.
function incomplete(sources) {
    return SOURCE_IDS.some(id => {
        const s = sources?.[id];
        return !!s && (s.state === "error" || (s.state === "ok" && s.partial));
    });
}

function errorIds(sources) {
    return SOURCE_IDS.filter(id => sources?.[id]?.state === "error");
}

// Oldest successful check among active sources; 0 when one was never checked.
function oldestCheck(sources) {
    const times = SOURCE_IDS.map(id => sources?.[id]).filter(s => s && s.state !== "disabled").map(s => s.checkedAt);
    return times.length ? Math.min(...times) : 0;
}

function neverChecked(sources) {
    return SOURCE_IDS.every(id => !sources?.[id] || sources[id].attemptedAt === 0);
}

// Delay before the next check after `errorStreak` consecutive rounds with failures.
function retryDelayMs(errorStreak, intervalMs) {
    if (errorStreak <= 0)
        return intervalMs;
    return Math.min(5 * 60 * 1000 * 2 ** Math.min(errorStreak - 1, 6), intervalMs);
}

// Time since `ms` as {unit, value}: unit is "never", "now", "minutes", "hours" or "days".
function elapsed(ms, now) {
    if (!ms)
        return { unit: "never", value: 0 };
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60)
        return { unit: "now", value: 0 };
    const m = Math.round(s / 60);
    if (m < 60)
        return { unit: "minutes", value: m };
    const h = Math.round(m / 60);
    if (h < 48)
        return { unit: "hours", value: h };
    return { unit: "days", value: Math.round(h / 24) };
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

// "HH:MM" today, "YYYY-MM-DD HH:MM" otherwise; empty for 0.
function formatTime(ms, now) {
    if (!ms)
        return "";
    const d = new Date(ms);
    const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    if (d.toDateString() === new Date(now || Date.now()).toDateString())
        return hm;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hm}`;
}

// Splits a user-supplied command prefix ("ghostty -e", "foot", "kitty --hold") into argv.
// Supports single and double quotes; no other shell syntax.
function splitArgs(text) {
    const args = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    const s = String(text || "");
    let m;
    while ((m = re.exec(s)) !== null)
        args.push(m[1] ?? m[2] ?? m[3]);
    return args;
}

// ---- Terminal selection -----------------------------------------------------------

// Arguments that make each terminal run the command that follows them. Unknown terminals
// get "-e", which most terminals accept.
const TERMINAL_EXEC_ARGS = {
    "ghostty": ["-e"],
    "kitty": [],
    "foot": [],
    "footclient": [],
    "alacritty": ["-e"],
    "wezterm": ["start", "--"],
    "konsole": ["-e"],
    "gnome-terminal": ["--"],
    "ptyxis": ["--"],
    "kgx": ["--"],
    "xfce4-terminal": ["-x"],
    "terminator": ["-x"],
    "tilix": ["-x"],
    "st": ["-e"],
    "urxvt": ["-e"],
    "rio": ["-e"],
    "xterm": ["-e"],
    "xdg-terminal-exec": []
};

// Tried in order when neither DMS nor $TERMINAL names an installed terminal.
// The order after xdg-terminal-exec matches DMS's own terminal list.
const TERMINAL_FALLBACKS = ["xdg-terminal-exec", "ghostty", "kitty", "foot", "alacritty", "wezterm", "konsole", "gnome-terminal", "ptyxis", "xfce4-terminal", "xterm"];

function baseName(path) {
    const s = String(path || "");
    return s.substring(s.lastIndexOf("/") + 1);
}

function terminalExecArgs(program) {
    const args = TERMINAL_EXEC_ARGS[baseName(program)];
    return args ? args.slice() : ["-e"];
}

// Programs worth probing with `command -v`: the fallbacks plus whatever DMS and
// $TERMINAL name.
function terminalCandidates(dmsOverride, envTerminal) {
    const first = [splitArgs(dmsOverride)[0], splitArgs(envTerminal)[0]].filter(p => p);
    return [...new Set([...first, ...TERMINAL_FALLBACKS])];
}

// Picks the terminal command prefix. Order: the plugin's custom command, the DMS terminal
// setting, $TERMINAL, then the first installed fallback. `installed` lists the programs
// found on PATH, or is null while unknown (then nothing is skipped).
// Returns {argv, name, source, missing}: source is "custom", "dms", "env", "detected" or
// "none" (argv empty); missing lists configured terminals that are not installed.
function resolveTerminal(opts) {
    const custom = splitArgs(opts.custom);
    if (custom.length)
        return { argv: custom, name: baseName(custom[0]), source: "custom", missing: [] };

    const installed = opts.installed ?? null;
    const skipped = [];
    for (const [command, source] of [[opts.dmsOverride, "dms"], [opts.envTerminal, "env"]]) {
        const words = splitArgs(command);
        if (!words.length)
            continue;
        if (installed && !installed.includes(words[0])) {
            skipped.push(words[0]);
            continue;
        }
        return { argv: [...words, ...terminalExecArgs(words[0])], name: baseName(words[0]), source, missing: skipped };
    }

    const found = installed ? TERMINAL_FALLBACKS.find(p => installed.includes(p)) : undefined;
    if (found)
        return { argv: [found, ...terminalExecArgs(found)], name: found, source: "detected", missing: skipped };
    return { argv: [], name: "", source: "none", missing: skipped };
}

// ---- System update method ---------------------------------------------------------

// Setting values. "arch-update" covers Cachy-Update, CachyOS's fork of the same script.
const UPDATE_METHODS = ["auto", "arch-update", "direct"];

function archUpdateName(command) {
    if (command === "cachy-update")
        return "Cachy-Update";
    if (command === "arch-update")
        return "Arch-Update";
    return "Arch-Update / Cachy-Update";
}

// Resolves the update-method setting against the tools scripts/detect.sh found:
// {archUpdate, aurHelper, flatpak}, or null while not detected yet (the update script then
// resolves the method itself). Returns {method, label, aurHelper, flatpak, fallback}, where
// method is what run-update.sh receives, label names the command that will run (a command
// or product name, not translated), and fallback is true when the chosen tool is missing.
function resolveUpdateMethod(setting, tools) {
    const wanted = UPDATE_METHODS.includes(setting) ? setting : "auto";
    if (!tools)
        return { method: wanted, label: "", aurHelper: "", flatpak: false, fallback: false };
    const archUpdate = tools.archUpdate || "";
    if (wanted !== "direct" && archUpdate)
        return { method: "arch-update", label: archUpdateName(archUpdate), aurHelper: "", flatpak: false, fallback: false };
    const aurHelper = tools.aurHelper || "";
    return {
        method: "direct",
        label: aurHelper ? `${aurHelper} -Syu` : "pacman -Syu",
        aurHelper,
        flatpak: !!tools.flatpak,
        fallback: wanted === "arch-update"
    };
}

function escapeHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plural(n, one, many) {
    return n === 1 ? one : many;
}
