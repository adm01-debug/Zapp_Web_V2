Especialista: iris

CONCLUÍDO: os 4 itens do cartão estão implementados e provados abaixo (progresso real ligado à barra acessível; falhas que ficam na tela com toast de 8 s e ação 'Tentar de novo'; agendamento com anexo que não fica pela metade; testes de componente). Nada ficou pendente.

## O que mudou e por quê
- `src/components/inbox/useFileUploadLogic.ts`:
  1. **Progresso real.** O corpo do upload passou a ser um `ReadableStream` (`FileBody` + `duplex: 'half'`, caminho que o próprio Storage SDK suporta e documenta) com um `TransformStream` que conta os pedaços consumidos pela requisição. O percentual vem desse evento de bytes (0–99) e o 100 só é marcado quando o SDK confirma a resposta — a barra não anuncia fim antes do servidor. O transporte continua sendo o SDK (mesmo caminho, mesmos cabeçalhos, mesmos erros), então nada de RLS/rota foi reimplementado.
     - `handleSendFile` passou a ligar `uploading`/`uploadStage`/`uploadProgress` (antes o estágio nunca era setado no envio único: a barra era código morto) e `handleClose` zera esse estado.
     - O estágio começa em `uploading` e vira `sending` depois que o objeto está no Storage; no lote, o progresso por item usa o mesmo evento de bytes (antes só existiam 0 e 100).
  2. **Falhas ficam na tela.** O toast de carregamento perdeu o prazo de 30 s (`duration: Infinity`) e o toast de erro ganhou `duration: 8000` + ação `'Tentar de novo'` nos dois caminhos (arquivo único e lote). O handler é lido por ref (`retryFileRef`/`retryQueueRef`), porque o clique do toast chega depois do render. A fila continua guardando só o que falhou (regra do t_f4ba22de, conferida no teste).
  3. **Nada é gravado pela metade.** `src/components/inbox/ChatPanel.tsx`: `handleScheduleMessage` limpa o objeto órfão, mostra o motivo (nome do anexo + causa) em toast destrutivo e **relança** a falha. Antes a promessa resolvia, o `ScheduleMessageDialog` anunciava "Mensagem agendada!" e fechava sem agendamento nenhum (N8).
  4. `src/components/inbox/FileUploader.tsx`: a área de envio mostra `<Progress role="progressbar">` com `aria-valuenow` do valor atual no caminho normal e, quando o navegador não reporta bytes, a barra fica indeterminada com `aria-busy` (nunca um 0% falso).
- Testes: `src/components/inbox/__tests__/FileUploader.progresso-upload.test.tsx` (novo, 3 casos, componente REAL); `src/components/inbox/__tests__/ChatPanel.scheduled-media.test.tsx` (os 2 casos de erro passaram a exigir o relançamento e o aviso); `src/components/inbox/__tests__/useFileUploadLogic.u7.test.tsx` (contrato do toast de erro do lote).

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/FileUploader.progresso-upload.test.tsx` com `useFileUploadLogic.ts` e `FileUploader.tsx` restaurados de `HEAD` → `Test Files 1 failed (1)`; `Tests 3 failed (3)`, com `TypeError: Cannot read properties of undefined (reading 'duration')` (toast de erro sem opções) e sem nenhum `progressbar`.
- verde depois: `npx vitest run` dos 8 arquivos de teste da área tocados → `Test Files 8 passed (8)`; `Tests 41 passed | 1 todo (42)`.
- `npx eslint` nos 6 arquivos tocados → `3 problems (0 errors, 3 warnings)`, todas pré-existentes (import restrito do client Supabase que os arquivos já tinham; `exhaustive-deps` na linha 254 do ChatPanel). O ratchet do pre-commit rodou no commit: `OK: nenhuma nova divida de lint foi introduzida.`
- commits: `cb5fb77b52 fix(inbox): liga a barra de anexo ao progresso real e mantem a falha visivel` e `2c47fffe35 chore(inbox): ajusta comentario do estado da barra de envio`.

## Fora do escopo deste cartão (não ficou pendente aqui)
- Texto opcional no agendamento, validação de tipo/tamanho antes de subir e áudio gravado como anexo são do cartão filho `t_b0c6e804` (PH-23, aberto); a coordenação dele manda partir do estado depois deste — o mecanismo de progresso que ele reaproveita está pronto aqui.
- Scanner/antivírus de upload é do `t_6b6f73ca` (hugo, rodando), que declara o MESMO arquivo: registrei em comentário `hotspot: src/components/inbox/useFileUploadLogic.ts` para o integrador reconciliar os toasts.
- Sem migration, sem banco, sem dependência nova e nada fora de `src/components/inbox/**` + testes.
