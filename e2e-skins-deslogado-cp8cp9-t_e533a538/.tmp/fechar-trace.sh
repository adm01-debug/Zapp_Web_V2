#!/usr/bin/env bash
set -uo pipefail
cd /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/retomar-e2e-skins-espelho-ci-26101320012e41
bash -x "$HOME/.local/bin/hermes-tarefa-fechar" "test(e2e): cobre fidelidade das 19 skins e os 14 checks da tela de temas (CP8/CP9) — E81 no empilhamento" .tmp/relato.md > .tmp/fechar4.log 2> .tmp/fechar4.trace
echo "RC=$?"
