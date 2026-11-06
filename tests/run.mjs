// Tests for logic/Updates.js. Run: node tests/run.mjs
// The file is a QML ".pragma library" script; it is loaded here without QML.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const src = readFileSync(fileURLToPath(new URL("../logic/Updates.js", import.meta.url)), "utf8").replace(/^\.pragma library\s*$/m, "");
const names = [...src.matchAll(/^(?:function|var)\s+([A-Za-z_]\w*)/gm)].map(m => m[1]);
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
    assert.equal(r.items[0].note, "requested 20");
    assert.deepEqual(r.bumpItems.map(i => [i.name, i.to, i.note]), [
        ["go", "1.23.4", "1.22.0 → 1.23.4"],
        ["node", "22.1.0", "20 → 22"]
    ]);
    assert.deepEqual(U.parseMise('{"outdated":{},"bump":null}'), { items: [], bumpItems: [] });
});

test("classifies exit codes", () => {
    assert.equal(U.classifyResult("repo", 0, "a 1 -> 2\n", "", 120).items.length, 1);
    const off = U.classifyResult("flatpak", 3, "No Flatpak applications installed\n", "", 120);
    assert.equal(off.state, "disabled");
    assert.equal(off.reason, "No Flatpak applications installed");
    const to = U.classifyResult("aur", 124, "", "", 120);
    assert.equal(to.state, "error");
    assert.equal(to.error, "Timed out after 120 s");
    const err = U.classifyResult("repo", 1, "", "==> ERROR: Cannot fetch updates\n", 120);
    assert.equal(err.error, "Cannot fetch updates");
    assert.equal(U.classifyResult("repo", 1, "", "", 120).error, "Exited with code 1");
    assert.equal(U.classifyResult("mise", 0, "not json", "", 120).state, "error");
});

test("flags partial mise results", () => {
    const r = U.classifyResult("mise", 0, '{"outdated":{},"bump":null}', "mise WARN  HTTP GET failed\nmise WARN  Could not check 1 tool for updates: aqua:npm/cli@12.2.1\n", 120);
    assert.equal(r.state, "ok");
    assert.equal(r.partial, true);
    assert.equal(r.warning, "Could not check 1 tool for updates: aqua:npm/cli@12.2.1");
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

test("formats times", () => {
    const now = new Date(2026, 10, 6, 15, 0).getTime();
    assert.equal(U.formatAgo(0, now), "never");
    assert.equal(U.formatAgo(now - 30 * 1000, now), "just now");
    assert.equal(U.formatAgo(now - 5 * 60 * 1000, now), "5 min ago");
    assert.equal(U.formatAgo(now - 3 * 3600 * 1000, now), "3 h ago");
    assert.equal(U.formatTime(new Date(2026, 10, 6, 9, 5).getTime(), now), "09:05");
    assert.equal(U.formatTime(new Date(2026, 10, 4, 9, 5).getTime(), now), "2026-11-04 09:05");
});

test("escapes notes rendered as rich text", () => {
    assert.equal(U.escapeHtml(`<b>"x" & y</b>`), "&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
});

if (failed) {
    console.log(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log("\nall tests passed");
