Especialista: workertestes

## Refazer 1 (14/10) — ponto único da recusa

Ponto 1 — "a branch da tarefa andou depois do fechar" → resolvido sem código novo: o trabalho
já entrou na branch do dia. O integrador publicou em `dia/2026-10-14` o commit `ae44454e4c`
("test(conexoes): fila da conexão, indicador de horário, abas Config/Perfi", Cartão V2:
2610131403b66b, 14/10 10:10 -0300) com os mesmos 9 arquivos deste cartão, byte a byte —
`git diff ae44454e4c c04aad676f -- e2e/conexoes.spec.ts e2e/fixtures/conexoes.ts
src/components/connections/__tests__/ src/hooks/business/__tests__/useBusinessHours.test.tsx
src/hooks/connections/__tests__/reconexao-automatica.todo.test.ts
src/hooks/inbox/__tests__/useConnectionsManager.novaConexao.test.ts` → saída vazia.
Tentei o rebase sobre `dia/2026-10-14` e ele conflitou só em add/add nesses arquivos
(conteúdo igual); abortei o rebase (`git rebase --abort`) para não duplicar o que já
entrou — o cartão manda provar em vez de refazer ("se algo já estiver feito, prove no
relato em vez de refazer"). Nenhum arquivo de produção foi tocado nesta rodada; este commit
altera só `.tmp/relato.md`.

Prova (nesta sessão, 14/10, branch `v2/conexoes-testes-fila-horario-config-perf-2610131403b66b`):
- `zapp-verify full .` → `VERIFY: VERDE SEM BANCO (616s)` — `OK db_guard`, `OK tipos`,
  `OK lint`, `OK migrations`, `OK testes (517s)`, `OK build`; "SEM BANCO" porque o cartão
  não tem migration (só teste), nada a provar no banco.
- `npx vitest run` nos 7 arquivos do cartão → `Test Files 5 passed | 2 skipped (7)`,
  `Tests 31 passed | 11 todo (42)`.
- `npx playwright test e2e/conexoes.spec.ts --list` → `Total: 5 tests in 2 files`.

Arquivos do diff desta rodada (`git diff --name-only dia/2026-10-13...HEAD` para o cartão;
nesta rodada só o relato mudou):
- .tmp/relato.md

## O que mudou e por quê (rodada de 13/10)

Cartão `t_9b483886` — inventário de testes do módulo Conexões. O commit `674a5f8425` já foi
aprovado pelo revisor; esta rodada responde às 4 observações dele. Só arquivos de TESTE mudaram;
nenhum arquivo de produção foi alterado.

- `src/hooks/business/__tests__/useBusinessHours.test.tsx` — o teste do padrão prometia no título
  "domingo e sábado fechados" mas só conferia o domingo. Agora confere também o sábado
  (`day_of_week === 6`, `is_open: false`) — antes o título mentia sobre a asserção.
- `src/components/connections/__tests__/BusinessHoursIndicator.test.tsx` — o teste "fora da janela"
  montava a janela com o relógio LOCAL, enquanto o componente usa o fuso `America/Sao_Paulo`;
  agora a montagem usa a MESMA referência do componente (`agoraBrasil()`), sem depender do fuso da
  máquina. E a janela não encosta mais no limite de minuto (termina 2h atrás / começa 5min à frente),
  removendo o risco de oscilação na virada que o revisor apontou.
- `e2e/conexoes.spec.ts` — o teste "lista OU vazio" lia `isVisible()` crua, antes de a tela carregar;
  agora espera o primeiro sinal real (`expect(vazio.or(selo).…).toBeVisible()`) ANTES de decidir, e
  exige que as duas leituras sejam exclusivas (`expect(temVazio).not.toBe(temCartao)`).

## O que cada um dos 8 testes já existentes do módulo cobre (observação do revisor)

- `BusinessHoursDialog.aria-labels` — nome acessível de cada switch de dia e do switch da ausência;
  dia desconhecido não anuncia "undefined"; axe sem `button-name`/`aria-toggle-field-name`.
- `ConnectionAuditDialog` — trilha em pt-BR (ação/quem/quando) com colunas explícitas e filtro por
  `instance_id`; vazio honesto; paginação 21→2 páginas buscando o range seguinte; fechado não consulta;
  falha de leitura mostra erro.
- `ConnectionCard.confirmacao` — "Excluir" só para admin (supervisor vê só "Desconectar"); exclusão
  exige digitar o nome exato; desconexão pede confirmação com nome e número mascarado; cancelar não
  executa; entrada "Auditoria da conexão" só com instância (e só admin).
- `ConnectionCard.sem-integracoes` — o item "Integrações (IA/Bots)" não existe mais; `aria-label` do
  botão de menu; axe.
- `ConnectionsView.trava-multiconexao` — trava de "Nova conexão" pela chave
  `multi_connection_enabled` (ligada/desligada/ausente), botão e estado vazio coerentes.
- `InstanceSettingsDialog.privacidade` — envia só o campo alterado, sem os padrões locais; "Manter
  atual" nunca vira padrão local; voltar a "Manter atual" tira o campo do envio; descarta rascunho ao
  trocar de instância; nome acessível em cada seletor.
- `InstanceSettingsTabContent.aria-labels` — `aria-label` de cada switch de configuração; axe sem
  `aria-toggle-field-name`.
- `NumberReputationMonitor` — só anuncia sucesso quando a escrita do aquecimento é aceita (falha não
  mente); a tela é apresentada como configuração, sem execução automática.

## Prova — vermelho antes, verde depois (por mutação)

Rodada original (5 arquivos funcionais): mutei a produção em 5 pontos, cada mutação foi pega pelo
teste da sua área; vermelho → `Test Files 5 failed (5); Tests 6 failed | 25 passed | 3 todo (34)`;
verde restaurado → `Test Files 5 passed (5); Tests 31 passed | 3 todo (34)`.

Esta rodada — mutei a produção em 2 pontos e cada teste novo/alterado foi pego:
- mutação 1: `useBusinessHours.ts` linha do sábado (`day_of_week: 6`) de `is_open: false` → `true`.
- mutação 2: `BusinessHoursIndicator.tsx` `isWithinHours` forçado a `true`.

vermelho: `npx vitest run src/hooks/business/__tests__/useBusinessHours.test.tsx src/components/connections/__tests__/BusinessHoursIndicator.test.tsx`
  → `Test Files 2 failed (2); Tests 2 failed | 10 passed (12)`
  × padrão do hook espera `is_open: false` no sábado (recebeu `true`)
  × fora da janela do dia mostra "Fechado" (recebeu "Aberto")

verde depois (produção restaurada): mesmo comando → `Test Files 2 passed (2); Tests 12 passed (12)`
Produção de volta ao original: `git diff --name-only -- src/hooks/business/useBusinessHours.ts src/components/connections/BusinessHoursIndicator.tsx` → vazio.

## Circuit breaker do cliente Evolution (observação do revisor)

O revisor não conseguiu conferir. Confirmo o arquivo no workspace
(`supabase/functions/_shared/__tests__/evolution-api-proxy-circuit-breaker.test.ts`) e rodei o teste
de Edge nesta sessão: `deno test --allow-all <arquivo>` → `ok | 6 passed | 0 failed (83ms)`.
(O arquivo é do worker edge; cito a execução só para responder ao ponto, não mexi nele.)

## E2E

Não rodei o fluxo E2E (exige login no conjunto local); a coleta foi validada com
`npx playwright test e2e/conexoes.spec.ts --list` → `Total: 5 tests in 2 files`, incluindo os 4 do
spec (o de QR segue `test.fixme`, dependente do provedor Evolution — R1).

## Aviso do portão (não procede)

O portão acusou "MOVIMENTO: animação sem motion-safe" em
`src/components/connections/__tests__/ConnectionQueuesDialog.test.tsx` (a linha que faz
`waitFor(() => expect(container.querySelector('.animate-spin')).toBeTruthy())`). Não procede: é
asserção de TESTE que confere a presença do spinner do estado de carregamento — um seletor de
classe, não CSS de animação de produção. Nenhuma animação é autorada nesse arquivo, e ele nem faz
parte desta rodada (veio do commit aprovado `674a5f8425`). Não há `motion-safe` a aplicar.

## Outros arquivos do diff do cartão (citados)

Além dos três acima, o diff do cartão altera (na rodada original `674a5f8425`, não nesta):

- `src/components/connections/__tests__/InstanceSettingsDialog.config-perfil.test.tsx` — config/perfil:
  só o campo alterado é enviado, sem vazar padrões locais.
- `src/hooks/inbox/__tests__/useConnectionsManager.novaConexao.test.ts` — criação de nova conexão:
  validação/normalização e estados do fluxo.
- `src/hooks/connections/__tests__/reconexao-automatica.todo.test.ts` — lacuna registrada como
  `it.todo` (não finge cobertura).

E ainda os arquivos de apoio da rodada original: `ConnectionQueuesDialog.test.tsx` (filas),
`ConnectionsView.estatisticas.todo.test.tsx` (lacuna `it.todo`), `e2e/fixtures/conexoes.ts` e
`.tmp/relato.md`.

## Juiz automático (2ª passada) — os dois pontos não procedem

1. "teste novo não chama o código real": os dois testes desta rodada exercitam o código de
   produção de verdade — `useBusinessHours.test.tsx` monta o hook com o cliente fake e lê
   `result.current.businessHours` (o dado que o hook calcula), e `BusinessHoursIndicator.test.tsx`
   renderiza `<BusinessHoursIndicator/>` e lê o texto na tela. A prova é por mutação: mudei a
   produção nos dois pontos e os dois testes FALHARAM; restaurei e voltaram a passar. Os únicos
   itens que não executam são os `it.todo`/`test.fixme` que o próprio cartão pede (item 2 do "O QUE
   FAZER" e item 1 do critério).

2. "arquivo fora de ARQUIVOS QUE PODE TOCAR": os três apontados ESTÃO dentro dos globs permitidos —
   `src/hooks/business/__tests__/useBusinessHours.test.tsx`,
   `src/hooks/inbox/__tests__/useConnectionsManager.novaConexao.test.ts` e
   `src/hooks/connections/__tests__/reconexao-automatica.todo.test.ts` casam com
   `src/hooks/**/__tests__/`; nenhum arquivo fora de escopo foi tocado.

Concluí.
