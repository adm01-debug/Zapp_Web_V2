Especialista: workersql (senior; skill area-sql-banco)

Ponto 1: round_robin media evento velho e ignorava contato por INSERT mais recente
- O que mudei: em `supabase/migrations/20261011193310_queues_distribution_overflow.sql`, a ordenação round_robin de `queue_pick_agent` passou de `COALESCE(max_evento, max_created_at)` para `GREATEST(max_evento, max_created_at)`, mantendo o fallback quando só um lado existe e usando a atividade mais recente quando existem evento e contato.
- Teste que prova: em `scripts/db-audit/queues-distribution-overflow.test.sh`, acrescentei o cenário em que b1 recebe um contato por UPDATE de queue_id, depois recebe contato por INSERT com `created_at` recente, e o INSERT seguinte precisa ir para b2.
- Vermelho antes da correção: `scripts/db-audit/queues-distribution-overflow.test.sh` com o teste novo e a migration ainda usando COALESCE -> `[FAIL] round_robin: considera contato por INSERT mais recente que evento antigo: esperado '00000000-0000-0000-0000-0000000000b2', obtido '00000000-0000-0000-0000-0000000000b1'`.
- Verde depois: `scripts/db-audit/queues-distribution-overflow.test.sh` -> `[OK] contrato de distribuicao/transbordo de filas provado`.

Ponto 2: teste sticky/role não isolava o filtro de papel agent
- O que mudei: em `scripts/db-audit/queues-distribution-overflow.test.sh`, antes do caso `sticky: ultimo membro sem papel agent cai no agente elegivel`, o membro `ad` agora também recebe a habilidade `vendas` nível 2. Assim, o filtro de habilidade sozinho não o exclui; só o filtro de `user_roles.role = 'agent'` impede a fixação no admin.
- Teste que prova: o próprio caso `sticky: ultimo membro sem papel agent cai no agente elegivel` continua esperando `a1`.
- Vermelho sem a proteção: rodei uma mutação local temporária removendo os dois `JOIN public.user_roles` e os dois `ur.role = 'agent'` de `queue_pick_agent`; o teste falhou em `[FAIL] sticky: ultimo membro sem papel agent cai no agente elegivel: esperado '00000000-0000-0000-0000-0000000000a1', obtido '00000000-0000-0000-0000-0000000000ad'`.
- Verde depois: `scripts/db-audit/queues-distribution-overflow.test.sh` -> `[OK] contrato de distribuicao/transbordo de filas provado`.

Rollback e banco local
- O teste executa a migration real em Postgres descartável, extrai e executa o bloco `-- Rollback:` do cabeçalho, verifica remoção da coluna `distribution`, remoção de `queue_pick_agent`, restauração do corpo antigo de `auto_assign_to_queue_agent` sem `paused`, e reaplica a migration depois do rollback.
- Saída verde do rollback no teste: `[PASS] rollback: coluna distribution removida`; `[PASS] rollback: funcao queue_pick_agent removida`; `[PASS] rollback: body antigo do distribuidor restaurado (sem paused)`; `[PASS] reaplicacao apos rollback: migration volta a criar distribution`.

Arquivos do diff (`git diff --name-only dia/2026-10-12...HEAD`)
- `.github/workflows/db-guard.yml`
- `.tmp/relato.md`
- `scripts/db-audit/queues-distribution-overflow.test.sh`
- `src/integrations/supabase/types.ts`
- `supabase/migrations/20261011193310_queues_distribution_overflow.sql`

Verificações rodadas
- `scripts/db-audit/queues-distribution-overflow.test.sh` -> `[OK] contrato de distribuicao/transbordo de filas provado`.
- Mutação temporária removendo o filtro de papel de `queue_pick_agent` -> falhou no caso `sticky: ultimo membro sem papel agent cai no agente elegivel` com `obtido ...0ad`.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (12s) — o banco NÃO foi verificado; registros em /home/joaquim_ataides/.local/state/zapp-verify/e036254dae2a`.
- `node scripts/ci/check-test-inventory.mjs` -> o teste novo `queues-distribution-overflow.test.sh` está registrado no YAML; o comando ainda falhou por 3 órfãos preexistentes e fora do escopo (`department-invite-contract-audit-vocabulary.test.sh`, `talkx-conversion-defaults.test.sh`, `team-chat-media-contract.test.sh`).
- `git diff --check` e `git diff --cached --check` antes do commit -> sem saída/sem erro.

Avisos do juiz barato
- `src/integrations/supabase/types.ts` mudou sem teste próprio: o aviso não procede para este cartão; `types.ts` é gerado a partir da migration, e o teste novo `scripts/db-audit/queues-distribution-overflow.test.sh` executa a migration real, os triggers/funções reais, permissões e rollback em Postgres descartável.
- Arquivos fora da lista textual do cartão: `.github/workflows/db-guard.yml` e `scripts/db-audit/queues-distribution-overflow.test.sh` foram indispensáveis para a prova exigida no refazer. O primeiro só registra o teste novo no CI; o segundo é a prova SQL real que falha sem as correções.
- `queue_overflow_rewrite` com `UPDATE public.contacts`: não é atualização em massa; o `WHERE id = NEW.id AND queue_id = NEW.queue_id` limita a uma linha e o teste provou `transbordo: toca UMA linha de contacts` + `contato intocado mantem updated_at antigo`.
- `WHILE ... LOOP`: o loop já tem teto (`v_depth < 100`) e só percorre a cadeia de `overflow_queue_id` para detectar ciclo, sem apagar/alterar linhas.

O que NÃO fiz
- Toquei em `.github/workflows/db-guard.yml` só para registrar o teste novo no db-guard, exigência do inventário de testes; não afrouxei guarda nem removi etapa.
- Não toquei em outros guards, arquivos de UI, Edge Function ou produção.
- Não alterei a semântica da fila inativa explícita; mantive o comportamento já aceito na recusa anterior e o teste existente verde.
- Não rodei migration em produção; a prova de banco foi feita somente em Postgres descartável local pelo script db-audit.
