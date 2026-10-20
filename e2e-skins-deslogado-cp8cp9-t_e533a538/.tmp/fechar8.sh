#!/usr/bin/env bash
set -uo pipefail
cd /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/retomar-e2e-skins-espelho-ci-26101320012e41
hermes-tarefa-fechar "test(e2e): cobre fidelidade das 19 skins e os 14 checks da tela de temas (CP8/CP9) — E81 no empilhamento" .tmp/relato.md > .tmp/fechar8.log 2>&1
echo "FECHAR_RC=$?" >> .tmp/fechar8.log
