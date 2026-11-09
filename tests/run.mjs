// Tests for logic/Updates.js. Run: node tests/run.mjs
// The file is a QML ".pragma library" script; it is loaded here without QML.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const src = readFileSync(fileURLToPath(new URL("../logic/Updates.js", import.meta.url)), "utf8").replace(/^\.pragma library\s*$/m, "");
const names = [...src.matchAll(/^(?:function|const|let|var)\s+([A-Za-z_]\w*)/gm)].map(m => m[1]);
const U = new Function(`${src}\nreturn { ${names.join(", ")} };`)();

let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log("ok  ", name);
    } catch (e) {
        failed++;
        console.log("FAIL", name);
        console.log(e.message);
    }
}

test("parses pacman style lists", () => {
    const items = U.parseArrowList("linux 6.1-1 -> 6.2-1\n\nmesa 1:24.0-1 -> 1:24.1-1 [extra]\n");
    assert.deepEqual(items, [
        { name: "linux", from: "6.1-1", to: "6.2-1", note: "" },
        { name: "mesa", from: "1:24.0-1", to: "1:24.1-1", note: "[extra]" }
    ]);
});

test("drops ignored AUR packages and ANSI codes", () => {
    const items = U.parseAur("\x1b[1mfoo\x1b[0m 1-1 -> 2-1\nbar 1-1 -> 2-1 [ignored]\n");
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "foo");
});

test("parses flatpak lines", () => {
    const items = U.parseFlatpak("org.gnome.Calculator\tCalculator\t46.1\tstable\tsystem\norg.freedesktop.Platform\t\t\t23.08\tuser\n");
    assert.equal(items[0].name, "Calculator");
    assert.equal(items[0].to, "46.1");
    assert.equal(items[0].note, "org.gnome.Calculator · system");
    assert.equal(items[1].name, "org.freedesktop.Platform");
    assert.equal(items[1].to, "23.08");
});

test("parses mise and separates upgrades beyond the config", () => {
    const outdated = {
        npm: { name: "npm", requested: "latest", current: "12.2.1", latest: "12.2.2", bump: null },
        node: { name: "node", requested: "20", current: "20.1.0", latest: "20.5.0", bump: null }
    };
    const bump = {
        npm: { name: "npm", requested: "latest", current: "12.2.1", latest: "12.2.2", bump: null },
        node: { name: "node", requested: "20", current: "20.1.0", latest: "22.1.0", bump: "22" },
        go: { name: "go", requested: "1.22.0", current: "1.22.0", latest: "1.23.4", bump: "1.23.4" }
    };
    const r = U.parseMise(JSON.stringify({ outdated, bump }));
    assert.deepEqual(r.items.map(i => i.name), ["node", "npm"]);
    assert.deepEqual(r.items.map(i => i.requested), ["20", ""]);
    assert.equal(r.bumpFailed, false);
    assert.deepEqual(r.bumpItems.map(i => [i.name, i.to, i.note]), [
        ["go", "1.23.4", "1.22.0 → 1.23.4"],
        ["node", "22.1.0", "20 → 22"]
    ]);
    assert.deepEqual(U.parseMise('{"outdated":{},"bump":null}'), { items: [], bumpItems: [], bumpFailed: false });
});

test("classifies exit codes", () => {
    assert.equal(U.classifyResult("repo", 0, "a 1 -> 2\n", "", 120).items.length, 1);
    const off = U.classifyResult("flatpak", 3, "no-flatpak-apps\tNo Flatpak applications installed\n", "", 120);
    assert.deepEqual([off.state, off.reasonCode, off.reason], ["disabled", "no-flatpak-apps", "No Flatpak applications installed"]);
    const helper = U.classifyResult("aur", 3, "aur-helper-missing\tAURHelper=paru is set\tparu\n", "", 120);
    assert.deepEqual([helper.reasonCode, helper.reasonArgs], ["aur-helper-missing", ["paru"]]);
    const plain = U.classifyResult("aur", 3, "Something else\n", "", 120);
    assert.deepEqual([plain.reasonCode, plain.reason], ["", "Something else"]);
    assert.equal(U.classifyResult("aur", 3, "", "", 120).reasonCode, "not-applicable");
    const to = U.classifyResult("aur", 124, "", "", 120);
    assert.deepEqual([to.state, to.errorCode, to.errorArgs], ["error", "timeout", ["120"]]);
    const err = U.classifyResult("repo", 1, "", "==> ERROR: Cannot fetch updates\n", 120);
    assert.deepEqual([err.errorCode, err.error], ["", "Cannot fetch updates"]);
    const coded = U.classifyResult("aur", 1, "", "aur-check-failed\tyay -Qua exited with code 2\tyay\t2\n", 120);
    assert.deepEqual([coded.errorCode, coded.errorArgs, coded.error], ["aur-check-failed", ["yay", "2"], "yay -Qua exited with code 2"]);
    const exit = U.classifyResult("repo", 1, "", "", 120);
    assert.deepEqual([exit.errorCode, exit.errorArgs], ["exit", ["1"]]);
    assert.equal(U.classifyResult("mise", 0, "not json", "", 120).errorCode, "parse");
});

test("flags partial mise results", () => {
    const r = U.classifyResult("mise", 0, '{"outdated":{},"bump":null}', "mise WARN  HTTP GET failed\nmise WARN  Could not check 1 tool for updates: aqua:npm/cli@12.2.1\n", 120);
    assert.equal(r.state, "ok");
    assert.equal(r.partial, true);
    assert.equal(r.warning, "Could not check 1 tool for updates: aqua:npm/cli@12.2.1");
    const bump = U.classifyResult("mise", 0, '{"outdated":{},"bump":null,"bumpFailed":true}', "", 120);
    assert.deepEqual([bump.partial, bump.bumpFailed, bump.warning], [true, true, ""]);
    const merged = U.mergeResult(U.emptySource("mise"), bump, 1000);
    assert.equal(merged.bumpFailed, true);
});

test("keeps only mise's warnings about tools", () => {
    const stdout = '{"outdated":{},"bump":null}';
    const progress = "mise uninstall aqua:pnpm/pnpm@12.17.0 remove ~/.cache/mise/pnpm/12.17.0\nmise uninstall aqua:pnpm/pnpm@12.17.0 ✓ done\n";
    const self = "mise WARN  mise version 2026.11.4 available\nmise WARN  self-update is disabled for this install, update mise the same way you installed it\n";
    assert.equal(U.classifyResult("mise", 0, stdout, progress + self, 120).warning, "");
    const r = U.classifyResult("mise", 0, stdout, progress + self + "mise WARN  HTTP GET failed\n", 120);
    assert.deepEqual([r.warning, r.partial], ["HTTP GET failed", false]);
    // Other sources keep their stderr as it is.
    assert.equal(U.classifyResult("aur", 0, "", "some note\n", 120).warning, "some note");
});

test("a failed check keeps the last successful items", () => {
    const ok = U.mergeResult(U.emptySource("repo"), U.classifyResult("repo", 0, "a 1 -> 2\nb 1 -> 2\n", "", 60), 1000);
    assert.equal(ok.state, "ok");
    assert.equal(ok.checkedAt, 1000);
    const failed = U.mergeResult(ok, U.classifyResult("repo", 1, "", "boom", 60), 2000);
    assert.equal(failed.state, "error");
    assert.equal(failed.items.length, 2);
    assert.equal(failed.checkedAt, 1000);
    assert.equal(failed.attemptedAt, 2000);
    const sources = Object.assign(U.emptySources(), { repo: failed });
    assert.equal(U.countOf(sources), 2);
    assert.equal(U.hasErrors(sources), true);
    assert.equal(U.incomplete(sources), true);
});

test("a failure right after being disabled shows nothing stale", () => {
    const off = U.mergeResult(U.emptySource("aur"), U.classifyResult("aur", 3, "No AUR helper", "", 60), 1000);
    const failed = U.mergeResult(off, U.classifyResult("aur", 1, "", "boom", 60), 2000);
    assert.equal(failed.items.length, 0);
    assert.equal(failed.checkedAt, 0);
});

test("counts exclude disabled sources and beyond-config mise upgrades", () => {
    const s = U.emptySources();
    s.repo = Object.assign(U.emptySource("repo"), { state: "ok", items: [{}, {}] });
    s.flatpak = Object.assign(U.emptySource("flatpak"), { state: "disabled", items: [{}] });
    s.mise = Object.assign(U.emptySource("mise"), { state: "ok", items: [{}], bumpItems: [{}, {}] });
    assert.equal(U.countOf(s), 3);
    assert.equal(U.countOf(s, U.SYSTEM_SOURCE_IDS), 2);
    assert.equal(U.bumpCount(s), 2);
});

test("restores persisted state defensively", () => {
    const r = U.restoreSources({ repo: { state: "ok", items: [{ name: "x" }], checkedAt: "5" }, aur: "junk", mise: { state: "weird" } });
    assert.equal(r.repo.items.length, 1);
    assert.equal(r.repo.checkedAt, 5);
    assert.equal(r.aur.state, "unknown");
    assert.equal(r.mise.state, "unknown");
    assert.equal(r.flatpak.state, "unknown");
    assert.equal(U.restoreSources(null).repo.state, "unknown");
});

test("retry delay backs off up to the interval", () => {
    const hour = 3600 * 1000;
    assert.equal(U.retryDelayMs(0, hour), hour);
    assert.equal(U.retryDelayMs(1, hour), 5 * 60 * 1000);
    assert.equal(U.retryDelayMs(2, hour), 10 * 60 * 1000);
    assert.equal(U.retryDelayMs(10, hour), hour);
});

test("splits terminal commands", () => {
    assert.deepEqual(U.splitArgs("ghostty -e"), ["ghostty", "-e"]);
    assert.deepEqual(U.splitArgs(`kitty --title "System updates" --hold`), ["kitty", "--title", "System updates", "--hold"]);
    assert.deepEqual(U.splitArgs("   "), []);
});

test("resolves the terminal like DMS, with a custom override", () => {
    const r = opts => U.resolveTerminal(Object.assign({ custom: "", dmsOverride: "", envTerminal: "", installed: null }, opts));
    assert.deepEqual(r({ envTerminal: "ghostty" }).argv, ["ghostty", "-e"]);
    assert.equal(r({ envTerminal: "ghostty" }).source, "env");
    assert.deepEqual(r({ dmsOverride: "foot", envTerminal: "ghostty" }).argv, ["foot"]);
    assert.equal(r({ dmsOverride: "foot", envTerminal: "ghostty" }).source, "dms");
    assert.deepEqual(r({ envTerminal: "/usr/bin/wezterm" }).argv, ["/usr/bin/wezterm", "start", "--"]);
    assert.deepEqual(r({ envTerminal: "kitty --single-instance" }).argv, ["kitty", "--single-instance"]);
    assert.deepEqual(r({ envTerminal: "myterm" }).argv, ["myterm", "-e"]);
    assert.deepEqual(r({ custom: "kitty --hold", envTerminal: "ghostty" }).argv, ["kitty", "--hold"]);
    assert.equal(r({ custom: "kitty --hold" }).source, "custom");
});

test("skips missing terminals and falls back to installed ones", () => {
    const r = opts => U.resolveTerminal(Object.assign({ custom: "", dmsOverride: "", envTerminal: "" }, opts));
    const t = r({ envTerminal: "ghostty", installed: ["foot", "xterm"] });
    assert.deepEqual(t.argv, ["foot"]);
    assert.equal(t.source, "detected");
    assert.deepEqual(t.missing, ["ghostty"]);
    assert.deepEqual(r({ installed: ["xdg-terminal-exec", "kitty"] }).argv, ["xdg-terminal-exec"]);
    const none = r({ installed: [] });
    assert.deepEqual([none.argv, none.source, none.missing], [[], "none", []]);
    assert.deepEqual(U.terminalCandidates("foot", "ghostty -x").slice(0, 3), ["foot", "ghostty", "xdg-terminal-exec"]);
});

test("resolves the system update method", () => {
    const cachy = { archUpdate: "cachy-update", aurHelper: "yay", flatpak: false };
    const arch = { archUpdate: "arch-update", aurHelper: "paru", flatpak: true };
    const bare = { archUpdate: "", aurHelper: "", flatpak: false };
    assert.deepEqual([U.resolveUpdateMethod("auto", cachy).method, U.resolveUpdateMethod("auto", cachy).label], ["arch-update", "Cachy-Update"]);
    assert.equal(U.resolveUpdateMethod("arch-update", arch).label, "Arch-Update");
    assert.equal(U.resolveUpdateMethod("direct", cachy).label, "yay -Syu");
    assert.equal(U.resolveUpdateMethod("auto", { archUpdate: "", aurHelper: "paru", flatpak: true }).label, "paru -Syu");
    const missing = U.resolveUpdateMethod("arch-update", bare);
    assert.deepEqual([missing.method, missing.label, missing.fallback], ["direct", "pacman -Syu", true]);
    assert.equal(U.resolveUpdateMethod("auto", bare).fallback, false);
    assert.equal(U.resolveUpdateMethod("bogus", cachy).method, "arch-update");
    const direct = U.resolveUpdateMethod("direct", { archUpdate: "arch-update", aurHelper: "paru", flatpak: true });
    assert.deepEqual([direct.label, direct.aurHelper, direct.flatpak], ["paru -Syu", "paru", true]);
    assert.deepEqual(U.resolveUpdateMethod("direct", null), { method: "direct", label: "", aurHelper: "", flatpak: false, fallback: false });
});

test("formats times", () => {
    const now = new Date(2026, 10, 6, 15, 0).getTime();
    assert.deepEqual(U.elapsed(0, now), { unit: "never", value: 0 });
    assert.deepEqual(U.elapsed(now - 30 * 1000, now), { unit: "now", value: 0 });
    assert.deepEqual(U.elapsed(now - 5 * 60 * 1000, now), { unit: "minutes", value: 5 });
    assert.deepEqual(U.elapsed(now - 3 * 3600 * 1000, now), { unit: "hours", value: 3 });
    assert.deepEqual(U.elapsed(now - 72 * 3600 * 1000, now), { unit: "days", value: 3 });
    assert.equal(U.formatTime(0, now), "");
    assert.equal(U.formatTime(new Date(2026, 10, 6, 9, 5).getTime(), now), "09:05");
    assert.equal(U.formatTime(new Date(2026, 10, 4, 9, 5).getTime(), now), "2026-11-04 09:05");
});

test("escapes notes rendered as rich text", () => {
    assert.equal(U.escapeHtml(`<b>"x" & y</b>`), "&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
});

// Codes for messages shown in the UI come from the scripts, logic/Updates.js and the daemon;
// UpdateTexts.qml must have a case for each, or the message would show untranslated.
test("every message code has a translation case", () => {
    const root = new URL("../", import.meta.url);
    const read = path => readFileSync(new URL(path, root), "utf8");
    const codes = new Set();
    for (const f of readdirSync(new URL("scripts/", root)).filter(f => f.endsWith(".sh"))) {
        for (const m of read(`scripts/${f}`).matchAll(/\b(?:coded|skip|fail)\s+([a-z][a-z0-9-]*)\s+"/g))
            codes.add(m[1]);
    }
    for (const m of read("logic/Updates.js").matchAll(/errorResult\(result,\s*"([a-z][a-z0-9-]*)"/g))
        codes.add(m[1]);
    codes.add("not-applicable");
    for (const m of read("UpdatesDaemon.qml").matchAll(/reasonCode:\s*"([a-z][a-z0-9-]*)"|"([a-z][a-z0-9-]*)\\t/g))
        codes.add(m[1] || m[2]);
    const cases = new Set([...read("UpdateTexts.qml").matchAll(/case "([a-z][a-z0-9-]*)":/g)].map(m => m[1]));
    assert.ok(codes.size >= 15, `found only ${codes.size} codes`);
    const missing = [...codes].filter(c => !cases.has(c));
    assert.deepEqual(missing, [], `codes without a translation case: ${missing.join(", ")}`);
});

if (failed) {
    console.log(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log("\nall tests passed");
