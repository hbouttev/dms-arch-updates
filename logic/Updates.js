.pragma library

// Pure helpers shared by the daemon and the views. No QML or Quickshell APIs here,
// so tests/run.mjs can load this file under Node.

const SOURCE_IDS = ["repo", "aur", "flatpak", "mise"];
const SYSTEM_SOURCE_IDS = ["repo", "aur", "flatpak"];

const SOURCE_INFO = {
    repo: { label: "Repositories", icon: "inventory_2" },
    aur: { label: "AUR", icon: "deployed_code" },
    flatpak: { label: "Flatpak", icon: "apps" },
    mise: { label: "mise", icon: "construction" }
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
        error: "",
        warning: "",
        // true when the check succeeded but some entries could not be checked
        partial: false,
        reason: ""
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
            warning: String(s.warning || ""),
            partial: s.partial === true,
            reason: String(s.reason || "")
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

// check.sh prints {"outdated": <mise outdated --json>, "bump": <mise outdated --bump --json> | null}.
// Upgrades that only exist past the configured version request become bumpItems.
function parseMise(text) {
    const data = JSON.parse(String(text || "").trim() || "{}");
    const outdated = miseEntries(data.outdated);
    const byName = {};
    const items = outdated.map(t => {
        byName[t.name] = t;
        return { name: t.name, from: t.from, to: t.to, note: t.requested && t.requested !== "latest" ? `requested ${t.requested}` : "" };
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
    return { items, bumpItems };
}

function cleanLines(text) {
    return nonEmptyLines(text).map(l => l.replace(/^==>\s*ERROR:\s*/, "").replace(/^error:\s*/i, "").replace(/^mise\s+(WARN|ERROR)\s+/, ""));
}

function lastLines(text, count) {
    return cleanLines(text).slice(-count).join("\n");
}

// A warning summary, plus whether it means some updates could not be checked.
function summarizeWarnings(id, stderr) {
    const lines = cleanLines(stderr);
    if (!lines.length)
        return { warning: "", partial: false };
    const partial = lines.filter(l => /could not check|could not list/i.test(l));
    if (partial.length)
        return { warning: partial.join("\n"), partial: true };
    return { warning: lines.slice(-2).join("\n"), partial: false };
}

// Turns one check.sh run into a result: {state, items, bumpItems, error, warning, partial, reason}.
function classifyResult(id, exitCode, stdout, stderr, timeoutSec) {
    const result = { state: "ok", items: [], bumpItems: [], error: "", warning: "", partial: false, reason: "" };
    if (exitCode === EXIT_NOT_APPLICABLE)
        return Object.assign(result, { state: "disabled", reason: lastLines(stdout, 1) || "Not applicable" });
    if (exitCode === EXIT_TIMEOUT || exitCode === EXIT_KILLED)
        return Object.assign(result, { state: "error", error: "Timed out" + (timeoutSec ? ` after ${timeoutSec} s` : "") });
    if (exitCode !== EXIT_OK)
        return Object.assign(result, { state: "error", error: lastLines(stderr, 3) || `Exited with code ${exitCode}` });
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
        return Object.assign(result, { state: "error", error: `Could not parse output: ${e.message}` });
    }
    return Object.assign(result, summarizeWarnings(id, stderr));
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
            partial: !!result.partial
        });
    } else if (result.state === "disabled") {
        Object.assign(next, { state: "disabled", reason: result.reason, checkedAt: now });
    } else {
        const wasDisabled = prev.state === "disabled";
        Object.assign(next, {
            state: "error",
            error: result.error,
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

function formatAgo(ms, now) {
    if (!ms)
        return "never";
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60)
        return "just now";
    const m = Math.round(s / 60);
    if (m < 60)
        return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48)
        return `${h} h ago`;
    return `${Math.round(h / 24)} d ago`;
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

function formatTime(ms, now) {
    if (!ms)
        return "never";
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

const TERMINAL_SOURCE_LABELS = {
    custom: "custom command",
    dms: "DMS terminal setting",
    env: "$TERMINAL",
    detected: "first installed terminal"
};

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
// Returns {argv, name, source, note}; argv is empty when no terminal was found.
function resolveTerminal(opts) {
    const custom = splitArgs(opts.custom);
    if (custom.length)
        return { argv: custom, name: baseName(custom[0]), source: "custom", note: "" };

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
        return { argv: [...words, ...terminalExecArgs(words[0])], name: baseName(words[0]), source, note: "" };
    }

    const note = skipped.length ? `${skipped.join(", ")} not found` : "";
    const found = installed ? TERMINAL_FALLBACKS.find(p => installed.includes(p)) : undefined;
    if (found)
        return { argv: [found, ...terminalExecArgs(found)], name: found, source: "detected", note };
    return { argv: [], name: "", source: "none", note };
}

function describeTerminal(t) {
    if (!t?.argv.length)
        return "No terminal found" + (t?.note ? ` (${t.note})` : "");
    const text = `${t.name} (${TERMINAL_SOURCE_LABELS[t.source] || t.source})`;
    return t.note ? `${text}; ${t.note}` : text;
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
// resolves the method itself). Returns {method, label, aurHelper, flatpak, note}, where
// method is what run-update.sh receives and label names the command that will run.
function resolveUpdateMethod(setting, tools) {
    const wanted = UPDATE_METHODS.includes(setting) ? setting : "auto";
    if (!tools)
        return { method: wanted, label: "", aurHelper: "", flatpak: false, note: "" };
    const archUpdate = tools.archUpdate || "";
    if (wanted !== "direct" && archUpdate)
        return { method: "arch-update", label: archUpdateName(archUpdate), aurHelper: "", flatpak: false, note: "" };
    const aurHelper = tools.aurHelper || "";
    return {
        method: "direct",
        label: aurHelper ? `${aurHelper} -Syu` : "pacman -Syu",
        aurHelper,
        flatpak: !!tools.flatpak,
        note: wanted === "arch-update" ? `${archUpdateName("")} is not installed, so updates run directly` : ""
    };
}

// One line describing what the system update runs, for tooltips and the settings page.
function describeSystemUpdate(m) {
    if (!m?.label)
        return "System update: repositories, AUR and Flatpak";
    if (m.method === "arch-update")
        return `${m.label}: repositories, AUR and Flatpak, with Arch news and maintenance steps`;
    const what = m.aurHelper ? "repositories and AUR" : "repositories";
    return `${m.label} (${what})` + (m.flatpak ? ", then flatpak update" : "");
}

function escapeHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plural(n, one, many) {
    return n === 1 ? one : many;
}
