# Dossiê PR #2238

**Título:** feat(message-delivery): carimbo do POST iniciado (PD-79) + codigo de erro estavel retryable/ambiguous (PD-80) [C110] [DECISAO HUMANA]  
**Branch:** `claude/feat-message-delivery-post-iniciado-261024-1719`  
**Head SHA:** `3d18fbf142da3db2087aad137990886d078bf374`  
**Base SHA:** `2d97c44cfe7f2fa8a3ca572f8f5689118328e858` (BEHIND main@c4c7139e)  
**Criado em:** 2026-10-24  
**Draft:** Não | **auto_merge:** não configurado  

---

## Veredito

**BLOQUEADO_DECISAO_HUMANA**

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 6 arquivos, 1457 adições, 48 deleções

1. `supabase/migrations/20261026210300_outbound_post_started.sql` — coluna `messages.delivery_post_started_at timestamptz` + RPC `mark_outbound_post_started` + extensão do guard + reescrita de `claim_outbound_message`
2. `supabase/functions/message-delivery/index.ts` — envelope `DeliveryFailure` com `error/code/retryable/ambiguous`, classificação do claim vazio, falhas de infra vs. conteúdo
3. `scripts/db-audit/message-delivery-phase1-behavior.test.sh` — testes PD-79 (carimbo + lease vencido)
4. `scripts/db-audit/message-delivery-phase1-runtime.sql` — contrato estendido
5. `supabase/functions/message-delivery/index.test.ts` — 30 novos testes Deno
6. `supabase/functions/deployment-manifest.json` — regenerado

**Pré-condição fail-closed:** A migration aborta se `whatsapp_groups`/`messages.whatsapp_group_id` não existirem (exige `20261011155946` aplicada em produção antes).

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — implementa PD-79 e PD-80 do plano de message delivery |
| 2 | Traz regressão? | **RISCO** — reescreve `claim_outbound_message`; a PR resolve a divergência com `20261011155946` mas exige essa migration como pré-requisito |
| 3 | Já está em main? | **NÃO** — diff mostra nova coluna, nova RPC, reescrita da edge |
| 4 | Regra de negócio correta? | **PARCIAL** — edge não chama `mark_outbound_post_started` ainda; PD-79 não está ponta a ponta |

## Dependências críticas (ordem de deploy obrigatória)

1. Aplicar `20261011155946` em produção (pré-requisito — decisão separada)
2. Merge desta PR
3. `db-migrate` da `20261026210300` (dry-run → aprovação)
4. `deploy-functions` de `message-delivery`

## Bloqueio atual

`mergeable_state: "dirty"` — conflitos com main (base `2d97c44c`). Além disso, requer:
1. Decisão humana do Joaquim sobre a ordem de deploy e pré-requisitos
2. Resolução de conflitos com main
3. CI verde com todos os 6 checks

## Ação necessária

Aguardar decisão do Joaquim. Não mergear sem autorização explícita e confirmação da ordem de deploy.
