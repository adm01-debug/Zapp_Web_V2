#!/usr/bin/env bash
set -uo pipefail
cd /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/retomar-e2e-skins-espelho-ci-26101320012e41
zapp-verify . --rapido
echo "ZAPP_VERIFY_RC=$?"
