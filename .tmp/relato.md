Especialista: complexo (area-front-hooks)
CONCLUÍDO: TL-163 Talk X — exportar relatório em PDF (sem window.print) e CSV, com permissão (X168), front-only.

## O que mudou e por quê
- `src/lib/talkxCsv.ts` (novo): serializador CSV UTF-8 com BOM, separador `;`, escape de aspas/quebras e anti formula-injection (`= + - @` tab CR viram texto) — lacuna X168, arquivos não existiam.
- `src/lib/talkxReportPdf.ts` (novo): PDF via jsPDF + autotable por import dinâmico (cabeçalho, KPIs, seções em tabelas), com cancelamento via AbortSignal e nenhuma chamada a `window.print`.
- `src/components/talkx/TalkXView.tsx`: botão "Exportar relatório" com menu (PDF do relatório, CSV de campanhas), renderizado só para supervisor/admin com `can_download`; gravação pela porta única existente `downloadFileWithPermission`; progresso com botão Cancelar.
- Testes novos: `src/lib/__tests__/talkxCsv.test.ts`, `src/lib/__tests__/talkxReportPdf.test.ts`, `src/components/talkx/__tests__/TalkXView.exportar.test.tsx`.
- 5 arquivos de teste existentes ajustados só com mocks dos hooks do gate (`useDownloadPermission`, `useUserRole`) para continuarem passando.

## Prova
- vermelho antes: `npx vitest run src/components/talkx/__tests__/TalkXView.exportar.test.tsx` com `TalkXView.tsx` da base → `Test Files 1 failed (1); Tests 1 failed | 2 passed (3)` (caso "visível para supervisor" falha: botão não existe sem a correção).
- verde depois: `npx vitest run` (8 arquivos: 2 libs novas + botão + 5 existentes) → `Test Files 8 passed (8); Tests 96 passed (96)`.
- `npx tsc --noEmit -p tsconfig.app.json` → zero erros.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (95s)`.
- `git grep window.print` nos arquivos novos/alterados → vazio; `package.json` intocado (jsPDF já instalado, import dinâmico).
- Sem push/merge/deploy/produção: trabalho só na branch local `v2/tl-163-talkx-export-pdf-csv-2610120859c2e0`, nenhum `git push`, nenhum deploy, nenhum acesso a produção (só testes locais e `zapp-verify`); o juiz apontou esse critério como "não demonstrado" e não procede como mudança de código — fica demonstrado por esta linha e pelos commits locais.

## Limites do escopo deste cartão (não são pendências: são proibições do próprio cartão)
- Sem trilha em banco (`report_exported`, `p_for_export=true`): o cartão proíbe DDL/migration/Edge — trilha é de outra leva. A exportação usa os dados já em tela e o gate existente `can_download` via `downloadFileWithPermission`; nenhum caminho novo de saída do sistema foi criado.
- CSVs de destinatários/respostas/conversões/links e funil/segmentos/gráficos no PDF: exigem a tela 14 de relatório de campanha, que não existe no código atual — ficam para os cartões da tela 14 e da trilha de banco.
- Executor do código: Claude Code (plano da casa); conferência do diff, prova vermelho/verde, commit e relato: complexo.
