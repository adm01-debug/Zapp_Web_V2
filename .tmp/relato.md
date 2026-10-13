Especialista: workertestes

## O que mudou e por quê
- `src/hooks/integrations/__tests__/useCustomEmojis.upload.test.tsx` (NOVO; só teste, produção
  intocada): cobre o caminho de envio do `useCustomEmojis`, que o `useCustomEmojis.persistencia.test.tsx`
  não exercia. São 7 testes de comportamento, com o hook REAL e a fronteira (Supabase/Storage/sonner)
  dublada:
  1. arquivo não-imagem (`application/pdf`) é barrado: `storage.upload` não é chamado,
     `pendingUpload` fica nulo e `toast.error('Arquivo não é uma imagem válida')` é chamado;
  2. imagem acima de 512KB (`512*1024 + 1` bytes) é barrada: `toast.error('Arquivo excede 512KB')`;
  3. imagem de EXATAMENTE 512KB passa — o teto é medido pelo lado de dentro (`>` e não `>=`);
  4. upload vai para `<auth.uid()>/emoji_...` e a prévia pendente aponta para o MESMO caminho;
  5. falha do bucket (upload com erro) mostra `toast.error('Erro ao enviar arquivo')` e não deixa
     prévia pendente;
  6. cancelar a prévia remove o objeto do Storage (`storage.remove(bucket, [path])`), sem órfão;
  7. duplo clique no Salvar cria UMA linha só (`insert` chamado uma vez).
- Nenhum arquivo de produção foi alterado (o commit desta entrega contém só o teste novo).

## Prova
- verde: `npx vitest run src/hooks/integrations/__tests__/useCustomEmojis.upload.test.tsx`
  → `Test Files 1 passed (1); Tests 7 passed (7)`, repetido em 3 rodadas seguidas idênticas.
- vermelho antes — mutação A (removidas as duas validações do `handleFileSelect` em produção,
  `if (false && ...)`): `Tests 2 failed | 5 passed`; falham os testes (1) e (2) com
  `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times`
  (sem a validação, o arquivo iria para o Storage).
- vermelho antes — mutação B (o caminho do upload volta para a raiz, sem `${user.id}/`):
  `Tests 1 failed | 6 passed`; falha o teste (4) com `AssertionError: expected false to be true`.
- As duas mutações foram desfeitas com `git restore src/hooks/integrations/useCustomEmojis.ts`;
  a produção voltou limpa antes do commit (o diff é só o arquivo de teste novo).

## O que NÃO fiz e por quê
- Não toquei em `useCustomEmojis.persistencia.test.tsx` nem em `useCustomEmojis.uploadUid.test.tsx`:
  o cartão lista só o arquivo novo em ARQUIVOS QUE PODE TOCAR.
- Não alterei código de produção (item 2 do "O QUE FAZER").

## Arquivos herdados da dependência (não são desta entrega)
O diff da branch até a base do dia inclui, além do meu teste, arquivos trazidos pelo cherry-pick
da FAIXA do cartão pai `t_25ece6dc`, exigido pela seção DEPENDÊNCIA deste cartão (o pai não estava
integrado): `src/components/inbox/CustomEmojiPicker.tsx` (spinner do Salvar respeita reduzir
movimento) e os dois arquivos de `supabase/` do avô `t_1d123124`
(`supabase/migrations/20261013012531_custom_emoji_use_rpc.sql` e
`supabase/tests/custom_emoji_use_rpc_increment.sql`). Eu NÃO os editei: são a base sobre a qual o
teste novo roda. Meu commit desta entrega tem só `src/hooks/integrations/__tests__/useCustomEmojis.upload.test.tsx`.

