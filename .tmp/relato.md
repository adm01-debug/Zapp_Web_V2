Especialista: senior (area-sql-banco)

Ponto 1 — reduzir o risco do guard por session GUC.
O que mudei: em supabase/migrations/20261011154935_manual_priority.sql, o trigger guard agora só aceita app.set_manual_priority_allowed quando current_user é o dono real da RPC public.set_manual_priority(uuid,text), e a RPC desliga o GUC local logo depois do UPDATE. Isso mantém a escrita manual restrita à RPC SECURITY DEFINER; set_config direto por authenticated não libera UPDATE direto.
Teste que prova: node --test scripts/db-audit/manual-priority.test.mjs. Vermelho com a migration anterior: exit=1, 16 pass/2 fail; o teste “guard tambem exige o dono da RPC: set_config direto nao burla UPDATE direto” falhou porque a função não tinha current_user = (...) nem reset set_config(..., '', true). Verde depois: 18 pass/0 fail.

Ponto 2 — remover/atualizar a ressalva incorreta da migration.
O que mudei: o cabeçalho/comentário da migration deixou de tratar o GUC como limitação aceita; agora documenta que a escrita é mediada pela RPC, pelo mesmo predicado can_edit_contact, e pelo trigger que exige o dono da RPC. O rollback continua executável e o teste continua extraindo e rodando o bloco real do cabeçalho.
Teste que prova: node --test scripts/db-audit/manual-priority.test.mjs, teste “o Rollback do cabecalho roda e desfaz exatamente o que foi criado” verde junto do restante da suíte (18 pass/0 fail).

Ponto 3 — trocar o teste RLS vacuo por prova com RLS real.
O que mudei: em scripts/db-audit/manual-priority.test.mjs, o teste RLS agora roda consultas como role authenticated com request.jwt.claim.sub real, usando as policies SELECT reais carregadas das migrations: o dono consegue ler o contato e as novas colunas, enquanto usuario sem vinculo recebe 0 linhas. O teste consulta o banco Postgres descartavel depois de aplicar a migration real; não é regex no SQL.
Teste que prova: node --test scripts/db-audit/manual-priority.test.mjs, teste “RLS: policies SELECT reais permitem o dono ler e bloqueiam usuario sem vinculo” verde; durante o ajuste, a versão com request.jwt.claim.sub local/sem sessão persistida falhou com actual '0' !== expected '1', então o teste não aceitava leitura sem RLS funcional.

Ponto 4 — manter o trabalho anterior sem diff alheio e sem quebrar typecheck.
O que mudei: trouxe só o recorte necessário do commit anterior: migration, teste de banco, tipos gerados, teste de tipo e o pequeno ajuste no adapter/teste do adapter exigido pelo novo contrato de Contact Row (manual_priority/_by/_at nulos em contato derivado). Não trouxe mudança fora da prioridade manual.
Teste que prova: zapp-verify . --rapido ficou verde em db_guard, tipos, lint e migrations; os testes do adapter e dos tipos também passaram.

Avisos do juiz barato antes de entregar:
- “teste novo não chama o código real”: não procede para o teste de banco principal. scripts/db-audit/manual-priority.test.mjs aplica a migration real em Postgres 17 descartavel e executa RPC, trigger, RLS e rollback. Ele tem algumas asserções de definição (SECURITY DEFINER/search_path/predicado) além dos caminhos executados, mas a prova dos pontos recusados é por SQL real.
- “arquivo fora de ARQUIVOS QUE PODE TOCAR”: scripts/db-audit/manual-priority.test.mjs é o teste de banco pedido pelo critério; src/adapters/evolutionAdapter.ts e seu teste são o ajuste mínimo para o typecheck continuar verde depois que src/integrations/supabase/types.ts passou a exigir manual_priority/manual_priority_by/manual_priority_at no Contact Row. Sem esse ajuste, zapp-verify falhava em tipos.

Arquivos alterados (git diff --name-only HEAD~1..HEAD):
.tmp/relato.md
scripts/db-audit/manual-priority.test.mjs
src/adapters/__tests__/evolutionAdapter.test.ts
src/adapters/evolutionAdapter.ts
src/integrations/supabase/__tests__/manualPriorityTypes.test.ts
src/integrations/supabase/types.ts
supabase/migrations/20261011154935_manual_priority.sql

Verificações executadas agora:
- node --test scripts/db-audit/manual-priority.test.mjs — 18 tests, 18 pass, 0 fail.
- bunx vitest run src/adapters/__tests__/evolutionAdapter.test.ts src/integrations/supabase/__tests__/manualPriorityTypes.test.ts — 2 files passed, 4 tests passed.
- bun run db:guard — OK: nenhuma violacao nova; migrations validas; comparacao com ledger pulada por DESTINO_URL ausente.
- zapp-verify . --rapido — VERDE SEM BANCO: OK db_guard, OK tipos, OK lint, OK migrations; aviso apenas de banco_local nao verificado por falta de nome de conjunto.
- git diff HEAD --check — sem erro.
- git diff HEAD | wc -c — 39365 caracteres, abaixo de 90 mil.
- busca no diff pelo identificador de producao — sem identificador de producao no diff.
