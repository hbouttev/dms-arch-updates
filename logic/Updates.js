.pragma library

// Pure helpers shared by the daemon and the views. No QML or Quickshell APIs here,
// so tests/run.mjs can load this file under Node.

var SOURCE_IDS = ["repo", "aur", "flatpak", "mise"];
var SYSTEM_SOURCE_IDS = ["repo", "aur", "flatpak"];

var SOURCE_INFO = {
    repo: { label: "Repositories", icon: "inventory_2" },
    aur: { label: "AUR", icon: "deployed_code" },
    flatpak: { label: "Flatpak", icon: "apps" },
    mise: { label: "mise", icon: "construction" }
};

// Exit codes of scripts/check.sh and of timeout(1).
var EXIT_OK = 0;
var EXIT_NOT_APPLICABLE = 3;
var EXIT_TIMEOUT = 124;
var EXIT_KILLED = 137;

function emptySource(id) {
    return {
        id: id,
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
    var out = {};
    SOURCE_IDS.forEach(function (id) {
        out[id] = emptySource(id);
    });
    return out;
}

// Restores persisted state, tolerating missing or malformed entries.
function restoreSources(saved) {
    var out = emptySources();
    if (!saved || typeof saved !== "object")
        return out;
    SOURCE_IDS.forEach(function (id) {
        var s = saved[id];
        if (!s || typeof s !== "object")
            return;
        var base = out[id];
        base.state = ["ok", "error", "disabled", "unknown"].indexOf(s.state) >= 0 ? s.state : "unknown";
        base.items = Array.isArray(s.items) ? s.items : [];
        base.bumpItems = Array.isArray(s.bumpItems) ? s.bumpItems : [];
        base.checkedAt = Number(s.checkedAt) || 0;
        base.attemptedAt = Number(s.attemptedAt) || 0;
        base.error = String(s.error || "");
        base.warning = String(s.warning || "");
        base.partial = s.partial === true;
        base.reason = String(s.reason || "");
    });
    return out;
}

function stripAnsi(text) {
    return String(text || "").replace(/\x1B\[[0-9;?]*[A-Za-z]/g, "");
}

function nonEmptyLines(text) {
    return stripAnsi(text).split("\n").map(function (l) {
        return l.trim();
    }).filter(function (l) {
        return l.length > 0;
    });
}

// Parses pacman-style lines: "name 1.0-1 -> 1.1-1 [note]".
function parseArrowList(text) {
    var items = [];
    nonEmptyLines(text).forEach(function (line) {
        var parts = line.split(/\s+/);
        var arrow = parts.indexOf("->");
        if (arrow === 2) {
            items.push({
                name: parts[0],
                from: parts[1],
                to: parts[3] || "",
                note: parts.slice(4).join(" ")
            });
        } else {
            items.push({ name: parts[0], from: "", to: "", note: parts.slice(1).join(" ") });
        }
    });
    return items;
}

function parseAur(text) {
    return parseArrowList(nonEmptyLines(text).filter(function (l) {
        return !/\[ignored\]$/.test(l);
    }).join("\n"));
}

// Lines produced by check.sh: application \t name \t version \t branch \t installation
function parseFlatpak(text) {
    var items = [];
    stripAnsi(text).split("\n").forEach(function (line) {
        if (!line.trim())
            return;
        var f = line.split("\t");
        var app = (f[0] || "").trim();
        if (!app)
            return;
        var name = (f[1] || "").trim();
        var version = (f[2] || "").trim();
        var branch = (f[3] || "").trim();
        var inst = (f[4] || "").trim();
        items.push({
            name: name || app,
            from: "",
            to: version || branch,
            note: [name ? app : "", inst].filter(function (x) {
                return x;
            }).join(" · ")
        });
    });
    return items;
}

function miseEntries(obj) {
    if (!obj || typeof obj !== "object")
        return [];
    return Object.keys(obj).sort().map(function (key) {
        var t = obj[key] || {};
        return {
            name: t.name || key,
            from: String(t.current || ""),
            to: String(t.latest || ""),
            requested: String(t.requested || ""),
            bump: t.bump === null || t.bump === undefined ? "" : String(t.bump)
        };
    });
}

// check.sh prints {"outdated": <mise outdated --json>, "bump": <mise outdated --bump --json> | null}.
// Upgrades that only exist past the configured version request become bumpItems.
function parseMise(text) {
    var data = JSON.parse(String(text || "").trim() || "{}");
    var outdated = miseEntries(data.outdated);
    var byName = {};
    var items = outdated.map(function (t) {
        byName[t.name] = t;
        return { name: t.name, from: t.from, to: t.to, note: t.requested && t.requested !== "latest" ? "requested " + t.requested : "" };
    });
    var bumpItems = [];
    miseEntries(data.bump).forEach(function (t) {
        var within = byName[t.name];
        if (!t.bump && within)
            return;
        if (within && within.to === t.to)
            return;
        if (!t.bump && t.requested === "latest")
            return;
        bumpItems.push({ name: t.name, from: t.from, to: t.to, note: t.bump ? t.requested + " → " + t.bump : "" });
    });
    return { items: items, bumpItems: bumpItems };
}

function cleanLines(text) {
    return nonEmptyLines(text).map(function (l) {
        return l.replace(/^==>\s*ERROR:\s*/, "").replace(/^error:\s*/i, "").replace(/^mise\s+(WARN|ERROR)\s+/, "");
    });
}

function lastLines(text, count) {
    return cleanLines(text).slice(-count).join("\n");
}

// A warning summary, plus whether it means some updates could not be checked.
function summarizeWarnings(id, stderr) {
    var lines = cleanLines(stderr);
    if (!lines.length)
        return { warning: "", partial: false };
    var partial = lines.filter(function (l) {
        return /could not check|could not list/i.test(l);
    });
    if (partial.length)
        return { warning: partial.join("\n"), partial: true };
    return { warning: lines.slice(-2).join("\n"), partial: false };
}

// Turns one check.sh run into a result: {state, items, bumpItems, error, warning, reason}.
function classifyResult(id, exitCode, stdout, stderr, timeoutSec) {
    var result = { state: "ok", items: [], bumpItems: [], error: "", warning: "", partial: false, reason: "" };
    if (exitCode === EXIT_NOT_APPLICABLE) {
        result.state = "disabled";
        result.reason = lastLines(stdout, 1) || "Not applicable";
        return result;
    }
    if (exitCode === EXIT_TIMEOUT || exitCode === EXIT_KILLED) {
        result.state = "error";
        result.error = "Timed out" + (timeoutSec ? " after " + timeoutSec + " s" : "");
        return result;
    }
    if (exitCode !== EXIT_OK) {
        result.state = "error";
        result.error = lastLines(stderr, 3) || "Exited with code " + exitCode;
        return result;
    }
    try {
        if (id === "repo")
            result.items = parseArrowList(stdout);
        else if (id === "aur")
            result.items = parseAur(stdout);
        else if (id === "flatpak")
            result.items = parseFlatpak(stdout);
        else if (id === "mise") {
            var m = parseMise(stdout);
            result.items = m.items;
            result.bumpItems = m.bumpItems;
        }
    } catch (e) {
        result.state = "error";
        result.error = "Could not parse output: " + e.message;
        return result;
    }
    var w = summarizeWarnings(id, stderr);
    result.warning = w.warning;
    result.partial = w.partial;
    return result;
}

// Applies a check result to the previous source state. A failed check keeps the last
// successful items so the count never drops to a false "up to date".
function mergeResult(prev, result, now) {
    var next = emptySource(prev.id);
    next.attemptedAt = now;
    if (result.state === "ok") {
        next.state = "ok";
        next.items = result.items;
        next.bumpItems = result.bumpItems || [];
        next.checkedAt = now;
        next.warning = result.warning || "";
        next.partial = !!result.partial;
    } else if (result.state === "disabled") {
        next.state = "disabled";
        next.reason = result.reason;
        next.checkedAt = now;
    } else {
        next.state = "error";
        next.error = result.error;
        next.items = prev.state === "disabled" ? [] : prev.items;
        next.bumpItems = prev.state === "disabled" ? [] : prev.bumpItems;
        next.checkedAt = prev.state === "disabled" ? 0 : prev.checkedAt;
    }
    return next;
}

function countOf(sources, ids) {
    var n = 0;
    (ids || SOURCE_IDS).forEach(function (id) {
        var s = sources && sources[id];
        if (s && s.state !== "disabled")
            n += s.items.length;
    });
    return n;
}

function bumpCount(sources) {
    var s = sources && sources.mise;
    return s && s.state !== "disabled" ? s.bumpItems.length : 0;
}

function hasErrors(sources) {
    return SOURCE_IDS.some(function (id) {
        return sources && sources[id] && sources[id].state === "error";
    });
}

// True when some source failed or could only be checked partially.
function incomplete(sources) {
    return SOURCE_IDS.some(function (id) {
        var s = sources && sources[id];
        return s && (s.state === "error" || (s.state === "ok" && s.partial));
    });
}

function errorIds(sources) {
    return SOURCE_IDS.filter(function (id) {
        return sources && sources[id] && sources[id].state === "error";
    });
}

// Oldest successful check among active sources; 0 when one was never checked.
function oldestCheck(sources) {
    var oldest = -1;
    SOURCE_IDS.forEach(function (id) {
        var s = sources && sources[id];
        if (!s || s.state === "disabled")
            return;
        if (oldest < 0 || s.checkedAt < oldest)
            oldest = s.checkedAt;
    });
    return oldest < 0 ? 0 : oldest;
}

function neverChecked(sources) {
    return SOURCE_IDS.every(function (id) {
        return !sources || !sources[id] || sources[id].attemptedAt === 0;
    });
}

// Delay before the next check after `errorStreak` consecutive rounds with failures.
function retryDelayMs(errorStreak, intervalMs) {
    if (errorStreak <= 0)
        return intervalMs;
    var delay = 5 * 60 * 1000 * Math.pow(2, Math.min(errorStreak - 1, 6));
    return Math.min(delay, intervalMs);
}

function formatAgo(ms, now) {
    if (!ms)
        return "never";
    var s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 60)
        return "just now";
    var m = Math.round(s / 60);
    if (m < 60)
        return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 48)
        return h + " h ago";
    return Math.round(h / 24) + " d ago";
}

function pad2(n) {
    return n < 10 ? "0" + n : String(n);
}

function formatTime(ms, now) {
    if (!ms)
        return "never";
    var d = new Date(ms);
    var hm = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    var n = new Date(now || Date.now());
    if (d.toDateString() === n.toDateString())
        return hm;
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + hm;
}

// Splits a user-supplied command prefix ("ghostty -e", "foot", "kitty --hold") into argv.
// Supports single and double quotes; no other shell syntax.
function splitArgs(text) {
    var args = [];
    var re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    var m;
    var s = String(text || "");
    while ((m = re.exec(s)) !== null)
        args.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
    return args;
}

function escapeHtml(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plural(n, one, many) {
    return n === 1 ? one : many;
}
