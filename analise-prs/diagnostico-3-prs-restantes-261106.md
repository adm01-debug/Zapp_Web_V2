# Diagnóstico das 3 PRs Restantes — Zapp_Web_V2
**Data:** 2026-11-06  
**Autor:** Copilot Project Coordinator  
**Contexto:** Após a triagem e merge do backlog de 99 PRs (02/11), restaram 3 PRs abertas. Este documento consolida o diagnóstico das causas raiz de CI de cada uma, verificado contra `main` em 06/11.

---

## Inventário Atual (verificado em 06/11 via GitHub API)

| PR | Título (resumo) | Estado | Head SHA | Bloqueio |
|---|---|---|---|---|
| #2707 | Registry de convenção de docs/estado CI | aberta | `f9771300…` | CI FAILURE — guarda de convenção |
| #2728 | Fix teste flaky paleta única | aberta | `1814701d…` | CI FAILURE — teste `aria-selected` |
| #2744 | Mocks GoTrue no fixture E2E TalkX | draft | `cfe8c47f…` | CI FAILURE — check E2E `Talk X visual/launch` |

Nenhuma outra PR está aberta no repositório.

---

## #2707 — Guarda de convenção de docs/estado desatualizada

**Causa raiz (verificada):** o diff adiciona a migration `supabase/migrations/20261103223000_ai_usage_outbox_drain_cron.sql` e a entrada `supabase/config.toml:96`, mas a guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` (~linhas 167 e 182) não foi atualizada para incluir esses dois novos caminhos no registry de convenção. O teste de unidade da guarda falha ao validar que todo arquivo de doc/estado está registrado.

**Estado no main:** a migration `20261103223000…` **NÃO existe** no main — o CI do main segue verde por isso. As correções da PR são a única fonte da migration (cron de drain de `ai_usage_outbox`).

**Dependência:** esta PR é pré-requisito do bloqueio §1 do `RELATORIO_CI.md` (Deploy Edge Functions).

---

## #2728 — Teste flaky `paleta-unica`

**Causa raiz (verificada):** `src/components/keyboard/__tests__/paleta-unica.test.tsx`, ~linha 233–234 — a asserção de `aria-selected` falha de forma intermitente ao acionar Enter: o estado acessível do item demora (ou não chega) quando o teste dispara a tecla, tornando o teste flaky.

**Relação com #2744:** são complementares — #2744 restaura os mocks GoTrue; #2728 remove flakiness. A regressão de testes desde 24/10 tem mais de uma causa raiz; o fix de TZ (#2416) já entrou no main, mas não destrava os dois.

---

## #2744 — Mocks GoTrue no fixture E2E (draft)

**Causa raiz (verificada):** única mudança é `e2e/fixtures/talkx-demo.ts` (linhas 281–292) adicionando mocks de GoTrue. O check de CI `Talk X visual/launch` continua vermelho.

**Estado:** PR em **draft**. Não mergear sem autorização — além da Regra 8 (workflow/CI), o próprio autor deixou draft deliberadamente.

---

## Situação consolidada

1. **Main NÃO corrigiu as causas raiz** das três PRs (verificado via `list_commits` em 06/11).
2. **CI do main verde** porque a migration de #2707 não está no main — não por mérito das correções.
3. As três PRs dependem de **decisão de negócio/arquitetura** do Joaquim:
   - #2707: merge (migration + cron) — envolve DDL/migration em produção ⇒ **Regra 8**.
   - #2728: merge (fix flaky) — escopo de teste, risco baixo.
   - #2744: decidir fechar ou prosseguir (draft; E2E vermelho em produção de CI).

---

*Documento gerado em 2026-11-06. Nenhuma PR foi mergeada ou alterada nesta sessão.*
