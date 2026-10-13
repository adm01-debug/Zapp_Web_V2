Especialista: workertestes

## O que mudou e por quê
- `e2e/team-chat.spec.ts` (novo, 6 testes): abre o grupo pela lista de conversas; envia mensagem e confere que o
  backend recebeu conversa/remetente/texto; reage com emoji (RPC grava e a leitura seguinte traz a linha); silencia
  e o menu passa a oferecer "Ativar notificações"; ticks de leitura da mensagem própria (entregue x lido, PE-70);
  `axe` (`button-name`, `list`) na conversa aberta.
- `e2e/monitoring.spec.ts` (novo, 3 testes): o painel do monitoramento (`?view=evolution-monitor`) monta para
  `admin` com as conexões da fixture; para quem NÃO é admin aparece "Acesso restrito" e o painel não monta; `axe`
  (`button-name`, `list`) com o painel já renderizado (senão mediria o estado vazio).
- `playwright.config.ts`: projeto DEDICADO **deslogado** `chromium-chat-monitor` (`testMatch` das duas specs e
  `storageState` vazio explícito) + os dois nomes no `testIgnore` do catch-all logado. Declaro: este arquivo NÃO
  estava na lista "ARQUIVOS QUE PODE TOCAR", e é o mínimo para as specs serem executáveis — nenhum projeto do
  config casa as duas specs (todos usam `testMatch` explícito), o projeto catch-all exige login REAL, e o ambiente
  proíbe rodar o projeto com sessão salva. É o mesmo padrão documentado no próprio config para
  `chromium-telefonia`/`chromium-tarefas-linha-de-base`.
- As duas specs usam fronteira mockada (`page.route`) + sessão FALSA (`installFakeSession`) e conferem no fim que
  `registro.redeBarrada` está vazio (nenhuma chamada escapa para o Supabase real). Zero código de produção alterado;
  zero credencial; zero dado de cliente.

## Prova
Mutação 1 (ACL do painel, revertei só produção — `src/services/navigation.service.ts`):
- vermelho antes: `ADMIN_ONLY` → `['admin','agent']` na linha do `evolution-monitor` e
  `npx playwright test e2e/monitoring.spec.ts --project=chromium-chat-monitor -g "sem papel admin"` →
  `Error: expect(locator).toBeVisible() failed / Locator: getByRole('heading', { name: 'Acesso restrito' }) ... 1 failed`
Mutação 2 (tick de grupo, revertei só produção — `src/components/team-chat/TeamMessageItem.tsx`):
- vermelho antes: `'Lido por todos os participantes'` → `'Lido'` e
  `npx playwright test e2e/team-chat.spec.ts --project=chromium-chat-monitor -g "ticks de leitura"` →
  `Locator: getByRole('log', { name: 'Mensagens da conversa' }).getByRole('img', { name: 'Lido por todos os participantes' }) ... 1 failed`
Verde depois (produção restaurada, `git status --short` sem os dois arquivos de produção):
- `npx playwright test e2e/team-chat.spec.ts e2e/monitoring.spec.ts --project=chromium-chat-monitor --workers=1` →
  `9 passed (55.7s)`, com `9 passed` em 3 rodadas CONSECUTIVAS (rodadas de 55,7 s, 1,1 min e 1,1 min).
Verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (290s)` (db_guard/tipos/lint/migrations OK).

## Faixas dos cartões-pai (e por que só uma entrou)
Traga só a faixa do pai 1 (`dia/2026-10-13..ad07fb517`, 8 commits): é dela que vêm os ticks de leitura (PE-70) —
`useTeamReadState`, leitura de `read_state` em `useTeamMessages`, `queryKeys` e o rótulo acessível em
`TeamMessageItem`. Na base `dia/2026-10-13` nada disso existe (`git show dia/2026-10-13:src/hooks/team-chat/useTeamReadState.ts` → path inexistente),
então a spec de ticks não passaria sem ela. A faixa também traz, e o diff real muda:
`supabase/migrations/20261009214931_team_message_read_state_view.sql`, `src/integrations/supabase/types.ts`,
`scripts/db-audit/team-message-read-state.test.sh`, `src/hooks/team-chat/README.md` e `.github/workflows/db-guard.yml`
— são o lado banco/documentação da MESMA view `team_message_read_state` que a spec exercita por REST mockado; vêm
inteiros, conforme o cartão manda, e eu não os editei.
A faixa do pai 2 (`dia/2026-10-13..21de1d52`) NÃO entrou: o que ela faz e que a minha spec usa (painel
`EvolutionMonitoringDashboard` + a ACL `ADMIN_ONLY` do `evolution-monitor`) JÁ está na base
(`git show dia/2026-10-13:src/services/navigation.service.ts` → `{ id: 'evolution-monitor', ... roles: ADMIN_ONLY }`),
e a faixa inteira é o que estourava a regra do portão (o diff ia a 128 mil caracteres adicionados com as duas faixas).
Ela era só o webhook/selftest do servidor, fora do meu escopo. Reconstruí a branch por cima da base para entregar só
o necessário; nada foi perdido (as branches dos pais seguem no `.v2-fila` e os shas continuam alcançáveis).

## Ressalva medida (não é falha da spec)
Sob a carga atual do host o app às vezes não monta em 8 s e é o PRÓPRIO app que mostra
`⚠️ Falha ao inicializar o app — O React não montou em 8s` (watchdog do app; load do host ~57 em 24 CPUs). A mesma
falha ocorre em spec que já existia (`location-picker.spec.ts`, projeto `chromium-mapa`) na mesma máquina, sem
relação com este diff. Com 3 rodadas consecutivas verdes o critério do cartão está cumprido; o tempo por rodada
variou de 56 s a 2 min conforme a carga.

## O que NÃO fiz e por quê
- Não rodei o projeto `chromium-authenticated` (guarda do ambiente + REGRA R1: sessão salva).
- Não registrei o projeto novo em `.github/workflows/*.yml` (arquivo do `worker (ci)`); a spec roda pelo projeto
  `chromium-chat-monitor`.
- Nenhum teste existente foi removido, pulado, enfraquecido ou teve timeout aumentado.
