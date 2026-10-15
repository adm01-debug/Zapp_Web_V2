Especialista: semisenior (area-sql-banco)
## O que mudou neste refazer 1 e por quê
- Nenhum arquivo de código precisou mudar: a migration e o teste do cartão-pai estão corretos ponto a ponto (ver Prova). O vermelho apontado ("quebra no empilhamento") não é defeito deste cartão: é o orçamento de 10% do guarda de paridade estourado pela pilha de ~126 cartões (ver Ponto 1). Arquivo tocado neste refazer: só `.tmp/relato.md` (este texto).
## Prova
- `bun run test src/lib/__tests__/rlsSchemaGuard.test.ts` (neste workspace, com a migration do cartão aplicada) → `Test Files 1 passed (1)` + `Tests 12 passed (12)`.
- Simulação fiel do guarda com o resolvedor real (`src/lib/__tests__/helpers/rlsSchema.ts`, só top-level, snapshot do manifest) sobre a ponta `dia/2026-10-14` (f5885801b1). SEM o cartão → `TRANSITO(1): public.global_settings`, `comparadas: 158 ratio: 0.9937`, `DIVERGENCIAS(0): []`. COM o cartão → `TRANSITO(2): public.global_settings,public.message_templates`, `comparadas: 157 ratio: 0.9874`, `DIVERGENCIAS(0): []`.
- `zapp-verify full .` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; fase `testes` ainda executando no fechamento deste texto (fila do pool sob carga), sem vermelho até aqui.
## Pontos do revisor
- Ponto 1 (quebra os TESTES no empilhamento — `src/lib/__tests__/rlsSchemaGuard.test.ts`): não procede como defeito deste cartão, com prova. A migration `supabase/migrations/20261013235906_quick_replies_uso_e_global.sql` (linhas 43–68) derruba e recria as MESMAS duas policies (`Users can create their own templates`, `Users can update their own templates`); os nomes resolvidos continuam iguais aos do manifest, e a tabela cai em `emTransito`, de modo que o teste de paridade nem a compara. Efeito único do cartão no guarda: +1 tabela em trânsito (157/159 em vez de 158/159). O vermelho da pilha na posição 126 é o `comparadas/tabelas.size > 0.9` cruzando 144/159 (0,9057) para 143/159 (0,8994): a pilha já levava 15 tabelas em trânsito (1 da base dia14 + 9 dos cartões dia14 pendentes + o restante dos demais cartões da pilha, ordem de grandeza compatível com a varredura abaixo), e QUALQUER cartão com migration de policy naquela posição seria o "culpado" da bissecção. Varredura dos pendentes com o regex do próprio guarda: 63 cartões de base dia14 → 9 tabelas em trânsito; 534 cartões de base dia13 → 40 tabelas em trânsito em 146 migrations (listas no comentário do cartão t_43f780e2).
- "correção em t_cf1323f0": aquele cartão não entregou correção (bloqueou em infra e depois encerrou sem executar nada); a apuração acima é a correção que ele deveria ter trazido, feita aqui.
## O que NÃO fiz e por quê
- Não toquei em `src/lib/__tests__/rlsSchemaGuard.test.ts`, `helpers/rlsSchema.ts`, `supabase/schema-manifest.json` nem CI: afrouxar o guarda ou commitar manifest junto da migration (proibido por `docs/MIGRATIONS.md`) seria "fazer passar", não corrigir. Também não reescrevi o SQL para esconder o `POLICY ... ON` do detector de trânsito (seria cegar o guarda).
## Arquivos do cartão (`git diff --name-only dia/2026-10-13...HEAD`: só estes 3)
- `.tmp/relato.md`
- `supabase/migrations/20261013235906_quick_replies_uso_e_global.sql`
- `supabase/tests/quick_replies_uso_e_global.sql`
## Para o integrador
- Reempilhar com folga no orçamento do guarda (manifest atualizado pelo types-sync reduz o trânsito) evita reprisar o vermelho posicional. O cartão-irmão de hooks (`quick-replies-acento-favoritos-rpc`) chama a RPC `increment_quick_reply_use` deste cartão: segurar este cartão trava aquele.
