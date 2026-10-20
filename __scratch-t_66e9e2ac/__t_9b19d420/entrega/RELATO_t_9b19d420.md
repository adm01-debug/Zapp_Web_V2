Especialista: iris

FAIXA DO PAI: cartão t_66e9e2ac (PG-01R) — a RPC `public.supervisor_copilot_snapshot()` e o tipo dela em `src/integrations/supabase/types.ts`. Não são alterações deste cartão e não vêm como commit (a sessão está em modo congelado, sem git): vão como `001-migration-pg01r.patch`, `002-test-sql-pg01r.patch` e `003-types.patch`. Os patches deste cartão (004, 005) aplicam-se DEPOIS deles, na ordem numérica.

## O que mudou e por quê

- `src/components/admin/SupervisorCopilot.tsx:182` — o copiloto passou a ler o snapshot medido (`await supabase.rpc('supervisor_copilot_snapshot')`). Era isso que faltava para o contexto ter número em vez de responder sobre SLA e backlog sem base.
- `:183` + `:227-231` — erro do snapshot tem caminho próprio: `if (snapshotError) throw snapshotError` leva à resposta "Não foi possível carregar as métricas gerenciais agora. Tente novamente." e a IA **não** é chamada (fim do falso zero). O código antigo descartava o `error`.
- `buildManagerialContext` (`:138-165`) — o contexto passou a carregar os números medidos: `:157` "Snapshot por fila (abertas / sem resposta >1h / SLA em risco / SLA estourado hoje — desde <todayStart>, fuso <timezone>)", bloco de atendentes (abertas / 1ªs respostas / tempo médio da 1ª resposta) e motivos de encerramento dos últimos 7 dias. A linha `:163` "Não medido nesta consulta" ficou só com o que o V2 não registra: CSAT, NPS, capacidade por atendente e fila de espera de integração — rótulos pt-BR em `:71-76` lidos das chaves de `unavailable` do snapshot, com fallback em `:78-83` quando o snapshot não as traz.
- `:174` — `if (!query || loading) return;` fecha a segunda pergunta durante o carregamento; o `onKeyDown` do Enter (`:271`) chama o mesmo `askQuestion`.
- `:275` — `aria-label="Perguntar ao copiloto"` no botão de envio (antes era só ícone, sem nome acessível).
- `:254` — `title={q}` no chip de pergunta rápida (o texto visível é cortado em 40 caracteres).
- `:287` — chave estável de lista: `${insight.question}-${insight.timestamp.getTime()}` (antes era o índice `idx`).
- `:120-127` + `:217` — mensagem própria para limite de uso do provedor (402/429) e outra para indisponibilidade, em vez de uma única mensagem.
- `:115-117` + `:296` — horário da resposta exibido (`formatInsightTime`); o `timestamp` era guardado e nunca aparecia.
- `src/components/admin/__tests__/SupervisorCopilot.test.tsx` — 7 testes (os 5 chips, lacunas, Enter durante o carregamento, os dois erros da IA, snapshot ausente, acessibilidade e horário).

## Prova

- vermelho antes (componente ANTIGO, testes novos): `npx vitest run src/components/admin/__tests__/SupervisorCopilot.test.tsx` → `Test Files  1 failed (1)` / `Tests  7 failed (7)`
- verde depois (componente novo, mesmos testes): mesmo comando → `Test Files  1 passed (1)` / `Tests  7 passed (7)`
- suíte do diretório: `npx vitest run src/components/admin/__tests__` → `Test Files  11 passed (11)` / `Tests  44 passed (44)`
- verificação: `zapp-verify . --rapido` → `OK db_guard 0s`, `OK tipos 69s`, `OK lint 116s`, `OK migrations 1s`, `VERIFY: VERDE SEM BANCO (186s)`

Critério de pronto do cartão:
1. "As cinco perguntas rápidas respondem com número" → `SupervisorCopilot.test.tsx:90` clica nos 5 chips e confere que o contexto enviado leva `Vendas: 3 / 2 / 1 / 0`, `Ana: 4 / 5 / 120` e `resolvido: 7` (números medidos no banco); `:107` confere que SLA, backlog e motivos saíram de "Não medido nesta consulta" e que CSAT, NPS e fila de espera continuam declarados como lacuna.
2. "zapp-verify . --rapido verde" → linha de resultado acima.

## O que NÃO fiz e por quê

- Não rodei o conjunto de banco: `zapp-verify . --rapido` deixa `banco_local` como `AVISO NÃO VERIFICADO: sem nome de conjunto` e fecha em `VERDE SEM BANCO`. Este cartão é de tela; a prova de banco é do cartão pai (t_66e9e2ac, anexo `002-test-sql-pg01r.patch`).
- Não commitei: nesta sessão `hermes-tarefa-iniciar` responde `CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2` (exit 75). A entrega vai como patches + este relato, no mesmo padrão do cartão pai.
