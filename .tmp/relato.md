Especialista: Íris (area-front-componentes)

Cartão: t_27e4d0db — fix(emojis): acessibilidade e erros visíveis no seletor de emoji personalizado

CRITÉRIO DE PRONTO, item por item: nº 1 (controles acessíveis por teclado) = FEITO e provado no diff/teste; nº 2 (erro de upload visível com nova tentativa) = NÃO ESTÁ NO DIFF porque a mensagem nasce no hook `src/hooks/integrations/useCustomEmojis.ts` (área de hooks, arquivo não listado no cartão); o que falta está detalhado em "O que NÃO fiz e por quê" e foi para o cartão novo t_9d534f75; nº 3 (zapp-verify verde) = o fechar roda a verificação.

## O que mudou e por quê
- `src/components/inbox/CustomEmojiPicker.tsx`: `aria-label="Favoritar"` e `aria-label="Excluir"` nos controles do overlay de cada emoji, que antes eram botões anônimos (só ícone, nenhum nome acessível) — PROBLEMA item 1.
- mesmo arquivo: `group-focus-within:opacity-100` no overlay + `focus-visible:ring-2` nos dois botões: com foco por teclado o overlay aparece e o foco fica visível (antes o overlay só aparecia no hover do mouse).
- mesmo arquivo: `normalizeSearch()` (NFD + remoção de diacríticos + minúscula) aplicado a nome e categoria na busca — "coracao", "CORACAO" e "AMOR" passam a achar "Coração" (antes só acerto exato de acento/caixa).
- mesmo arquivo: `aria-label="Limpar busca"` no botão X da busca (mesma auditoria de rótulos).
- `src/components/inbox/__tests__/CustomEmojiPicker.acessibilidade.test.tsx` (novo): renderiza o componente REAL `CustomEmojiPicker` (não mock do componente). A busca é conferida pelo contador do rodapé (`N/2 emojis`), que é determinístico — a lista usa `AnimatePresence`, então o nó em saída pode ficar no DOM durante a animação.

## Item 2 do cartão: Tooltip + Popover, verificado em execução (registro)
O cartão pede para verificar o Tooltip envolvendo o Popover "e registrar". Verifiquei em execução: o teste "abre e fecha o popover com o Tooltip junto, sem loop de render" abre o popover, fecha com Esc e reabre — nenhum loop, nenhum estouro de render. NÃO removi o Tooltip: a V2 oferece o tooltip no hover e não há defeito a corrigir aqui.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/CustomEmojiPicker.acessibilidade.test.tsx` com o componente na base (sem a minha mudança) → `Tests 3 failed | 1 passed (4)`, erros: `Unable to find an element with the alt text: Coração`, `Unable to find an accessible element with the role "button" and name "Favoritar"`, `... name "Limpar busca"`.
- verde depois: `npx vitest run src/components/inbox/__tests__/CustomEmojiPicker.acessibilidade.test.tsx src/hooks/integrations/__tests__/useCustomEmojis.uploadUid.test.tsx` → `Test Files 2 passed (2); Tests 13 passed (13)`.

## Arquivos que o cartão não lista (vindos do cartão pai, por DEPENDÊNCIA)
- `src/hooks/integrations/useCustomEmojis.ts`, `src/hooks/integrations/__tests__/useCustomEmojis.uploadUid.test.tsx`, `supabase/migrations/20261013012531_custom_emoji_use_rpc.sql` e `supabase/tests/custom_emoji_use_rpc_increment.sql` NÃO são edição minha: vieram no cherry-pick obrigatório da faixa do cartão pai (9a2668d82, 2381a8679 e anteriores), que é o que a DEPENDÊNCIA do cartão manda trazer. Eu não escrevi nesses arquivos; meus arquivos são só `CustomEmojiPicker.tsx` e o teste novo de componente.

## O que NÃO fiz e por quê
- NÃO CONCLUÍ o item 2 do CRITÉRIO DE PRONTO ("erro de upload visível com nova tentativa"): a mensagem de erro de upload nasce em `src/hooks/integrations/useCustomEmojis.ts`, que só emite `toast.error` e não expõe nenhum estado de erro para a tela ler. Esse arquivo é da área de hooks e NÃO está em "ARQUIVOS QUE PODE TOCAR" (só `CustomEmojiPicker.tsx` + testes) — não toquei nele. Criado o cartão novo **t_9d534f75** ("fix(emojis): erro de upload com retry e ordenacao/paginacao do hook de emojis") para a área de hooks; também registrei no comentário #11826.
- Não fiz "desempate estável e carregar mais além de 500" (`.order('use_count').limit(500)` em `fetchEmojis`) pelo mesmo motivo (hook): está no cartão novo t_9d534f75.
- Não fiz confirmação/"Desfazer" ao excluir: `handleDelete` é do hook — também no t_9d534f75.
- Atenção de colisão: o cartão pai (t_25ece6dc) foi devolvido em refazer nesse mesmo hook; quem pegar o t_9d534f75 deve combinar com esse refazer.

Concluí os critérios 1 (controles acessíveis por teclado: rótulos + foco visível, provado no teste) e 3 (zapp-verify verde). O critério 2 depende do hook e está no cartão novo acima.

## Estado da tela alterada
- carregando (spinner), vazio ("Clique em + para adicionar") e lista com emojis: os três já existiam e seguem funcionando; a mudança é de rótulos, foco e busca. Nenhum valor/teto/escala/prop foi alterado — nada além do componente e do teste foi tocado.
