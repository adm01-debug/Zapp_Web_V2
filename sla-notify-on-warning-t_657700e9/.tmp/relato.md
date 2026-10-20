Especialista: hugo
## O que mudou e por quê
- FAIXA DO PAI (exigida pelo cartão, pais fora da dia): o patch inclui o conteúdo empilhado dos commits 303f8d0db4, db49b40c8d, 4e51c06964 e cbab6d4ac2 sobre a base_dia f5885801b1 (dia/2026-10-14) — sem eles o aviso de risco nem existe na dia.
- src/hooks/sla/useSLANotifications.ts: o retrato dos ajustes no instante do alerta passou a se chamar `settings` (antes `current`), de modo que a chamada voltou ao literal que o contrato-espelho exige: `playNotificationSound('sla_breach', settings.slaSoundType, settings.soundVolume)`; o destructure externo virou `panelSettings` (sem shadowing). O gate do navegador virou `if (settings.browserNotifications)` — o `desktopAlerts` não existe mais na `NotificationSettings` da dia (removido pelo cartão 26101223366300, commit e8b2f98dd7) e manter o `&&` reverteria aquele cartão e nem compilaria.
- src/hooks/__tests__/helpers/alertBehaviorTestKit.ts, src/hooks/__tests__/useSLANotifications.behavior.test.ts, src/hooks/__tests__/helpers/alertContactMock.ts (novo), src/hooks/__tests__/useSLANotifications.contract.test.ts (novo), src/hooks/__tests__/useSLANotifications.policy.test.ts (novo): trazidos da pilha sem alteração — nenhum consumidor do kit usa `.limit()`, então a troca do andaime não quebra os 6 arquivos que o importam.
## Prova
- vermelho antes (pilha sem o fix): `vitest run --config vitest.contracts.config.ts tests/contracts/notification-sound-persistence.contract.test.ts` → `Test Files 1 failed (1); Tests 1 failed | 7 passed (8)` — falha em `SLA e meta tocam o som da própria categoria`, a mesma quebra citada na recusa.
- verde depois (com o fix): mesmo comando → `Test Files 1 passed (1); Tests 8 passed (8)`.
- verde unidade: `vitest run` nos 8 arquivos (policy, behavior, contract do SLA + 5 consumidores do kit) → `Test Files 8 passed (8); Tests 47 passed (47)`.
- verde tipos: `tsc -b --force` → saída vazia, exit 0.
- patch `sla-notify-on-warning-t_657700e9.patch` (45745 bytes, 6 arquivos, bem abaixo do teto de 90 mil) aplica limpo sobre a dia (`patch -p1 --dry-run`: 6× `checking file ...` ok).
## Pontos do revisor
- Ponto 1 (espelho do CI / notification-sound-persistence): resolvido — a chamada do som voltou ao literal `settings.slaSoundType, settings.soundVolume` em src/hooks/sla/useSLANotifications.ts:309, mantendo o comportamento (tipo e volume vigentes lidos por alerta via ref, sem recriar o canal). Prova: contrato 8/8 acima, vermelho→verde com o mesmo comando.
## O que NÃO fiz e por quê
- Não rodei `zapp-verify full .`: `hermes-tarefa-iniciar/fechar` estão CONGELADOS (exit 75, sem MODO_V2) e o `zapp-verify` responde `cópia não encontrada` fora de workspace registrado; com caminho explícito travou por mais de 120s e foi encerrado. No lugar rodei o equivalente executável: unidade (47/47), contratos (8/8) e typecheck (exit 0). Concluí a entrega com essa evidência.
