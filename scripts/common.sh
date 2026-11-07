# Shared by check.sh, detect.sh and run-update.sh (sourced, not executed).
#
# Arch-Update and Cachy-Update (CachyOS's fork, which installs the same arch-update script)
# read the same configuration file. The plugin follows its NoAUR, NoFlatpak and AURHelper
# options with the same matching rules, so checks and updates agree with those tools.

au_conf="${XDG_CONFIG_HOME:-$HOME/.config}/arch-update/arch-update.conf"

# Prints a message the plugin shows: "code<TAB>English text[<TAB>argument...]". The plugin
# translates known codes (see UpdateTexts.qml) and shows the English text for others.
coded() {
	local IFS=$'\t'
	printf '%s\n' "$*"
}

conf_flag() {
	[[ -f "$au_conf" ]] && grep -Eq "^[[:space:]]*$1[[:space:]]*$" "$au_conf"
}

conf_value() {
	[[ -f "$au_conf" ]] || return 0
	grep -E "^[[:space:]]*$1[[:space:]]*=[[:space:]]*$2[[:space:]]*$" "$au_conf" | tail -n 1 | cut -d '=' -f 2- | tr -d '[:space:]'
}

# The Arch-Update command: cachy-update when installed (same script, CachyOS branding),
# otherwise arch-update. Prints nothing when neither is installed.
arch_update_command() {
	local cmd
	for cmd in cachy-update arch-update; do
		if command -v "$cmd" > /dev/null; then
			printf '%s\n' "$cmd"
			return 0
		fi
	done
	return 1
}

# The AUR helper, chosen like Arch-Update does: AURHelper from its config, otherwise the
# first installed of paru, yay and pikaur. Prints the helper and returns 0; otherwise
# prints why there is none (a coded message) and returns 1.
aur_helper() {
	local helper candidate
	if conf_flag NoAUR; then
		coded no-aur "Disabled by NoAUR in arch-update.conf"
		return 1
	fi
	helper="$(conf_value AURHelper '(paru|yay|pikaur)')"
	if [[ -n "$helper" ]]; then
		if command -v "$helper" > /dev/null; then
			printf '%s\n' "$helper"
			return 0
		fi
		coded aur-helper-missing "AURHelper=$helper is set in arch-update.conf but not installed" "$helper"
		return 1
	fi
	for candidate in paru yay pikaur; do
		if command -v "$candidate" > /dev/null; then
			printf '%s\n' "$candidate"
			return 0
		fi
	done
	coded no-aur-helper "No AUR helper installed (paru, yay or pikaur)"
	return 1
}

# True when Flatpak is installed, not disabled by NoFlatpak, and has applications installed.
flatpak_in_use() {
	conf_flag NoFlatpak && return 1
	command -v flatpak > /dev/null || return 1
	[[ -n "$(flatpak list --columns=application 2> /dev/null)" ]]
}
