Especialista: worker (geral)

## O que mudou e por quê

**Meu (documentação — o produto deste cartão):**
- `docs/adr/ADR-009-paridade-batch1-batch2.md` (novo): registra as decisões D1–D5 da auditoria de
  paridade V3 → V2 (batch 1 e 2) com o estado de cada uma (D1/PB-39 e D4/PB-18-19 implementados no
  repositório; D5/PB-36 pendente), o que ficou deliberadamente de fora (tags, exportar/importar/edição em
  massa, reativar ciclo de vida de negócios, SLA de Resolução, webhook externo de SLA, QR persistido,
  widgets, A/B clássico) e o estado conferido de negócios, SLA, War Room e conexões.
- `docs/adr/README.md`: linha 009 no índice e data de atualização.
- `docs/COMPLETE_SYSTEM_FEATURES.md`: §37 reescrita (o quadro Kanban na rota `?view=pipeline` →
  `TasksModule` não existe mais; a porta de entrada "Quadro" foi removida na fusão Quadro → Tarefas e
  `src/components/pipeline/` não existe) e notas de estado atual conferíveis em §8 (SLA + lacuna PB-40),
  §10 (débitos do War Room, PB-11 a PB-13) e §14 (autorização por papel da Edge, PB-05). Título da §37
  mantido — o guarda `SL-223` exige o texto exato.
- `docs/dashboard/README.md`: nova seção "War Room — fonte de dados por número", no padrão do arquivo.
- `.tmp/relato.md`: este relato.

**Faixa dos cartões pai (dependência do cartão, trazida para esta base porque ainda não estava integrada):**
- t_890bceea (PB-05, Edge) — `supabase/functions/evolution-api/index.ts`,
  `supabase/functions/evolution-api/index.test.ts`, `supabase/functions/_shared/evolution-control-authz.ts`,
  `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`.
- t_844625a9 (PB-18/PB-19, gamificação) — `supabase/migrations/20261012233536_gamification_revoke_client_rpcs.sql`,
  `supabase/tests/gamification_revoke_client_rpcs.sql`.
- t_787e5033 (PB-39, SLA) — `supabase/migrations/20261013012747_sla_resolve_applicable.sql`,
  `supabase/tests/sla_resolve_applicable.sql`, `src/integrations/supabase/types.ts`,
  `scripts/db-audit/sla-resolve-applicable-contract.test.mjs`,
  `scripts/db-audit/sla-first-response-delivery-contract.test.mjs`.

Os três cartões pai têm `done` no quadro e passaram pelo portão deles; eu só os repliquei aqui para que as
afirmações do ADR batam com o código presente nesta base.

## Prova

- Guarda da doc de features: `node --test scripts/ci/complete-system-features-doc.unit.mjs` →
  `tests 7; pass 7; fail 0` (cobre as seções 35..48, o título da §37 e a existência de todo arquivo de
  código citado a partir da §35).
- Guarda do mapa do Dashboard: `node --test scripts/ci/dashboard-readme-drift.unit.mjs` →
  `tests 6; pass 6; fail 0`.
- Verificação do projeto: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias, db_guard,
  tipos, lint, migrations OK).
- Conteúdo do meu commit próprio: `git diff --name-only HEAD~1 HEAD` = os quatro arquivos de documentação
  (o commit anterior é só o relato).

## O que NÃO fiz e por quê

- Não escrevi teste novo: o commit do produto deste cartão é só documentação, e os dois guardas de CI
  acima validam por conteúdo exatamente os arquivos que toquei (a §37 e o README do dashboard). Os
  arquivos de código que aparecem no diff da branch vieram dos cartões pai e **cada um trouxe o próprio
  teste** (`supabase/functions/evolution-api/index.test.ts`, `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`,
  `supabase/tests/gamification_revoke_client_rpcs.sql`, `supabase/tests/sla_resolve_applicable.sql`,
  `scripts/db-audit/sla-resolve-applicable-contract.test.mjs`,
  `scripts/db-audit/sla-first-response-delivery-contract.test.mjs`) — não reescrevi teste alheio.
- Não apliquei migration em banco nenhum: é doc-only e aplicar migration é decisão do dono (D3).
- Não corrigi `docs/SLA-ESCALATION-CRON.md` (fora dos arquivos permitidos); o ADR e a §8 registram que ele
  é desenho antigo, com tabela e cron jobs que não existem no banco.
