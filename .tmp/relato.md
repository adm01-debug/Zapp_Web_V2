Especialista: hugo

## O que mudou e por quê
- src/hooks/integrations/useCustomEmojis.ts (handleFileSelect): agora lê o usuário
  autenticado e sobe em `<auth.uid()>/emoji_<ts>_<uuid>.<ext>` em vez da raiz. A
  policy de INSERT do bucket `custom-emojis` aceita admin/supervisor OU a pasta do
  próprio uid — na raiz, o atendente comum recebia erro de permissão (item 1).
  Sem sessão identificada, aborta com toast.error em vez de tentar a raiz.
- src/hooks/integrations/useCustomEmojis.ts (handleSend): o UPDATE direto em
  `use_count` atinge 0 linhas para emoji de outro dono (policy de UPDATE é do
  dono/admin) e sumia sem erro; trocado pela RPC `increment_custom_emoji_use`
  (PB-35, SECURITY DEFINER), com toast.error quando ela falha (item 3).
- src/hooks/integrations/useCustomEmojis.ts (handleConfirmUpload): trava de
  reentrância por ref (síncrona, antes de qualquer await) + estado `saving`
  exposto; nome passa por `trim()` e nome vazio é recusado com toast.error — dois
  cliques no mesmo tick criavam duas linhas (item 2).
- src/components/inbox/CustomEmojiPicker.tsx: Salvar desabilitado enquanto salva
  (spinner) e enquanto o nome estiver vazio (com `title` explicando); Cancelar
  desabilitado durante o save; fechar o popover com prévia pendente agora chama
  `handleCancelUpload` (remove o objeto do Storage) em vez de só limpar o estado —
  era o caminho do órfão (item 2).
- src/hooks/integrations/__tests__/useCustomEmojis.uploadUid.test.tsx (novo): 9
  testes cobrindo caminho com uid, sessão ausente, cancelar sem órfão, fechar o
  popover sem órfão, duplo clique em 1 linha, nome vazio barrado, nome com trim,
  envio pela RPC e erro da RPC.
- Exclusão (handleDelete): NÃO mudou. A extração do caminho
  (`split('/custom-emojis/')[1]`) já devolve `uid/arquivo` no formato novo e o
  nome antigo da raiz no legado; a policy de DELETE não mudou, então o objeto
  antigo da raiz continua sendo apagado quando quem apaga tem permissão (item 1).

## Prova
- vermelho antes: `npx vitest run src/hooks/integrations/__tests__/useCustomEmojis.uploadUid.test.tsx`
  com os dois arquivos de origem restaurados ao HEAD → `Test Files 1 failed (1); Tests 8 failed | 1 passed (9)`
- verde depois: mesmo comando com a correção → `Test Files 1 passed (1); Tests 9 passed (9)`
- sem regressão no teste que já existia:
  `npx vitest run ...uploadUid.test.tsx ...persistencia.test.tsx` → `Test Files 2 passed (2); Tests 16 passed (16)`
- verificação do cartão: `zapp-verify . --rapido` (bloco FATOS MEDIDOS deste fechar)

## Dependência (cartão pai t_1d123124, não integrado)
`git merge-base --is-ancestor 9e0ee270d HEAD` era falso; a faixa do pai (1 commit)
foi trazida com `git cherry-pick -x 9e0ee270d` → novo sha `0cbeb8f17` (migration
`increment_custom_emoji_use` + seu teste no banco local). Sem conflito.

## O que NÃO fiz e por quê
- Não mexi em handleDelete nem na migration/policy do bucket `custom-emojis`: nada
  a mudar no código (a extração de caminho serve os dois formatos) e a policy já
  é a trilha de banco, fora dos arquivos deste cartão.
- Não editei `src/integrations/supabase/types.ts` (fora dos arquivos permitidos): a
  RPC é nova e o types.ts ainda não está sincronizado; segui o padrão já existente
  no repositório (`src/components/dashboard/useSentimentData.ts`) com
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` e comentário do
  motivo no código.
- Não adiei o upload para o Salvar (a alternativa da V3): escolhi o outro caminho
  que o cartão permite — remover o objeto ao fechar com prévia pendente — para não
  mudar o fluxo do atendente nem o formato do `pendingUpload`.
