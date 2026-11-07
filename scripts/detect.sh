#!/usr/bin/env bash
# Reports which update tools are available, as one JSON object, for the plugin's labels and
# settings page:
#
#   {"archUpdate": "cachy-update" | "arch-update" | "",
#    "aurHelper": "paru" | "yay" | "pikaur" | "",
#    "aurNote": why there is no AUR helper (empty when there is one),
#    "flatpak": true when Flatpak is in use (installed, not disabled, apps installed)}

set -u

# shellcheck source=common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

json_string() {
	local s="$1"
	s="${s//\\/\\\\}"
	s="${s//\"/\\\"}"
	printf '"%s"' "$s"
}

arch_update="$(arch_update_command)"
helper="" aur_note=""
if out="$(aur_helper)"; then
	helper="$out"
else
	aur_note="$out"
fi
flatpak=false
flatpak_in_use && flatpak=true

printf '{"archUpdate":%s,"aurHelper":%s,"aurNote":%s,"flatpak":%s}\n' \
	"$(json_string "$arch_update")" "$(json_string "$helper")" "$(json_string "$aur_note")" "$flatpak"
