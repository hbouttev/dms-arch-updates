#!/usr/bin/env bash
# Runs updates inside the terminal the plugin opened.
#
#   run-update.sh system      Cachy-Update (repositories, AUR, Flatpak, news and maintenance)
#   run-update.sh mise        mise upgrade --global (stays within configured versions)
#   run-update.sh mise-bump   mise upgrade --global --bump (moves past configured versions)
#   run-update.sh all         system, then mise
#
# The tools keep their normal output and prompts. The plugin is told when the run starts
# and ends (through DMS IPC) so it can re-check; if DMS is not running that is skipped.

set -u

mode="${1:-all}"
ipc_target="cachyUpdates"
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

run_system() {
	heading "Cachy-Update"
	cachy-update
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
		# Cachy-Update ends with its own "Press enter to quit" prompt.
		run_system
		status=$?
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
		run_mise
		mise_status=$?
		heading "Summary"
		result_line "Cachy-Update" "$system_status"
		result_line "mise" "$mise_status"
		status=$((system_status != 0 ? system_status : mise_status))
		wait_for_key
		;;
	*)
		echo "usage: run-update.sh system|mise|mise-bump|all" >&2
		status=64
		wait_for_key
		;;
esac

exit "$status"
