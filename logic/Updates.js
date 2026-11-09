.pragma library

// Pure helpers shared by the daemon and the views. No QML or Quickshell APIs here,
// so tests/run.mjs can load this file under Node.
//
// No user-facing wording either: functions return codes and values, and UpdateTexts.qml
// turns them into translatable text (I18n.trFor only works, and is only extracted, in QML).
// English text kept here is a fallback for unknown codes and for the status IPC.
//
// Types are written as JSDoc for editors and `tsc --checkJs`; QML ignores them.

// ---- Types ------------------------------------------------------------------------

/**
 * An update source, each checked by `scripts/check.sh <id>`.
 * @typedef {"repo" | "aur" | "flatpak" | "mise"} SourceId
 */

/**
 * State of a source:
 * - "unknown": never checked;
 * - "ok": the last check succeeded;
 * - "error": the last check failed (items are from the last success, if any);
 * - "disabled": the source does not apply (`reason` says why).
 * @typedef {"unknown" | "ok" | "error" | "disabled"} SourceState
 */

/**
 * One available update, as listed in the views.
 * @typedef {object} UpdateItem
 * @property {string} name package, application or tool
 * @property {string} from installed version, empty when the source does not say
 * @property {string} to available version (for Flatpak, the branch when there is no version)
 * @property {string} note shown after the name: repository tag, Flatpak id and installation,
 *     or the mise request a bump would change
 * @property {string} [requested] mise: the pinned version request, empty for "latest"
 */

/**
 * Everything known about one source; persisted in DMS's plugin state.
 *
 * Messages come as a code with arguments, which UpdateTexts.qml translates, plus English
 * text used when the code is empty or unknown (a tool's own output has no code).
 * @typedef {object} Source
 * @property {SourceId} id
 * @property {SourceState} state
 * @property {UpdateItem[]} items updates within the configured versions; counted
 * @property {UpdateItem[]} bumpItems mise upgrades past the configured versions; listed only
 * @property {number} checkedAt time of the last successful check (ms), 0 when never
 * @property {number} attemptedAt time of the last check, successful or not (ms), 0 when never
 * @property {string} error why the last check failed, in English or as the tool printed it
 * @property {string} errorCode known failure, e.g. "timeout" or "aur-check-failed"; empty
 *     when `error` is a tool's own output
 * @property {string[]} errorArgs values for the error message
 * @property {string} warning tool warnings, shown as is
 * @property {boolean} partial the check succeeded but some entries could not be checked
 * @property {boolean} bumpFailed mise: the list past the configured versions could not be
 *     fetched
 * @property {string} reason why a disabled source does not apply, in English
 * @property {string} reasonCode e.g. "no-aur" or "mise-missing"
 * @property {string[]} reasonArgs values for the reason message
 */

/**
 * All sources by id: the daemon's `sources` property.
 * @typedef {Record<SourceId, Source>} Sources
 */

/**
 * One check.sh run turned into data, from {@link classifyResult}; {@link mergeResult}
 * applies it to the previous {@link Source}.
 * @typedef {object} CheckResult
 * @property {"ok" | "error" | "disabled"} state
 * @property {UpdateItem[]} items
 * @property {UpdateItem[]} bumpItems
 * @property {string} error
 * @property {string} errorCode
 * @property {string[]} errorArgs
 * @property {string} warning
 * @property {boolean} partial
 * @property {boolean} bumpFailed
 * @property {string} reason
 * @property {string} reasonCode
 * @property {string[]} reasonArgs
 */

/**
 * A message from the scripts, from {@link parseCoded}: `code<TAB>English text[<TAB>arg…]`.
 * @typedef {object} CodedMessage
 * @property {string} code empty when the message is a tool's own output
 * @property {string} text English text, or the tool's output
 * @property {string[]} args
 */

/**
 * One tool in the JSON of `mise outdated --json`, keyed by tool name.
 * @typedef {object} MiseOutdated
 * @property {string} [name]
 * @property {string} [current] installed version
 * @property {string} [latest] newest version allowed by the request (with --bump: the newest)
 * @property {string} [requested] version request in the config, e.g. "latest" or "22"
 * @property {string | null} [bump] with --bump: the request a bump would write
 */

/**
 * A {@link MiseOutdated} entry with every field present.
 * @typedef {object} MiseEntry
 * @property {string} name
 * @property {string} from
 * @property {string} to
 * @property {string} requested
 * @property {string} bump empty when the upgrade needs no bump
 */

/**
 * Time since an event, from {@link elapsed}; UpdateTexts.qml words it.
 * @typedef {object} Elapsed
 * @property {"never" | "now" | "minutes" | "hours" | "days"} unit
 * @property {number} value 0 for "never" and "now"
 */

/**
 * Where the update terminal comes from, in {@link resolveTerminal}'s order; "none" when no
 * terminal was found.
 * @typedef {"custom" | "dms" | "env" | "detected" | "none"} TerminalSource
 */

/**
 * Inputs of {@link resolveTerminal}.
 * @typedef {object} TerminalOptions
 * @property {string} [custom] the plugin's "Terminal command" setting
 * @property {string} [dmsOverride] DMS's terminal setting
 * @property {string} [envTerminal] $TERMINAL
 * @property {string[] | null} [installed] candidates found on PATH, null while unknown
 */

/**
 * The terminal update commands open in, from {@link resolveTerminal}.
 * @typedef {object} Terminal
 * @property {string[]} argv prefix the update command is appended to; empty when none
 * @property {string} name program name, for display
 * @property {TerminalSource} source
 * @property {string[]} missing configured terminals that are not installed
 */

/**
 * The "System update method" setting. "arch-update" covers Cachy-Update, CachyOS's fork
 * of the same script.
 * @typedef {"auto" | "arch-update" | "direct"} UpdateMethod
 */

/**
 * Update tools found by scripts/detect.sh.
 * @typedef {object} UpdateTools
 * @property {string} archUpdate "cachy-update", "arch-update" or empty
 * @property {string} aurHelper "paru", "yay", "pikaur" or empty
 * @property {string} [aurNote] why there is no AUR helper, in English
 * @property {boolean} flatpak Flatpak is installed and in use
 */

/**
 * What a system update will run, from {@link resolveUpdateMethod}.
 * @typedef {object} ResolvedUpdateMethod
 * @property {UpdateMethod} method passed to run-update.sh; "auto" only while the tools are
 *     not detected yet (the script then resolves it itself)
 * @property {string} label command or product name that will run (not translated), empty
 *     while unknown
 * @property {string} aurHelper the AUR helper a direct update uses, empty for pacman
 * @property {boolean} flatpak a direct update also runs `flatpak update`
 * @property {boolean} fallback Arch-Update was chosen but is not installed
 */

// ---- Sources ----------------------------------------------------------------------

/** @type {SourceId[]} */
const SOURCE_IDS = ["repo", "aur", "flatpak", "mise"];
/** @type {SourceId[]} */
const SYSTEM_SOURCE_IDS = ["repo", "aur", "flatpak"];

/**
 * Material Symbols icon of each source.
 * @type {Record<SourceId, string>}
 */
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

/** @type {SourceState[]} */
const SOURCE_STATES = ["ok", "error", "disabled", "unknown"];

/**
 * A source that was never checked. The fields are described on {@link Source}.
 * @param {SourceId} id
 * @returns {Source}
 */
function emptySource(id) {
    return {
        id,
        state: "unknown",
        items: [],
        bumpItems: [],
        checkedAt: 0,
        attemptedAt: 0,
        error: "",
        errorCode: "",
        errorArgs: [],
        warning: "",
        partial: false,
        bumpFailed: false,
        reason: "",
        reasonCode: "",
        reasonArgs: []
    };
}

/** @returns {Sources} */
function emptySources() {
    const out = /** @type {Sources} */ ({});
    for (const id of SOURCE_IDS)
        out[id] = emptySource(id);
    return out;
}

/**
 * Restores persisted state, tolerating missing or malformed entries.
 * @param {unknown} saved what plugin state returned: normally a {@link Sources}, but read
 *     from disk, so anything
 * @returns {Sources}
 */
function restoreSources(saved) {
    const out = emptySources();
    if (!saved || typeof saved !== "object")
        return out;
    for (const id of SOURCE_IDS) {
        /** @type {any} */
        const s = /** @type {Record<string, unknown>} */ (saved)[id];
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

// ---- Parsing check output ---------------------------------------------------------

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
function stripAnsi(text) {
    return String(text || "").replace(/\x1B\[[0-9;?]*[A-Za-z]/g, "");
}

/**
 * @param {string} text
 * @returns {string[]} trimmed lines, without ANSI codes and empty lines
 */
function nonEmptyLines(text) {
    return stripAnsi(text).split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

/**
 * Parses pacman-style lines: "name 1.0-1 -> 1.1-1 [note]".
 * @param {string} text
 * @returns {UpdateItem[]}
 */
function parseArrowList(text) {
    return nonEmptyLines(text).map(line => {
        const parts = line.split(/\s+/);
        if (parts.indexOf("->") === 2)
            return { name: parts[0], from: parts[1], to: parts[3] || "", note: parts.slice(4).join(" ") };
        return { name: parts[0], from: "", to: "", note: parts.slice(1).join(" ") };
    });
}

/**
 * Parses `<helper> -Qua`: pacman-style lines, minus the ones marked [ignored].
 * @param {string} text
 * @returns {UpdateItem[]}
 */
function parseAur(text) {
    return parseArrowList(nonEmptyLines(text).filter(l => !/\[ignored\]$/.test(l)).join("\n"));
}

/**
 * Parses the lines check.sh prints for Flatpak:
 * application \t name \t version \t branch \t installation
 * @param {string} text
 * @returns {UpdateItem[]}
 */
function parseFlatpak(text) {
    /** @type {UpdateItem[]} */
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

/**
 * @param {Record<string, MiseOutdated> | null | undefined} obj JSON of `mise outdated --json`
 * @returns {MiseEntry[]} sorted by tool name
 */
function miseEntries(obj) {
    if (!obj || typeof obj !== "object")
        return [];
    return Object.keys(obj).sort().map(key => {
        /** @type {MiseOutdated} */
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

/**
 * Parses the mise check. check.sh prints {"outdated": <mise outdated --json>,
 * "bump": <mise outdated --bump --json> | null, "bumpFailed": bool}. Upgrades that only exist
 * past the configured version request become bumpItems. Items carry `requested` when it is a
 * pinned version, for the note shown.
 * @param {string} text
 * @returns {{ items: UpdateItem[], bumpItems: UpdateItem[], bumpFailed: boolean }}
 * @throws {SyntaxError} when the output is not JSON
 */
function parseMise(text) {
    /** @type {{ outdated?: Record<string, MiseOutdated>, bump?: Record<string, MiseOutdated> | null, bumpFailed?: boolean }} */
    const data = JSON.parse(String(text || "").trim() || "{}");
    const outdated = miseEntries(data.outdated);
    /** @type {Record<string, MiseEntry>} */
    const byName = {};
    const items = outdated.map(t => {
        byName[t.name] = t;
        return { name: t.name, from: t.from, to: t.to, note: "", requested: t.requested !== "latest" ? t.requested : "" };
    });
    /** @type {UpdateItem[]} */
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

// ---- Messages and results ---------------------------------------------------------

/**
 * Non-empty lines without the tools' "error:" / "==> ERROR:" / "mise WARN" prefixes.
 * @param {string} text
 * @returns {string[]}
 */
function cleanLines(text) {
    return nonEmptyLines(text).map(l => l.replace(/^==>\s*ERROR:\s*/, "").replace(/^error:\s*/i, "").replace(/^mise\s+(WARN|ERROR)\s+/, ""));
}

/**
 * @param {string} text
 * @param {number} count
 * @returns {string} the last `count` clean lines, joined
 */
function lastLines(text, count) {
    return cleanLines(text).slice(-count).join("\n");
}

/**
 * A coded message from check.sh: "code<TAB>English text[<TAB>argument...]", or null.
 * @param {string | undefined} line
 * @returns {CodedMessage | null}
 */
function parseCoded(line) {
    const m = /^([a-z][a-z0-9-]*)\t([^\t]*)((?:\t[^\t]*)*)$/.exec(String(line || "").trim());
    return m ? { code: m[1], text: m[2], args: m[3] ? m[3].slice(1).split("\t") : [] } : null;
}

/**
 * The last line of a script message, split into code, English text and arguments. A line
 * that is not coded (a tool's own output) comes back with an empty code.
 * @param {string} text stdout or stderr of a check
 * @param {number} lines how many lines of uncoded output to keep
 * @returns {CodedMessage}
 */
function scriptMessage(text, lines) {
    const all = stripAnsi(text).split("\n").map(l => l.replace(/\s+$/, "")).filter(l => l.trim().length > 0);
    const coded = parseCoded(all[all.length - 1]);
    if (coded)
        return coded;
    return { code: "", text: lastLines(text, lines), args: [] };
}

/**
 * The warning and error lines of a successful mise check. Its other stderr output (progress,
 * an uninstall running at the same time) is not a warning. Its notices about a newer mise
 * are left out too: the plugin follows the tools, and mise itself is updated with the
 * system or by `mise self-update`, not by `mise upgrade`.
 * @param {string} stderr
 * @returns {string}
 */
function miseWarnings(stderr) {
    return nonEmptyLines(stderr)
        .filter(l => /^mise\s+(WARN|ERROR)\s/.test(l))
        .filter(l => !/^mise\s+WARN\s+(mise version \S+ available|self-update is disabled)/.test(l))
        .join("\n");
}

/**
 * A warning summary, plus whether it means some updates could not be checked.
 * @param {string} stderr
 * @returns {{ warning: string, partial: boolean }}
 */
function summarizeWarnings(stderr) {
    const lines = cleanLines(stderr);
    if (!lines.length)
        return { warning: "", partial: false };
    const partial = lines.filter(l => /could not check/i.test(l));
    if (partial.length)
        return { warning: partial.join("\n"), partial: true };
    return { warning: lines.slice(-2).join("\n"), partial: false };
}

/**
 * Marks `result` as failed.
 * @param {CheckResult} result
 * @param {string} code
 * @param {string} text English message
 * @param {(string | number)[]} args
 * @returns {CheckResult} `result`
 */
function errorResult(result, code, text, args) {
    return Object.assign(result, { state: "error", errorCode: code, error: text, errorArgs: args.map(String) });
}

/**
 * Turns one check.sh run into a result.
 * @param {SourceId} id
 * @param {number} exitCode check.sh's exit code: 0 ok, 3 not applicable, 124 or 137 timed
 *     out, anything else failed
 * @param {string} stdout
 * @param {string} stderr
 * @param {number} timeoutSec the timeout the check ran under, for the message
 * @returns {CheckResult}
 */
function classifyResult(id, exitCode, stdout, stderr, timeoutSec) {
    /** @type {CheckResult} */
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
        const message = e instanceof Error ? e.message : String(e);
        return errorResult(result, "parse", `Could not parse output: ${message}`, [message]);
    }
    Object.assign(result, summarizeWarnings(id === "mise" ? miseWarnings(stderr) : stderr));
    if (result.bumpFailed)
        result.partial = true;
    return result;
}

/**
 * Applies a check result to the previous source state. A failed check keeps the last
 * successful items so the count never drops to a false "up to date".
 * @param {Source} prev
 * @param {CheckResult} result
 * @param {number} now time of the check (ms)
 * @returns {Source} a new object; `prev` is not changed
 */
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

// ---- Summaries --------------------------------------------------------------------
// They accept missing sources: views can evaluate them before the daemon exists.

/**
 * Number of updates counted for the bar: items of the given sources, disabled ones excluded.
 * @param {Sources | null | undefined} sources
 * @param {SourceId[]} [ids]
 * @returns {number}
 */
function countOf(sources, ids = SOURCE_IDS) {
    let n = 0;
    for (const id of ids) {
        const s = sources?.[id];
        if (s && s.state !== "disabled")
            n += s.items.length;
    }
    return n;
}

/**
 * Number of mise upgrades past the configured versions (not counted for the bar).
 * @param {Sources | null | undefined} sources
 * @returns {number}
 */
function bumpCount(sources) {
    const s = sources?.mise;
    return s && s.state !== "disabled" ? s.bumpItems.length : 0;
}

/**
 * @param {Sources | null | undefined} sources
 * @returns {boolean} some source failed its last check
 */
function hasErrors(sources) {
    return SOURCE_IDS.some(id => sources?.[id]?.state === "error");
}

/**
 * True when some source failed or could only be checked partially.
 * @param {Sources | null | undefined} sources
 * @returns {boolean}
 */
function incomplete(sources) {
    return SOURCE_IDS.some(id => {
        const s = sources?.[id];
        return !!s && (s.state === "error" || (s.state === "ok" && s.partial));
    });
}

/**
 * @param {Sources | null | undefined} sources
 * @returns {boolean} no source was ever checked
 */
function neverChecked(sources) {
    return SOURCE_IDS.every(id => !sources?.[id] || sources[id].attemptedAt === 0);
}

// ---- Time -------------------------------------------------------------------------

/**
 * Delay before the next check after `errorStreak` consecutive rounds with failures: 5, 10,
 * 20… minutes, capped at the interval.
 * @param {number} errorStreak
 * @param {number} intervalMs the check interval
 * @returns {number} ms
 */
function retryDelayMs(errorStreak, intervalMs) {
    if (errorStreak <= 0)
        return intervalMs;
    return Math.min(5 * 60 * 1000 * 2 ** Math.min(errorStreak - 1, 6), intervalMs);
}

/**
 * Time since `ms`, rounded to the unit shown.
 * @param {number} ms time of the event, 0 for never
 * @param {number} now
 * @returns {Elapsed}
 */
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

/**
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
    return String(n).padStart(2, "0");
}

/**
 * "HH:MM" today, "YYYY-MM-DD HH:MM" otherwise; empty for 0.
 * @param {number} ms
 * @param {number} [now] defaults to the current time
 * @returns {string}
 */
function formatTime(ms, now) {
    if (!ms)
        return "";
    const d = new Date(ms);
    const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    if (d.toDateString() === new Date(now || Date.now()).toDateString())
        return hm;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hm}`;
}

/**
 * Splits a user-supplied command prefix ("ghostty -e", "foot", "kitty --hold") into argv.
 * Supports single and double quotes; no other shell syntax.
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
function splitArgs(text) {
    /** @type {string[]} */
    const args = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    const s = String(text || "");
    let m;
    while ((m = re.exec(s)) !== null)
        args.push(m[1] ?? m[2] ?? m[3]);
    return args;
}

// ---- Terminal selection -----------------------------------------------------------

/**
 * Arguments that make each terminal run the command that follows them. Unknown terminals
 * get "-e", which most terminals accept.
 * @type {Record<string, string[]>}
 */
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

/**
 * @param {string | null | undefined} path
 * @returns {string} the part after the last "/"
 */
function baseName(path) {
    const s = String(path || "");
    return s.substring(s.lastIndexOf("/") + 1);
}

/**
 * @param {string} program a terminal, as a name or a path
 * @returns {string[]} a copy of its arguments from {@link TERMINAL_EXEC_ARGS}
 */
function terminalExecArgs(program) {
    /** @type {string[] | undefined} */
    const args = TERMINAL_EXEC_ARGS[baseName(program)];
    return args ? args.slice() : ["-e"];
}

/**
 * Programs worth probing with `command -v`: the fallbacks plus whatever DMS and
 * $TERMINAL name.
 * @param {string} dmsOverride DMS's terminal setting
 * @param {string} envTerminal $TERMINAL
 * @returns {string[]}
 */
function terminalCandidates(dmsOverride, envTerminal) {
    const first = [splitArgs(dmsOverride)[0], splitArgs(envTerminal)[0]].filter(p => p);
    return [...new Set([...first, ...TERMINAL_FALLBACKS])];
}

/**
 * Picks the terminal command prefix. Order: the plugin's custom command, the DMS terminal
 * setting, $TERMINAL, then the first installed fallback. While `installed` is unknown,
 * nothing is skipped.
 * @param {TerminalOptions} opts
 * @returns {Terminal}
 */
function resolveTerminal(opts) {
    const custom = splitArgs(opts.custom);
    if (custom.length)
        return { argv: custom, name: baseName(custom[0]), source: "custom", missing: [] };

    const installed = opts.installed ?? null;
    /** @type {string[]} */
    const skipped = [];
    /** @type {[string | undefined, TerminalSource][]} */
    const configured = [[opts.dmsOverride, "dms"], [opts.envTerminal, "env"]];
    for (const [command, source] of configured) {
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

/** @type {UpdateMethod[]} */
const UPDATE_METHODS = ["auto", "arch-update", "direct"];

/**
 * @param {string | null | undefined} command "cachy-update", "arch-update", or empty while
 *     unknown or not installed
 * @returns {string} product name, not translated
 */
function archUpdateName(command) {
    if (command === "cachy-update")
        return "Cachy-Update";
    if (command === "arch-update")
        return "Arch-Update";
    return "Arch-Update / Cachy-Update";
}

/**
 * Resolves the update-method setting against the tools scripts/detect.sh found.
 * @param {string} setting saved value; anything but an {@link UpdateMethod} means "auto"
 * @param {UpdateTools | null} tools null while not detected yet (the update script then
 *     resolves the method itself)
 * @returns {ResolvedUpdateMethod}
 */
function resolveUpdateMethod(setting, tools) {
    const wanted = UPDATE_METHODS.find(m => m === setting) ?? "auto";
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

// ---- Rich text --------------------------------------------------------------------

/**
 * Escapes text for a StyledText with Text.StyledText formatting.
 * @param {string | null | undefined} text
 * @returns {string}
 */
function escapeHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
