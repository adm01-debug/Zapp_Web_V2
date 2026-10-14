Especialista: worker (testes) (area-testes-do-produto)

# Verificação independente do teste `tests/talkx/save_talkx_template.test.ts` (auditoria)

Entrega auditada: cartão **t_c745d776**, branch `v2/teste-save-talkx-template-261013113163c8` @ **b2b5944008**.
Este cartão é auditoria: o meu diff de código é VAZIO de propósito (a entrega vive no commit acima). Rodei tudo de novo aqui, não confiei no relato anterior.

## Comandos exatos (nesta cópia, 13/10)

- Subida do banco local da cópia: `zapp-db-local up . v2-2610132231117b`
  → `migrations: 808 ok, 21 falha(s) de 831 (1 reaplicadas como supabase_admin) | seed: ok | 588s`
- Estado da base ANTES da migration (conferido no banco):
  `select to_regprocedure('public.save_talkx_template(uuid,timestamptz,text,text,text,text,text,text,text[],text[],text)')` → vazio;
  `information_schema.columns ... column_name='note'` → `f` (ausente); tabelas `talkx_templates`/`talkx_template_versions` → presentes.
- RED: `ZAPP_DB_LOCAL=v2-2610132231117b node --test tests/talkx/save_talkx_template.test.ts` → **RC=1**
  `ℹ tests 5 / ℹ pass 0 / ℹ fail 5` (5 × ✖). 1ª falha: `AssertionError: a RPC save_talkx_template nao existe no banco` (`rpc_existe=false`);
  caso 2: `ERROR: function public.save_talkx_template(uuid, timestamptz, unknown, ...) does not exist` (SQLSTATE **42883**).
- Aplicação da migration SÓ no banco local (arquivo lido do commit, sem editar):
  `git show 34ee3b9485:supabase/migrations/20261011000012_talkx_template_save_rpc.sql | zapp-db-local psql . v2-2610132231117b`
  → `ALTER TABLE / COMMENT / CREATE FUNCTION / REVOKE / GRANT` (sem erro).
- GREEN: mesmo comando → **RC=0** `ℹ tests 5 / ℹ pass 5 / ℹ fail 0` (5 × ✔).
- 2ª rodada (isolamento): RC=0, `tests 5 / pass 5 / fail 0`; linhas residuais: `talkx_templates` 0 → 0, `talkx_template_versions` 0 → 0.
- 3ª rodada SEM a variável (`node --test tests/talkx/save_talkx_template.test.ts`, conjunto derivado do `.hermes-tarefa`): RC=0, 5/5.
- `zapp-verify . --rapido`: 4 rodadas morreram em `FALHOU tipos` por OOM do host (`tc-rapido: tsc saiu 137`, 81s/146s/114s/308s, "falha de execução, NÃO é aprovação"); a 5ª rodada (com cache incremental quente) → **`VERIFY: VERDE SEM BANCO (326s)`**:
  `OK db_guard 0s / OK tipos 324s / OK lint 0s / OK migrations 2s`, `RCv5=0`.

## Critérios (PASS/FAIL com a saída bruta)

1. **PASS — red→green real, não falso-verde.** Sem a migration: RC=1, 5/5 vermelhos, falha citando `42883 function ... does not exist` e o teste declarando que a RPC não existe. Com a migration aplicada no banco local: RC=0, 5/5 verdes. O vermelho é da AUSÊNCIA do objeto (o teste primeiro prova que ele não existe), não de ambiente.
2. **PASS — sem mocks.** `grep -Ei "mock|spy|stub|sinon|jest|vitest|fake"` → **0 ocorrências**. Imports: `node:test`, `node:assert`, `node:child_process`, `node:fs`, `node:os`, `node:path`. O teste fala com o banco REAL via psql do conjunto local (`spawnSync`, `zapp-db-local psql`), com `set_config('request.jwt.claims', jsonb_build_object('sub', <uid real de public.profiles>, 'role','authenticated'))` **e** `set local role authenticated`. 50 asserções em 5 testes.
3. **PASS — optimistic locking assere EXCEÇÃO.** `assert.equal(texto(corrida,'sqlstate'),'40001')` + `assert.equal(texto(corrida,'mensagem'),'optimistic_lock_failed')`, e mais: `total_versoes === 0` e a linha viva intocada (`name='Intocado'`, `updated_at_mudou=false`). Não é retorno vazio.
4. **PASS — `note` exata e `version_number` explícito.** `note` da versão 1 = `'nota do usuario'`, da versão 2 = `'nota final'`; `version_number` = **1** e depois **2** (valores literais, não "maior que"); `saved_by` == perfil da fixture; `created_at` da versão dentro da instrução do UPDATE.
5. **PASS — isolamento.** Duas rodadas seguidas: 5/5 nas duas, RC=0, e contagem de linhas das duas tabelas igual (0) antes e depois (cada caso em transação com `rollback`).
6. **PASS — escopo do diff.** `git diff --numstat 96dd72dc5f b2b5944008` → `527 0 tests/talkx/save_talkx_template.test.ts`; 1 arquivo, 527 inserções, 0 deleções; arquivo 21.235 bytes, diff 21.985 caracteres (< 25.000); migration NÃO editada; `sha256` do arquivo que eu rodei == `sha256` do blob do commit (`ddf595355fd15e77946262814aaeb996e85043ceb6c9f1c6b5c072ebb44f7a6d`).
7. **PASS — `zapp-verify . --rapido` VERDE** (5ª rodada, `VERDE SEM BANCO (326s)`; as 4 vermelhas anteriores foram OOM do host — `tsc` morto com 137 —, não o diff: nenhum tsconfig inclui `tests/talkx` (app `["src"]`, e2e `["e2e","playwright.config.ts"]`, vite `src/**`, contratos `tests/contracts/**`), então o typecheck nem lê o arquivo novo).

## Proveniência dos 4 fatos do recon (relidos por mim no arquivo-fonte)

Fonte única: `git show 34ee3b9485:supabase/migrations/20261011000012_talkx_template_save_rpc.sql` (cartão t_a3551220), conferida literalmente nesta sessão:
1. assinatura: `public.save_talkx_template(p_template_id uuid, p_expected_updated_at timestamptz, p_name text, p_content text, p_category text, p_status text, p_media_url text, p_media_type text, p_tags text[], p_custom_variables text[], p_note text) RETURNS uuid` — `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp` (bate com a constante `ASSINATURA_RPC` do teste);
2. tabela alvo: linha viva `public.talkx_templates` (só UPDATE); histórico `public.talkx_template_versions`;
3. coluna de versão: `talkx_template_versions.version_number integer NOT NULL`, `UNIQUE(template_id, version_number)`; a coluna `note` é justamente o que esta migration adiciona;
4. `version_number` = `SELECT COALESCE(MAX(version_number), 0) + 1 FROM public.talkx_template_versions WHERE template_id = p_template_id`.
Extra conferido: ACL `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role` — é o que o caso 1 (anon → 42501) prende.

## Observações (não são defeito)

- No caso 1, o bloco `sem_perfil` roda depois de `reset role` (o papel SQL volta a postgres), então a negativa de ACL é provada no bloco `anon` e a de perfil no bloco `sem_perfil` — as duas com `42501` e mensagem exata. A prova de "negado" vem junto com a prova de que o objeto e a fixture EXISTEM (`rpc_existe=true`, `fixture.linhas=1`), que é o que distingue "não existe" de "proibido".
- A migration 20261011000012 não está em `dia/2026-10-13` (só na branch do cartão t_a3551220): fora do escopo daqui, mas é o alerta de integração já registrado pelo recon.

## O que NÃO fiz e por quê

- Não commitei código: o cartão é auditoria e o artefato auditado está no commit do cartão t_c745d776. Árvore limpa; o commit deste cartão é vazio, só para o `hermes-tarefa-fechar` ter HEAD.
- Não editei a migration nem o teste auditado (leitura apenas); a cópia que rodei ficou em `.tmp/evidencia/` e os logs em `.tmp/red.log`, `.tmp/green1.log`, `.tmp/green2.log`, `.tmp/green3_semenv.log`, `.tmp/verify5.log`.
- Desmontei o banco local da cópia (`zapp-db-local down . v2-2610132231117b`) depois de colher a prova, para devolver memória ao host.
