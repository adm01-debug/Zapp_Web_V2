# Execution Waves pós-reconciliação

## P0 — estabilizar a plataforma antes de aumentar agentes
1. #1862 db-live-guard.
2. #1854 settings-guard.
3. #1454/#1863 types-sync.
4. PRs CI antigas abertas (#1610/#1439/#1430/#1206) — decidir merge/supersede/close.
5. Revalidar issues #1265/#1266/#1267 e fechar se #1309/#1313/#1314 realmente resolveram.

Executor recomendado: Claude/Codex para diagnóstico; banco/segurança com revisão Claude. Não paralelizar migrations conflitantes.

## P1 — fechar módulos quase prontos
- Tarefas: homologações 96/100; não reimplementar.
- Contatos: item governado restante.
- Catálogo: revalidar CTs que PRs posteriores fecharam.
- Telefonia: recalcular T01–T100; executar apenas gaps reais.
- Email NAVY e Arquivos: reconciliar evidence/PRs e fechar critérios restantes.

Objetivo: converter muitos NEEDS_REVALIDATION em DONE_VERIFIED com pouco código novo.

## P2 — backlog real de produto
- Talk X V4.
- Multiplix.
- IA após IA-058.
- Team Chat, após auditoria HEAD e descarte seguro do histórico perigoso.

## P3 — dívida transversal
- TODOs normalizados.
- deprecated/legacy.
- any/type escapes.
- coverage gaps.
- flaky E2E.
- performance/index debt.
- documentação drift.

## Routing sugerido
- Codex: UI/UX, React/TS, refactors e implementação substancial.
- Hermes/DeepSeek: tarefas mecânicas, testes, docs, low-risk fixes.
- Devin: investigação longa/reprodução.
- Claude Opus: arquitetura, decomposição, banco/segurança de alto risco e revisão.
- Graphify: contexto estrutural/blast radius antes de mudanças.
- Testes/guards: autoridade objetiva.

## Paralelismo
Começar com 4–6 workers, mas somente tarefas com worktrees e domínios de arquivos independentes. Banco/migrations têm lock lógico exclusivo.

## Regra de entrada
Nenhum worker recebe "execute plano X". Recebe somente item do MASTER_LEDGER já reconciliado, com evidência, paths, dependências, risco, aceite e gates.
