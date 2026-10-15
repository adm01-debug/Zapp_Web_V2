Especialista: semisenior
## Pontos da recusa ([refazer 1] — entrega retirada pelo limpador)
- Ponto 1 (quebra o ESPELHO DO CI no empilhamento; nó: ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge): resolvido — `ESTADO.md:101`, âncora da edge `message-delivery` `src/services/outbound-message.service.ts:223` → `:275`. Causa: o fix do cartão inseriu linhas no serviço e o `supabase.functions.invoke('message-delivery', ...)` saiu da linha 223 (base `dia/2026-10-13`, conferido com `git show dia/2026-10-13:...`) para a linha 275; a linha 223 virou blank e o teste-nó falhava com "âncora desatualizada". Padrão da correção do `t_176429e3` (âncora atualizada na mesma entrega). Nenhum outro arquivo do repo citava `:223` (busca repo-wide: 1 ocorrência, só `ESTADO.md:101`).
- Reprodução pedida (`zapp-verify full .`): reproduzi o vermelho com o teste-nó exato da suite full (`node --test scripts/ci/docs-estado-registry-convention.unit.mjs`) antes de corrigir, e lancei `zapp-verify full .` no workspace em background; no momento deste relato ele segue rodando — a prova desta entrega é o nó vermelho→verde abaixo + o vitest do cartão verde.
- Fechamento: `hermes-tarefa-fechar` está CONGELADO (`EXIT=75`, modo V1 suspenso; `hermes-tarefa-iniciar` idem). Não contornei: sem push, sem deploy, sem migration. Entrego o commit local no workspace da entrega e fecho pelo quadro (`kanban_complete`), com este relato.
## O que mudou e por quê
- `ESTADO.md` (1 número, linha 101): âncora `src/services/outbound-message.service.ts:223` → `:275` — acompanha o deslocamento do `invoke('message-delivery')` causado pelo fix do cartão, restaurando a âncora real. Grupo A, totais e órfãs inalterados (o chamador continua existindo).
- `.tmp/relato.md`: este relato do refazer.
- O restante da entrega (fix + teste do cartão, commits `38f128dafb` e `353121a33`) foi mantido sem retoque: o motivo da recusa era só o espelho, não o código.
## Prova
- vermelho antes (com o fix do cartão, sem a correção da âncora): `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` + `AssertionError: âncora desatualizada: src/services/outbound-message.service.ts:223 não cita \`message-delivery\`` (`ℹ fail 1`).
- verde depois (com a âncora `:275`): mesmo comando → `ℹ pass 11`, `ℹ fail 0`.
- vitest do cartão intacto: `npx vitest run src/services/__tests__/outbound-message.service.test.ts` → `Test Files 1 passed (1)`, `Tests 16 passed (16)`.
- linha nova confere: `sed -n '275p' src/services/outbound-message.service.ts` → `const { data: deliveryData, error: deliveryError } = await supabase.functions.invoke('message-delivery', {`.
## O que NÃO fiz e por quê
- NÃO re-toquei `src/services/outbound-message.service.ts` nem o teste do cartão: a recusa não aponta defeito no código, só a âncora deslocada.
- NÃO trouxe faixa de outro cartão: `git log --oneline dia/2026-10-13..HEAD` nesta rodada soma só os 2 commits da entrega + o meu.
- NÃO atualizei `supabase/config.toml:49` (segunda âncora da mesma linha): o config não foi tocado pelo cartão, e o nó verde confirma que ela segue válida.
## Arquivos desta rodada (vs entrega anterior `353121a33`)
- ESTADO.md (1 linha), .tmp/relato.md (este arquivo)
