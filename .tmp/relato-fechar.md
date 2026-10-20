Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 17s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (16/10 14:43, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/inbox/ChatPanel.tsx                 |  12 +-
 src/components/inbox/FileUploader.tsx              |  50 +++-
 .../__tests__/ChatPanel.scheduled-media.test.tsx   |  44 ++-
 .../FileUploader.progresso-upload.test.tsx         | 328 +++++++++++++++++++++
 .../inbox/__tests__/useFileUploadLogic.u7.test.tsx |   8 +-
 src/components/inbox/useFileUploadLogic.ts         | 197 ++++++++++++-
 6 files changed, 606 insertions(+), 33 deletions(-)
```
- Testes alterados neste cartão (3 arquivo[s]) rodados AGORA no seu commit: Test Files 3 passed (3);Tests 23 passed | 1 todo (24)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial do [refazer]: sem pontos refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — risco: p(Alto)=0.96; relato = concluiu_com_ressalva; Jev inseguro sobre o relato; relato sem evidência limpa de verificação

## O que mudou e por quê
- `src/components/inbox/useFileUploadLogic.ts`: detecção de corpo em stream por getter em `duplex` mais ausência de `Content-Type`; decisão única medida no mount e reutilizada no upload e no estado indeterminado; indeterminado também quando o arquivo não tem `stream()`; dispensa do aviso `file-upload` no finally quando desmontado sem falha; `duplex` fora das opções sem stream; flag `indeterminate` por item da fila.
- `src/components/inbox/FileUploader.tsx`: modo indeterminado com `Progress` sem `value` e mesmo `aria-label`, mais texto de estado; itens da fila e total do lote com o mesmo tratamento sem bytes para acompanhar.
- `src/components/inbox/__tests__/FileUploader.progresso-upload.test.tsx`: 4 testes novos cobrindo os 4 pontos da recusa.
- `src/components/inbox/ChatPanel.tsx` e `ChatPanel.scheduled-media.test.tsx`: agendador com anexo do pedido original, parte da entrega.
## Prova
- `bunx vitest run src/components/inbox/__tests__/FileUploader.progresso-upload.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- `zapp-verify <workspace> --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO (150s)` (sem banco: o cartão não tem migration).
- `bunx tsc --noEmit` sem erros nos arquivos do cartão; identificador do projeto de produção ausente do diff.
## Pontos do revisor
- Ponto 1: detecção canônica, decisão única, File original sem `duplex` sem suporte. Teste: `sem suporte a corpo em stream (Firefox/Safari), sobe o File original sem duplex e mostra estado indeterminado`.
- Ponto 2: aviso dispensado no finally quando desmontado sem falha. Teste: `desmontar no meio do upload dispensa o aviso "Enviando arquivo..." em vez de deixa-lo preso`.
- Ponto 3: `Progress` indeterminado com o mesmo `aria-label`; arquivo sem `stream()`, itens e total do lote sem 0% parado. Testes: `arquivo sem stream() não deixa a barra parada em 0%` e `no lote sem bytes para acompanhar, itens e total mostram progresso indeterminado`.
- Ponto 4: relato alinhado ao diff final, sem alegação fora do código.
Concluído: os 4 pontos da recusa estão resolvidos e provados acima. Sobre o apontamento de "evidência de verificação": a verificação oficial rodou fora do fechar e está citada na Prova (`VERIFY: VERDE SEM BANCO (150s)`, registros em `~/.local/state/zapp-verify/162114ca4ad1`); segue a entrega para o revisor com essa evidência.
