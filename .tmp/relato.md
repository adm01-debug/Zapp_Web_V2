Especialista: worker (geral)

## O que mudou e por quê
- docs/COMPLETE_SYSTEM_FEATURES.md (seção 35 "Campanhas de Mensagens em Massa"): a tabela apontava para `?view=campaigns` → `CampaignsView` e citava `src/components/campaigns/CampaignsView.tsx`, `CampaignCreateDialog.tsx`, `CampaignABTesting.tsx` e `src/hooks/communication/useCampaigns.ts` — arquivos apagados pela entrega de remoção de Campanhas Clássicas (cherry-pick de 0f549b4d4/979bb42d8). Passei a rota para o Talk X (`?view=talkx` → `TalkXView`), os componentes/hook para os arquivos do Talk X que existem, as tabelas para `talkx_campaigns`/`talkx_recipients` e registrei a nota da remoção. É a causa real: o documento ficou desalinhado com o código removido.

## Prova
- vermelho antes: `node --test --test-reporter=tap scripts/ci/complete-system-features-doc.unit.mjs` → `not ok 7 - COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe` / `o documento cita arquivos que não existem: src/components/campaigns/CampaignsView.tsx, CampaignCreateDialog.tsx, CampaignABTesting.tsx, src/hooks/communication/useCampaigns.ts`
- verde depois: `node --test --test-reporter=tap scripts/ci/complete-system-features-doc.unit.mjs` → `# pass 7 / # fail 0` (os 4 testes de fixture SL-223, os 2 de seções/Edge Functions e o teste 7 seguem iguais — nenhuma asserção foi afrouxada ou removida)
- contrato da remoção: `npx vitest run --config vitest.contracts.config.ts tests/contracts/no-campaigns-classicas.contract.test.ts` → `Test Files 1 passed (1); Tests 2 passed (2)`

## Pontos do revisor
- Ponto 1: o item do espelho `node: COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe` volta a passar; corrigi a causa (documento), sem tocar no teste nem afrouxar a asserção que o reprovava.

## O que NÃO fiz e por quê
- Não alterei o teste `scripts/ci/complete-system-features-doc.unit.mjs` nem a checagem: a guarda estava certa, apontando citação de arquivo inexistente.
- Não rodei o espelho completo (`ci_espelho.sh`): o cartão entrega o item isolado; a verificação geral roda no `hermes-tarefa-fechar`.
