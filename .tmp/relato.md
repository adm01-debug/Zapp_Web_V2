Especialista: hugo
(cartão da área de hooks reencaminhado a workeria — executado pela skill `area-front-hooks`, conforme a 1ª linha exigida pelo cartão.)

## O que mudou e por quê
- `src/hooks/integrations/useKnowledgeBase.ts`
  - `deleteFile(id)` (NOVO): carrega a linha (`id, file_url`), exclui a linha com `.delete().eq('id', id).select('id')` — **zero linhas não é sucesso** (DELETE barrado pela RLS não dá erro: sem essa checagem o objeto seria apagado de um arquivo que continua na base) — e só então remove o objeto no Storage. A referência do objeto sai de `parseSupabaseStorageObjectUrl(file_url, ['whatsapp-media'], [origem do projeto])`: **lista de permitidos** por bucket e origem, então URL de outro projeto não vira remoção de objeto. Devolve `boolean`.
  - `reprocessFile(id)` (NOVO): reinvoca `ai-kb-ingest` com `{ fileId }`. A idempotência é do pipeline (ele reivindica o arquivo por UPDATE condicional e devolve `idempotent` quando já concluído) — o hook não reenvia nem cria segundo artigo; mapeia `completed` (novo × já processado), `unsupported` e falha/409 para mensagens distintas, atualizando a lista (`fetchData`).
  - `uploadFile`: o `getPublicUrl` do bucket privado saiu; a referência gravada em `file_url` passa a ser a **URL assinada** (`createSignedUrl(objeto, 1 dia)`), que é o que abre o objeto. Se a assinatura falha, o objeto recém-enviado é removido e nenhuma linha quebrada é gravada. O pipeline reextrai bucket+caminho do objeto antes de baixar com `service_role`, então o processamento não depende do token.
  - `KB_STORAGE_BUCKET` exportado e usos de `'whatsapp-media'` trocados por ele (uma fonte só).
- `src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx` (NOVO): prova `deleteFile` (sucesso; erro do DELETE; **zero linhas**; referência de outro projeto sem remoção; falha ao remover o objeto) e `reprocessFile` (invoca com `{ fileId }`; já concluído não é anunciado como novo; 409 em processamento; falha do pipeline; formato sem extração).
- `src/hooks/integrations/__tests__/useKnowledgeBase.uploadIngest.test.tsx`: o mock do Storage passou de `getPublicUrl` para `createSignedUrl` e o teste novo confere que o INSERT grava a URL assinada de `/storage/v1/object/sign/whatsapp-media/kb/...` (não um locator público que não abre).

## Prova
- vermelho antes: `git stash push -- src/hooks/integrations/useKnowledgeBase.ts; npx vitest run src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx` → `Test Files 1 failed (1); Tests 10 failed (10)`
- verde depois: `npx vitest run src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx src/hooks/integrations/__tests__/useKnowledgeBase.uploadIngest.test.tsx src/hooks/integrations/__tests__/useKnowledgeBase.deleteArticle.test.tsx` → `Test Files 3 passed (3); Tests 16 passed (16)`
- `npx vitest run src/components/knowledge` (a tela que consome o hook) → `Test Files 1 passed (1); Tests 5 passed (5)`

## O que NÃO fiz e por quê
- **Botões de "Excluir" (com diálogo de confirmação) e "Reprocessar" na tela**: são do cartão filho `t_ed574498` (componente/tela). A confirmação explícita pedida no cartão mora nesse diálogo; aqui o hook só executa e devolve o resultado.
- **Exclusão do artigo publicado pelo arquivo**: `deleteFile` faz exatamente "linha + objeto" como o cartão define; o artigo derivado (`article_id`) fica. Registrado em `kanban_comment`.
- Nada em Supabase/migrations, Edge Functions ou outro arquivo.
