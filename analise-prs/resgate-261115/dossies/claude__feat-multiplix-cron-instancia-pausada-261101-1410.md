# Dossiê — claude/feat-multiplix-cron-instancia-pausada-261101-1410 (PR #2476)

**Tip** `81dc9cfaa` · **merge-base** `1252bb5a4` · 1 commit útil (`927df980f feat: cron do Multiplix retoma dispatch pausado por instance_paused`) + 2 merges de main.

## Propósito
C121 opção A: fazer `public.trigger_pending_multiplix_dispatches()` (cron a cada 2 min) retomar dispatches Multiplix pausados com `pause_reason='instance_paused'` quando a pausa da instância (`instance_pauses`) acabou. Sem isso o dispatch ficava `paused` para sempre após a instância ser retomada.

## Arquivo × achado × evidência

| Arquivo (branch) | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `supabase/migrations/20261101150000_multiplix_cron_retoma_instancia_pausada.sql` (226 linhas, novo) | NEW_FILE_ABSENT_IN_MAIN / ABSENT_APPLIES_CLEAN | **Já incorporada por outra migration na main com a mesma intenção e corpo quase idêntico, e aplicada em produção.** | `origin/main:supabase/migrations/20261115020000_multiplix_retoma_instance_paused.sql` (commit `2cf0153ae`, 2026-11-15, PR #3135): linha 115 `pause_reason IN ('outside_window','daily_limit','instance_paused')`; linhas 145-154 bloco `C121 (2/2)` com `v_instance` + `public.is_instance_paused(v_instance)`. Produção (`db_query`, só leitura): `schema_migrations` tem `20261115020000 multiplix_retoma_instance_paused` (e NÃO tem `20261101150000`); `pg_get_functiondef(trigger_pending_multiplix_dispatches)` contém `instance_paused` e `is_instance_paused` (true/true, 9188 chars). Teste de guarda na main: `scripts/ci/multiplix-retoma-instance-paused.unit.mjs`. |

Diff semântico (sem comentários) branch × main — único trecho divergente:

```
branch (bloco instance_paused):                       main (C121 2/2):
IF connection_id IS NULL THEN                         IF connection_id IS NULL THEN
  IF EXISTS (pausa aberta em QUALQUER instancia)        CONTINUE;          -- fail-closed de proposito
    THEN CONTINUE; END IF;                            END IF;
ELSE                                                  SELECT instance_id INTO v_instance ...;
  SELECT instance_id INTO v_instance ...;             IF v_instance IS NULL OR
  IF v_instance IS NULL OR EXISTS (                      public.is_instance_paused(v_instance) THEN
     pausa aberta em pause.instance = btrim(v_instance))   CONTINUE;
    THEN CONTINUE; END IF;                            END IF;
END IF;
```

- Conexão fixa: comportamento idêntico (a main reutiliza `is_instance_paused`, mesma regra `resumed_at IS NULL AND paused_until > now()` — `20261011183812_instance_pauses.sql:222`).
- Conexão NULL: branch retoma se nenhuma instância está pausada; main nunca retoma (documentado no cabeçalho: "Fail-closed de propósito: dispatch sem conexão fixa ... continua pausado"). Divergência residual, escolha deliberada da main.

## Veredito
**INCORPORADA** (confiança alta). A necessidade de negócio está na main e em produção. A migration da branch é hoje **nociva** se aplicada: faria `CREATE OR REPLACE` por cima do corpo vigente (que usa `is_instance_paused`) e trocaria a semântica de conexão NULL.

## Lacuna residual (baixo valor, não é trabalho perdido)
Dispatch Multiplix **sem `whatsapp_connection_id` fixo** pausado por `instance_paused` não retoma sozinho na main (CONTINUE). O worker pode produzir esse caso (`supabase/functions/multiplix-send/index.ts:905-917` pausa com `instance_paused` resolvendo a instância ao vivo, mesmo com conexão NULL). Se o dono quiser retomada automática nesse caso, a regra da branch (retomar só quando NÃO há nenhuma pausa aberta em `instance_pauses`) é a opção conservadora:

```sql
IF v_candidate.connection_id IS NULL THEN
  IF EXISTS (SELECT 1 FROM public.instance_pauses AS pause
              WHERE pause.resumed_at IS NULL AND pause.paused_until > now()) THEN
    CONTINUE;
  END IF;
ELSE
  ... (bloco atual da main)
END IF;
```
Entraria como nova migration sobre `trigger_pending_multiplix_dispatches()` (fluxo `docs/agentes/banco.md`), não reaproveitando o arquivo da branch.

## Apagar branch
Seguro: sim (toda a intenção está em `20261115020000_multiplix_retoma_instance_paused.sql`, aplicada em produção; o arquivo da branch não deve ser aplicado).

## Verificação adversarial

**Discordo do veredito INCORPORADA. Veredito final: PERDIDA_PARCIAL** — a lacuna residual não é de baixo valor: ela é, na prática, **todo** o caso real.

### O que confirmei da triagem (está certo)
- Diff branch × main sem comentários/espaços: o **único** trecho divergente é o ramo `connection_id IS NULL` do bloco `instance_paused`. Todo o resto do corpo é idêntico (verificado com `diff -u` dos dois arquivos normalizados: `origin/claude/…:supabase/migrations/20261101150000_…sql` × `origin/main:supabase/migrations/20261115020000_multiplix_retoma_instance_paused.sql`). Não existe nenhum outro hunk útil não coberto.
- Conexão fixa: equivalência exata. `public.is_instance_paused` (`origin/main:supabase/migrations/20261011183812_instance_pauses.sql:235-240`) usa `p.instance = btrim(p_instance) AND p.resumed_at IS NULL AND p.paused_until > now()` — mesmo critério que a branch inlineia.
- Produção (`db_query`, só leitura): `supabase_migrations.schema_migrations` tem **só** `20261115020000 multiplix_retoma_instance_paused`; `20261101150000` ausente. `pg_get_functiondef(public.trigger_pending_multiplix_dispatches)` contém `instance_paused` e `is_instance_paused` (true/true). Ou seja: a migration da branch, aplicada hoje, reescreveria o corpo vigente — correto não aplicar o arquivo.

### Por que a lacuna é de valor ≥ médio (e não "baixo")
Na main, dispatch com `whatsapp_connection_id IS NULL` pausado por `instance_paused` **nunca** retoma (`20261115020000:146-148` → `CONTINUE`). E `NULL` é o estado de **todo** dispatch criado pelo produto:
- A UI chama `draft.create` sem o campo: payload em `origin/main:src/hooks/integrations/useMultiplixDispatches.ts:537-545` (name, message_template, company_ids, contact_ids, client_request_id, scheduled_at, confirm_over_limit — nenhum `whatsapp_connection_id`). `git grep whatsapp_connection_id origin/main -- src/components/multiplix src/hooks/integrations/useMultiplixDispatches.ts` → **zero** ocorrências fora de testes.
- A edge repassa `p.whatsapp_connection_id ?? null` (`origin/main:supabase/functions/multiplix-dispatch/index.ts:222`) e a RPC tem `p_whatsapp_connection_id uuid DEFAULT NULL` (`pg_get_functiondef(public.multiplix_create_draft)`, produção).
- O worker **produz** esse motivo com conexão NULL: resolve a 1ª conexão `connected` e pausa `instance_paused` (`origin/main:supabase/functions/multiplix-send/index.ts:893-917`).
- Nenhum outro caminho da main retoma esse caso: `git grep instance_paused origin/main -- supabase src scripts` só devolve o ramo Talk X (`talkx-resume-policy.ts:130`, `talkx-scheduler/index.ts:211-219`, que também depende de conexão fixa) e a própria migration.

Efeito de negócio: o defeito que o cartão C121 existia para fechar ("acabada a pausa da instância o dispatch fica `paused` para sempre, exigindo operador") **continua aberto** para a população que o produto gera. A main fechou o caso que hoje não existe (conexão fixa) e deixou aberto o que existe. O `CONTINUE` é documentado como deliberado, mas a decisão foi tomada sem esse dado; não é "divergência residual".

Risco de churn da regra da branch: nenhum. Ela só retoma quando **não há nenhuma** pausa aberta e vigente em `instance_pauses` (produção hoje: 0 pausas abertas, 2 conexões), então não pode reabrir enquanto o worker voltaria a pausar.

### Recomendação
Não reaplicar o arquivo da branch (`20261101150000_…`): ele sobrescreve o corpo vigente e tem timestamp anterior ao já aplicado. Resgatar só o ramo NULL como **nova** migration sobre `trigger_pending_multiplix_dispatches()` (fluxo `docs/agentes/banco.md`), mantendo `is_instance_paused` no caso de conexão fixa — o trecho está na seção "Lacuna residual" acima.

### Apagar branch
**Não antes do resgate.** A branch é a única cópia versionada do ramo NULL (o dossiê vive no scratchpad, que é descartável). Depois que a nova migration estiver na main e aplicada, apagar é seguro.
