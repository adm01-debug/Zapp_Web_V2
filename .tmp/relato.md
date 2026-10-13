Especialista: worker (geral)

## O que mudou e por quê

- `docs/adr/ADR-009-paridade-batch1-batch2.md` (novo): registra as decisões D1–D5 da auditoria de
  paridade V3 → V2 (batch 1 e 2) com o estado de cada uma (D1/PB-39 e D4/PB-18-19 implementados no
  repositório; D5/PB-36 pendente), o que ficou deliberadamente de fora (tags, exportar/importar/edição em
  massa, reativar ciclo de vida de negócios, SLA de Resolução, webhook externo de SLA, QR persistido,
  widgets, A/B clássico) e o estado conferido de negócios, SLA, War Room e conexões. Índice atualizado em
  `docs/adr/README.md`.
- `docs/COMPLETE_SYSTEM_FEATURES.md` §37: a seção descrevia o quadro Kanban de negócios na rota
  `?view=pipeline` → `TasksModule`, que **não existe mais** (a porta de entrada "Quadro" foi removida na
  fusão Quadro → Tarefas; `src/components/pipeline/` não existe e nenhum item de navegação tem id
  `pipeline`). Passou a apontar onde os negócios realmente aparecem (CRM 360 do contato), com o avanço de
  etapa e os limites conhecidos (PB-01, PB-06). Título mantido — o guarda `SL-223` exige o título exato.
- `docs/COMPLETE_SYSTEM_FEATURES.md` §8, §10 e §14: notas de estado atual conferíveis — SLA resolvido no
  servidor (D1) e a lacuna de conversa nunca respondida (PB-40), débitos do War Room (PB-11 a PB-13) e a
  autorização por papel da Edge `evolution-api` (PB-05), cada uma com `arquivo:linha` ou o cartão.
- `docs/dashboard/README.md`: nova seção "War Room — fonte de dados por número", no padrão do arquivo
  (de onde cada número vem e qual débito segue aberto).

## Prova

- Guarda da doc de features: `node --test scripts/ci/complete-system-features-doc.unit.mjs` →
  `tests 7; pass 7; fail 0` (cobre as seções 35..48, o título da §37 e a existência de todo arquivo de
  código citado a partir da §35).
- Guarda do mapa do Dashboard: `node --test scripts/ci/dashboard-readme-drift.unit.mjs` →
  `tests 6; pass 6; fail 0` (nenhum caminho citado inexistente no README).
- Verificação do projeto: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias, db_guard,
  tipos, lint, migrations OK).
- Diff do commit próprio é só de documentação (`git diff --name-only HEAD~1 HEAD` = os 4 arquivos acima).

## O que NÃO fiz e por quê

- Não criei doc novo além do ADR (o ADR é o produto pedido) e não toquei em código nem em banco.
- Não apliquei as migrations dos cartões pai em nenhum banco: é doc-only, e aplicar migration é decisão
  do dono (D3). Os cartões pai trouxeram a faixa inteira para esta base (`fix(edge)` da Evolution,
  revogação das RPCs de gamificação e `resolve_applicable_sla`), então as afirmações do ADR batem com o
  código presente aqui.
- Não corrigi `docs/SLA-ESCALATION-CRON.md` (fora dos arquivos permitidos) — o ADR e a §8 registram que
  ele é desenho antigo com tabela e cron jobs que não existem no banco.
- Não escrevi teste novo: os dois guardas de CI acima já validam, por conteúdo, exatamente os arquivos que
  toquei (a §37 e o README do dashboard). O ADR é novo e não tem guarda próprio.
