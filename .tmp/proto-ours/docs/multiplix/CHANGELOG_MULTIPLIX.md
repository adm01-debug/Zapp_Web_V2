# Changelog — módulo Multiplix

Formato: `- AAAA-MM-DD · <etapa> · <evidência>`

Este registro lista o que está **presente e verificável nesta cópia** (ponta de dia de 12/10/2026).
Cada caminho citado é conferido por
`src/__tests__/multiplix-changelog-registry.test.ts` — entrada que aponte para artefato
inexistente reprova o contrato. As entradas registram **existência de artefato**; elas não afirmam
aprovação de gate nem execução de runtime (isso vive na verificação/CI). A lista de pendências é o
plano `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md`: caixa não marcada segue
aberta, e publicação de documento não fecha etapa.

## 2026-10-08

- 2026-10-08 · Grafo do repositório regenerado no HEAD (E001 · F99) · receita `PYTHONHASHSEED=0 graphify update . --force` (sem custo de API); `graphify-out/GRAPH_REPORT.md` registra o commit de HEAD na seção "Graph Freshness". `graphify-out/` é gitignored (`.gitignore`), então o grafo é artefato LOCAL, regenerável a qualquer momento e **não versionado** — a ausência dele num checkout não prova código morto: o próprio manifesto de evidência do grafo declara o limite da extração AST em `docs/reconciliation/evidence/graphify_evidence_manifest.json` ("AST extraction does not establish dynamic runtime reachability or dead code").

- 2026-10-08 · Superfície do módulo no app (tela com o composer em regiões, e monitor) · `src/components/multiplix/MultiplixView.tsx`, `src/components/multiplix/MultiplixMonitor.tsx`. O diálogo `MultiplixComposerDialog` deixou de existir (TL-006: o composer virou região da própria `MultiplixView`).

- 2026-10-08 · Estado e elegibilidade no app · hooks de integração `src/hooks/integrations/useMultiplixDispatches.ts` e `src/hooks/integrations/useMultiplixAudience.ts`; regra de elegibilidade compartilhada em `src/lib/multiplix-eligibility.ts`.

- 2026-10-08 · API do disparo e do público (Edge Functions) · `supabase/functions/multiplix-dispatch/index.ts` (ações em `supabase/functions/multiplix-dispatch/actions/`), `supabase/functions/multiplix-audience/index.ts`, com o contrato compartilhado `supabase/functions/_shared/multiplix-eligibility.ts` e `supabase/functions/_shared/multiplix-content.ts`.

- 2026-10-08 · Testes do módulo presentes nesta ponta · `src/components/multiplix/__tests__/MultiplixMonitor.recipients.test.tsx`, `src/components/multiplix/__tests__/MultiplixView.disparos-recentes.test.tsx`, `src/hooks/integrations/__tests__/useMultiplixDispatches.criacao.test.tsx`, `src/hooks/integrations/__tests__/useMultiplixDispatches.edge.test.tsx`, `src/pages/__tests__/ViewRouter.multiplix-gate.test.tsx`, `supabase/functions/_shared/__tests__/multiplix-eligibility.test.ts`, `supabase/functions/multiplix-audience/index.test.ts`, `supabase/functions/multiplix-dispatch/__tests__/draft.test.ts`, `supabase/functions/multiplix-dispatch/__tests__/f53-rate-limit.test.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/lifecycle.test.ts`.

- 2026-10-08 · Harnesses de banco do módulo · `scripts/db-audit/multiplix-delivery-leases.test.sh`, `scripts/db-audit/multiplix-rls.test.sh`, `scripts/db-audit/multiplix-scope.test.sh`, `scripts/db-audit/multiplix-resolve-escopo.test.sh`.

- 2026-10-08 · Documentos do módulo e a ponte com o Singu · `docs/multiplix/CANAL.md`, `docs/multiplix/PONTE_SINGU.md`, `docs/multiplix/PERMISSOES.md`, `docs/multiplix/DESIGN_TOKENS_MAP.md`, `docs/multiplix/ESTADO_INICIAL.md`, `docs/multiplix/AUDITORIA_IMPLEMENTACAO_MULTIPLIX_2026-09-29.md`, `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md`.

- 2026-10-08 · Este arquivo é o registro do módulo · criado e referenciado no índice `docs/README.md` e no `CHANGELOG.md` da raiz (mesmo padrão do módulo Catálogo).
