#!/usr/bin/env bash
# Runs updates inside the terminal the plugin opened.
#
#   run-update.sh system [method]   system update (repositories, AUR, Flatpak)
#   run-update.sh mise              mise upgrade --global (stays within configured versions)
#   run-update.sh mise-bump         mise upgrade --global --bump (moves past configured versions)
#   run-update.sh all [method]      system, then mise if installed
#
# System update methods:
#   arch-update  Arch-Update, or Cachy-Update on CachyOS: also shows Arch news and handles
#                pacnew files, orphans, the package cache and reboot notices
#   direct       <AUR helper> -Syu (repositories and AUR) or sudo pacman -Syu, then
#                flatpak update when Flatpak is in use
#   auto         arch-update when installed, otherwise direct (default)
#
# The tools keep their normal output and prompts. The plugin is told when the run starts
# and ends (through DMS IPC) so it can re-check; if DMS is not running that is skipped.

set -u

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

mode="${1:-all}"
method="${2:-auto}"
ipc_target="archUpdates"
status=0

notify() {
	command -v dms > /dev/null || return 0
	timeout 5 dms ipc call "$ipc_target" "$@" > /dev/null 2>&1 || true
}

on_exit() {
	notify finished "$mode" "$status"
}

trap on_exit EXIT
trap 'status=129; exit 129' HUP
trap 'status=143; exit 143' TERM

heading() {
	printf '\n\033[1;34m::\033[0m \033[1m%s\033[0m\n\n' "$1"
}

result_line() {
	if [[ "$2" -eq 0 ]]; then
		printf '\033[1;32m✓\033[0m %s\n' "$1"
	else
		printf '\033[1;31m✗\033[0m %s (exit code %s)\n' "$1" "$2"
	fi
}

wait_for_key() {
	printf '\n'
	read -r -s -n 1 -p "Press any key to close " || true
	printf '\n'
}

# Sets system_cmd (argv) and system_label for the chosen method.
resolve_system() {
	local au helper
	au="$(arch_update_command)"
	if [[ "$method" == "arch-update" && -z "$au" ]]; then
		echo "Arch-Update / Cachy-Update is not installed; updating directly instead."
		method="direct"
	fi
	if [[ "$method" != "direct" && -n "$au" ]]; then
		method="arch-update"
		system_cmd=("$au")
		[[ "$au" == "cachy-update" ]] && system_label="Cachy-Update" || system_label="Arch-Update"
		return
	fi
	method="direct"
	if helper="$(aur_helper)"; then
		system_cmd=("$helper" -Syu)
		system_label="$helper -Syu"
	else
		system_cmd=(sudo pacman -Syu)
		system_label="pacman -Syu"
	fi
}

run_system() {
	resolve_system
	heading "$system_label"
	"${system_cmd[@]}"
	local rc=$?
	if [[ "$method" == "direct" ]] && flatpak_in_use; then
		heading "flatpak update"
		flatpak update
		local flatpak_rc=$?
		[[ $rc -eq 0 ]] && rc=$flatpak_rc
		system_label="$system_label, flatpak update"
	fi
	return "$rc"
}

run_mise() {
	heading "mise upgrade --global"
	(cd "$HOME" && mise upgrade --global)
}

run_mise_bump() {
	heading "mise upgrade --global --bump"
	echo "This moves tools past the versions requested in ~/.config/mise/config.toml"
	echo "and rewrites those requests."
	(cd "$HOME" && mise upgrade --global --bump --interactive)
}

printf '\033]0;%s\007' "Updates (${mode})"
notify started "$mode"

case "$mode" in
	system)
		run_system
		status=$?
		# Arch-Update ends with its own "Press enter to quit" prompt.
		if [[ "$method" == "direct" ]]; then
			result_line "$system_label" "$status"
			wait_for_key
		fi
		;;
	mise)
		run_mise
		status=$?
		result_line "mise" "$status"
		wait_for_key
		;;
	mise-bump)
		run_mise_bump
		status=$?
		result_line "mise (bump)" "$status"
		wait_for_key
		;;
	all)
		run_system
		system_status=$?
		mise_status=0
		# The daemon sends "system" when mise is not in use; this covers a check not run yet.
		have_mise=0
		command -v mise > /dev/null && have_mise=1
		if ((have_mise)); then
			run_mise
			mise_status=$?
		fi
		heading "Summary"
		result_line "$system_label" "$system_status"
		((have_mise)) && result_line "mise" "$mise_status"
		status=$((system_status != 0 ? system_status : mise_status))
		wait_for_key
		;;
	*)
		echo "usage: run-update.sh system|mise|mise-bump|all [arch-update|direct|auto]" >&2
		status=64
		wait_for_key
		;;
esac

exit "$status"
