# PLANO — PLAY/PAUSE DIRETO NO CARTÃO DE ÁUDIO (ABA ARQUIVOS) — 6 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end · **Sem DDL, sem Edge Function, sem migration, sem dependência nova.**
> **Pedido do dono:** poder ouvir os áudios na própria aba Arquivos, com play/pause, sem abrir a janela de visualização.

## 1. Estado verificado (dia/2026-10-07)
- Hoje o áudio só toca dentro do `MediaPreviewDialog` (um `<audio controls>` nativo); o cartão mostra só o ícone de ondas (`AudioLines`) e o rótulo "Áudio".
- O cartão (`FileCard.tsx`) tem uma linha de ações com olho (visualizar), compartilhar e ⋮. As vistas Lista e Tabela (`FilesListView.tsx`, `FilesTableView.tsx`) reaproveitam essas ações.
- A URL do arquivo é assinada e expira: o `FileThumb` usa `useResolvedStorageUrl(item.url, …)` com `refresh()` para renovar.
- O cartão M02 (miniatura de vídeo) edita `FileThumb.tsx`: este plano **não** toca nesse arquivo.

## 2. Decisões (o dono pode reverter)
- **D01.** Um botão **Play/Pause** na linha de ações do cartão de áudio (e nas vistas Lista e Tabela), só para itens de áudio.
- **D02.** **Um áudio por vez:** tocar outro pausa o que estava tocando; sair da aba, trocar de conversa ou desmontar o cartão pausa e libera o áudio.
- **D03.** A URL só é resolvida no **primeiro clique** (nada de baixar áudio ao abrir a aba); se der erro de URL expirada, renova uma vez e tenta de novo; se falhar, mensagem curta "Não foi possível tocar".
- **D04.** Mostra o tempo restante e uma barra fina de progresso enquanto toca; ao terminar volta ao estado de play. Acessível: `aria-label` "Tocar áudio"/"Pausar áudio", operável por teclado.
- **D05.** No modo Selecionar o botão continua funcionando (clicar nele não marca o cartão).

## 3. Etapas
- **A01–A05** [iris] **Cartão único:** (A01) store de reprodução exclusiva `src/hooks/chat/useExclusiveAudio.ts` (novo); (A02) componente `src/components/inbox/tabs/AudioPlayButton.tsx` (novo); (A03) ligar no `FileCard.tsx`; (A04) ligar nas vistas Lista e Tabela; (A05) testes (exclusividade, pausa ao desmontar, erro de URL com renovação, teclado, modo Selecionar).
- **A06** [Claude] verificação na pré-visualização `localhost:5500` com os 3 áudios da conversa do print: tocar, pausar, tocar outro, trocar de aba/conversa, Lista/Tabela, celular.

## 4. Fora de escopo
Tocar vídeo no cartão; velocidade 1,5×/2×; transcrição; baixar o áudio.

## 5. Estado de execução
_A preencher._
