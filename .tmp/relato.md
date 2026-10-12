Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/monitoring/MonitoringDiagnosticPanel.tsx: removi `exportReportTxt`, `exportReportPdf` e o helper `webhookHost`, os imports que só serviam a eles (`toast`, `downloadFileWithPermission`, `notifyDownloadBlocked`, `useDownloadPermission`, ícones `Download`/`FileText`) e os botões TXT/PDF. O relatório de diagnóstico não sai mais do sistema; a tela continua mostrando score, instância, checklist e o horário do diagnóstico.
- src/components/monitoring/__tests__/MonitoringDiagnosticPanel.webhook-host.test.tsx: removido — testava apenas a exportação (mascaramento do host do webhook no TXT/PDF), comportamento que deixou de existir com a remoção das funções. O cartão manda expressamente (O QUE FAZER, item 1) "remover as funções e os botões de exportação", então o teste que provava só essa exportação foi removido junto com o código, conforme autoriza o item 3 ("Testes: sem botões de exportação").
- src/components/monitoring/__tests__/MonitoringDiagnosticPanel.sem-export.test.tsx: novo — prova que não há botões de exportação e que o relatório segue visível na tela (renderiza o componente REAL).

## Prova
- vermelho antes: `npx vitest run src/components/monitoring/__tests__/MonitoringDiagnosticPanel.sem-export.test.tsx` contra a versão do componente em `dia/2026-10-12` → `Test Files 1 failed (1); Tests 3 failed (3)`.
- verde depois: mesmo comando com o componente corrigido → `Test Files 1 passed (1); Tests 3 passed (3)`.

## Outras exportações/downloads ainda existentes em src (item 2 do cartão — LISTADAS, não removidas por estarem fora deste arquivo)
- src/components/catalog/catalogExport.ts — CSV via `new Blob(` + `downloadFileWithPermission`.
- src/components/catalog/sendProductUtils.ts — blob de produto + `downloadFileWithPermission`.
- src/components/mfa/MFABackupCodes.tsx — `new Blob(` de texto + `downloadFileWithPermission`.
- src/components/team-chat/TeamPerformancePanel.tsx — `new Blob(` JSON + `downloadFileWithPermission`.
- src/hooks/integrations/useGmail.ts — `new Blob(` de anexo + `downloadFileWithPermission`.
- src/lib/downloadFile.ts — a porta única `downloadFileWithPermission` (usada pelos itens acima).
- Blobs que NÃO são exportação de dados (áudio/preview, sem gravação em disco): src/components/email/EmailAttachmentPreviewDialog.tsx, src/components/inbox/VoiceChangerPicker.tsx, src/hooks/communication/useAudioRecorder.ts, src/utils/audioToMp3.ts.

## O que NÃO fiz e por quê
- Não toquei nas exportações listadas acima: o cartão manda apenas listá-las.
- Nenhuma alteração de banco, Edge Function ou dependência.
