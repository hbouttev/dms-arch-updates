#!/usr/bin/env bash
# Checks one update source without changing the system.
#
#   check.sh repo|aur|flatpak     system sources, following arch-update.conf (NoAUR, NoFlatpak, AURHelper)
#                                 like Arch-Update / Cachy-Update
#   check.sh mise [--bump]        tools from the global mise config
#
# Exit status protocol (read by UpdatesDaemon.qml / logic/Updates.js):
#   0  success: stdout holds the available updates (possibly none); stderr holds warnings
#   3  source does not apply here: stdout holds the reason, as a coded message
#   *  failure: stderr holds the tool's own error output, or a coded message
# Coded messages are "code<TAB>English text[<TAB>argument...]" (see coded in common.sh).
#
# Output formats:
#   repo, aur  "name old -> new" per line (pacman style)
#   flatpak    "application<TAB>name<TAB>version<TAB>branch<TAB>installation" per line
#   mise       {"outdated": <mise outdated --json>, "bump": <mise outdated --bump --json> | null,
#               "bumpFailed": true when --bump was asked for but could not be listed}
#
# The caller wraps this script in timeout(1).

set -u

source_id="${1:-}"
shift || true

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

work_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/dms-arch-updates"
mkdir -p "$work_dir" || exit 1
err_file="$(mktemp "$work_dir/stderr.XXXXXX")" || exit 1
trap 'rm -f "$err_file"' EXIT

# skip <code> <English text> [argument...]: the source does not apply here.
skip() {
	coded "$@"
	exit 3
}

# skip_with <coded message>: same, with a message from a common.sh function.
skip_with() {
	printf '%s\n' "$1"
	exit 3
}

# fail <code> <English text> [argument...]: reports the tool's error output if it printed
# any, otherwise this coded message.
fail() {
	local detail
	detail="$(sed -e 's/\x1B\[[0-9;?]*[A-Za-z]//g' -e '/^[[:space:]]*$/d' "$err_file" | tail -n 3)"
	if [[ -n "$detail" ]]; then
		printf '%s\n' "$detail" >&2
	else
		coded "$@" >&2
	fi
	exit 1
}

check_repo() {
	command -v checkupdates > /dev/null || fail checkupdates-missing "checkupdates not found (install pacman-contrib)"
	local out rc
	# A private, persistent sync database: incremental syncs, and no lock contention with
	# pacman, Arch-Update or other checkupdates users.
	out="$(LC_ALL=C CHECKUPDATES_DB="$work_dir/checkup-db" checkupdates --nocolor 2> "$err_file")"
	rc=$?
	case "$rc" in
		0) printf '%s\n' "$out" ;;
		2) ;; # no updates
		*) fail checkupdates-failed "checkupdates exited with code $rc" "$rc" ;;
	esac
}

check_aur() {
	local helper out rc
	helper="$(aur_helper)" || skip_with "$helper"

	out="$(LC_ALL=C "$helper" --color never -Qua < /dev/null 2> "$err_file")"
	rc=$?
	# Helpers exit 1 both for "nothing to upgrade" and for failures; only stderr tells them apart.
	if [[ $rc -ne 0 ]] && grep -Eqi 'error|fail|cannot|unable|timeout|timed out|refused|could not|no such host' "$err_file"; then
		fail aur-check-failed "$helper -Qua exited with code $rc" "$helper" "$rc"
	fi
	printf '%s\n' "$out" | sed -e 's/^ *//' -e 's/ \+/ /g' | grep -vw '\[ignored\]$' | sed '/^$/d'
	[[ -s "$err_file" ]] && cat "$err_file" >&2
	return 0
}

check_flatpak() {
	conf_flag NoFlatpak && skip no-flatpak-config "Disabled by NoFlatpak in arch-update.conf"
	command -v flatpak > /dev/null || skip flatpak-missing "Flatpak is not installed"

	local inst out any=0 app fname version branch pattern
	local -a masks
	for inst in user system; do
		[[ -n "$(flatpak list --"$inst" --columns=application 2> /dev/null)" ]] || continue
		any=1
		mapfile -t masks < <(flatpak mask --"$inst" 2> /dev/null | tr -d ' ' | sed '/^$/d')
		out="$(flatpak remote-ls --"$inst" --updates --columns=application,name,version,branch 2> "$err_file")" \
			|| fail flatpak-check-failed "flatpak remote-ls --$inst --updates failed" "$inst"
		while IFS=$'\t' read -r app fname version branch; do
			[[ -n "$app" ]] || continue
			for pattern in "${masks[@]}"; do
				# shellcheck disable=SC2053
				[[ "$app" == $pattern ]] && continue 2
			done
			printf '%s\t%s\t%s\t%s\t%s\n' "$app" "$fname" "$version" "$branch" "$inst"
		done <<< "$out"
	done
	[[ $any -eq 1 ]] || skip no-flatpak-apps "No Flatpak applications installed"
}

check_mise() {
	command -v mise > /dev/null || skip mise-missing "mise is not installed"
	# --global ignores project configs; running from $HOME also avoids trust prompts for
	# whatever directory DMS happens to run in.
	cd "$HOME" || cd /

	local outdated bump="null" bump_failed=false
	outdated="$(mise outdated --global --json 2> "$err_file")" || fail mise-check-failed "mise outdated exited with an error"
	[[ -n "$outdated" ]] || outdated="{}"
	if [[ "${1:-}" == "--bump" ]]; then
		if ! bump="$(mise outdated --global --bump --json 2>> "$err_file")" || [[ -z "$bump" ]]; then
			bump="null"
			bump_failed=true
		fi
	fi
	printf '{"outdated":%s,"bump":%s,"bumpFailed":%s}\n' "$outdated" "$bump" "$bump_failed"
	[[ -s "$err_file" ]] && cat "$err_file" >&2
	return 0
}

case "$source_id" in
	repo) check_repo ;;
	aur) check_aur ;;
	flatpak) check_flatpak ;;
	mise) check_mise "$@" ;;
	*)
		echo "usage: check.sh repo|aur|flatpak|mise [--bump]" >&2
		exit 64
		;;
esac
