# Cartão t_137805b5 — Provar não-regressão: migrations realmente falhas continuam reprovando

## Corpo do cartão (na íntegra, do Kanban)

OBJETIVO: provar que o conserto NÃO afrouxa nenhum outro gate — só muda a classificação de 'diferença explicada por migration pendente'.

PASSOS (rodar depois que o conserto estiver aplicado — patch do `zapp-verify` e/ou rota `--aceitar`):
1. Reproduzir o conjunto completo e confirmar que as 21 falhas reais de 794 migrations continuam reprovando (referência `.ultimo-up-banco.log` 09:06: `migrations: 771 ok, 21 falha(s) de 794`; cruzar com `falhas.tsv`).
2. Caso negativo A: linha `rls|<tabela>` cuja tabela NÃO é criada por nenhuma migration pendente deve continuar `FALHOU`.
3. Caso negativo B: `indexes|foo_bar.foo_bar_pkey` onde `foo_bar` não é citada por migration pendente deve continuar `FALHOU`.
4. Caso negativo C: coluna não citada em tabela nova deve continuar `FALHOU`.
5. Caso negativo D: tabela criada por migration pendente MAS com GRANT/REVOKE/policy explícito que não bate com o diff deve continuar `FALHOU`.

EVIDÊNCIA: comandos crus + logs antes/depois para cada caso; lista dos veredictos inalterados.

CRITÉRIO DE PRONTO: todos os casos negativos continuam reprovando e `falhas.tsv` inalterado; somente as 3 classes descritas mudam de veredicto.

## Contexto que o executor precisa (escrito por mim, complexo)

O conserto NÃO está instalado: a guarda recusa escrita de agente em `~/.local/bin`. Os pais entregaram
duas peças, provadas em cópia:
- `t_699fa539` → patch de `explicada()` do `zapp-verify`. Base `~/.local/bin/zapp-verify`
  sha256 `aa5301f7f6e6aa66e5a0a88c9511c2583c7756fed489522677ccf3fb14175508` (13420 B);
  patch em `/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/attachments/t_699fa539/zapp-verify.patch`;
  resultado esperado sha256 `82fa553dc289e0f61c886f4c76e4043c4c861a9b8965533d528f6995af7ff63d`.
- `t_59eb0a93` → rota `--aceitar` no integrador (não é o alvo aqui; não mexa).

As 3 classes que o conserto passa a classificar como "explicada por migration pendente":
 (i) `rls|<tabela>` quando a tabela é citada/criada por pendente;
 (ii) `indexes|` e `constraints|` com nome GERADO (`_pkey`,`_fkey`,`_key`,`_check`,`_excl`) da tabela dona
     criada por pendente;
 (iii) `relation_grants`/`routine_grants` de papel padrão (`postgres`,`anon`,`authenticated`,`service_role`)
     quando a pendente CRIA o objeto e não cita o papel.

O julgamento é por linha: a função `explicada(l)` do bloco python dentro do `zapp-verify` decide
"explicada"; o que sobrar ainda pode ser salvo por `drift_canonico(l)`; a linha que sobrar das duas vira
`FALHOU` (`diferença não explicada por migration pendente: ...`).

### Dados reais (somente leitura — NÃO escreva neles, NÃO rode `zapp-db-local up`)
- `REF_COPIA=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9`
  (794 migrations; pendentes desta cópia, lidas do `.hermes-tarefa`:
  `20261005224959_inbound_message_effects_outbox.sql` e `20261007095739_indeterminate_optout_outbox.sql`)
- `REF_ESTADO=/home/joaquim_ataides/.local/share/zapp-local/stacks/v2-26100709037ed9/estado`
  (`check-diferencas.txt` = 47 linhas, `falhas.tsv` = 21 linhas, `copia.txt` com o caminho acima)
- Referência das 21 falhas reais: `~/.local/share/zapp-local/falhas-esperadas.txt` (21 linhas)
- `.ultimo-up-banco.log` vivo hoje: `~/arquitetura-v2/integrador/.ultimo-up-banco.log`
  (a versão de 09:06 do cartão dizia `771 ok, 21 falha(s) de 794`; a atual diz `776 ok, 21 falha(s) de 799`)
- Evidência do defeito original: `~/arquitetura-v2/integrador/verificacoes/261006143922bb-091156.log`
  (FALHOU banco_local: `rls|ai_usage_outbox; indexes|ai_usage_outbox.ai_usage_outbox_pkey;
   constraints|relation:ai_usage_outbox.ai_usage_outbox_pkey (+24)`)

## O QUE FAZER (passo a passo mecânico)

Trabalhe SÓ neste workspace. Tudo em `.tmp/prova/`. Nada de `/tmp`.

1. `mkdir -p .tmp/prova/{alvos,fixtures,logs,dados,diferencial}`
2. `cp ~/.local/bin/zapp-verify .tmp/prova/alvos/zapp-verify.atual` e confira
   `sha256sum` = `aa5301f7f6e6aa66e5a0a88c9511c2583c7756fed489522677ccf3fb14175508`.
3. `cp .tmp/prova/alvos/zapp-verify.atual .tmp/prova/alvos/zapp-verify.novo` e aplique o patch
   (`patch -p0 .tmp/prova/alvos/zapp-verify.novo < <patch acima>`; se `-p0` não aplicar, use `-p1`).
   Confira `sha256sum` = `82fa553dc289e0f61c886f4c76e4043c4c861a9b8965533d528f6995af7ff63d` e `bash -n`.
4. Extraia o bloco python de CADA versão, mecanicamente (o texto entre a linha que termina em
   `python3 - <<'PY'` e a linha `PY`): `.tmp/prova/alvos/bloco-atual.py` e `.tmp/prova/alvos/bloco-novo.py`.
   Registre o sha256 de cada bloco. O bloco lê do ambiente: `NOVAS` (nomes de arquivo separados por \n),
   `W` (caminho da cópia), `ST` (caminho do estado) — e NÃO toca em banco nenhum.
5. Para cada caso abaixo, monte uma fixture (árvore mínima) em `.tmp/prova/fixtures/<caso>/` com:
   - `copia/supabase/migrations/*.sql` (as pendentes e as já aplicadas que você inventar)
   - `copia/supabase/schema-manifest.json` (retrato: `{}` ou um JSON com as seções usadas e SEM o objeto do caso)
   - `estado/check-diferencas.txt` (a(s) linha(s) do caso, uma por linha)
   - `estado/falhas.tsv` (vazio, salvo quando o caso pedir)
   - `caso.env` (NOVAS=..., W=..., ST=...)
   Rode cada caso DUAS vezes: `env $(cat caso.env) python3 bloco-atual.py` e depois `... bloco-novo.py`,
   guardando stdout+rc em `.tmp/prova/logs/<caso>-atual.log` e `-novo.log`.
   Veredito por execução: rc=0 e 1ª palavra `ok` = EXPLICADA/verde; rc!=0 = FALHOU (não explicada).

   CASOS (o nome do objeto TEM de ser inventado e não aparecer em lugar nenhum, para não cair em
   `drift_canonico` por acidente):
   - `c2-rls-negativo`  : pendente cria `t137805b5_pend`; diff `rls|t137805b5_ausente`. → tem de ser FALHOU nas DUAS.
   - `c1-rls-positivo`  : mesma pendente; diff `rls|t137805b5_pend` (controle: muda de FALHOU para explicada no novo).
   - `c4-index-negativo`: pendente cria `t137805b5_pend`; diff `indexes|foo_bar.foo_bar_pkey` (foo_bar não citada). → FALHOU nas DUAS.
   - `c3-index-positivo`: pendente cria `t137805b5_pend` (com `primary key` inline, sem citar o nome gerado);
     diff `indexes|t137805b5_pend.t137805b5_pend_pkey` e `constraints|relation:t137805b5_pend.t137805b5_pend_pkey`. → controle.
   - `c5-column-negativo`: pendente cria `t137805b5_pend(col_a text)`; diff `columns|t137805b5_pend.col_nao_citada`. → FALHOU nas DUAS.
   - `c6a-acl-policy-negativo`: pendente cria `t137805b5_pend` e uma policy `pol_certa`;
     diff `policies|t137805b5_pend.pol_errada`. → FALHOU nas DUAS.
   - `c6b-acl-papel-negativo`: pendente cria `t137805b5_pend` e `grant select on t137805b5_pend to relatorio_role`;
     diff `relation_grants|r:public.t137805b5_pend|relatorio_role|SELECT|grantor=postgres`
     (papel FORA dos padrão; a prova nova é por papel padrão). → FALHOU nas DUAS.
   - `c6c-acl-funcao-negativo`: pendente cria `t137805b5_pend` (tabela) mas NENHUMA função;
     diff `routine_grants|f:t137805b5_fn(p_id uuid)|authenticated|EXECUTE|grantor=postgres`. → FALHOU nas DUAS.
   - `c6d-acl-explicito-igual`: pendente cria `t137805b5_pend` e diz `revoke all on t137805b5_pend from authenticated;`
     diff `relation_grants|r:public.t137805b5_pend|authenticated|SELECT|grantor=postgres`.
     → aqui o papel é citado: as DUAS versões consideram explicada (regra ANTIGA do portão: "toda diferença é
     citada no texto de alguma pendente"). Registre como `igual-antes-e-depois (não é regressão)`, com a saída crua.
   - `c7-real`         : dados reais copiados de REF_COPIA/REF_ESTADO (migrations + retrato + estado),
     NOVAS = as 2 pendentes. → esperado FALHOU no atual e `ok` no novo; conte as linhas por classe.
   - `c8-real-falha`   : igual a `c7-real`, mas com `estado/falhas.tsv` contendo UMA das 2 pendentes +
     as 21 falhas reais. → tem de continuar FALHOU nas DUAS (a migration do cartão falhou = regra estrita).

6. CONJUNTO COMPLETO (passo 1 do cartão), com dados reais:
   - `ls REF_COPIA/supabase/migrations/*.sql | wc -l` → tem de dar 794; imprima.
   - `sha256sum REF_ESTADO/falhas.tsv`; `wc -l` → 21; `diff <(cut -f1 ...) <(sort falhas-esperadas.txt)` → igual.
   - Rode o bloco (atual e novo) com `NOVAS` = as 2 pendentes, `W`=REF_COPIA, `ST`=REF_ESTADO e guarde os logs.
   - Rode também `zapp-db-local check REF_COPIA v2-26100709037ed9` (só `check`: NÃO rode `up`, NÃO derrube nada)
     e guarde a saída crua; ANTES e DEPOIS tire `sha256sum` de `REF_ESTADO/falhas.tsv` e prove que não mudou.
   - Liste as 21 linhas de `falhas.tsv` e prove que nenhuma delas está na lista de aceite
     `/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/attachments/t_59eb0a93/261006143922bb.txt`
     (`comm -12` = 0) e que `falhas-esperadas.txt` ≠ lista de aceite.

7. DIFERENCIAL (a prova de que NÃO há alargamento):
   Para todo estado real que você conseguir montar (as 3 fixtures reais acima + toda
   `~/.local/share/zapp-local/stacks/*/estado/check-diferencas.txt` cuja
   `estado/copia.txt` aponte para uma cópia existente com `.hermes-tarefa`),
   rode o MESMO conjunto de linhas nos dois blocos, com as pendentes
   lidas de `<copia>/.hermes-tarefa` (linhas `APLICADA_LOCAL=<arquivo> sha=...`), e imprima:
   - quantos estados/linhas entraram;
   - `explicada_antes` x `explicada_depois` por linha, com a CLASSE de quem mudou
     (`rls`, `nome-gerado`, `acl-padrao`);
   - **qualquer linha que era explicada ANTES e deixou de ser DEPOIS** (tem de ser zero);
   - **qualquer linha que mudou de veredito FORA das 3 classes** (tem de ser zero).
   Saída crua em `.tmp/prova/diferencial/saida.txt`. Use `explicada()`/`drift_canonico()` extraídas dos
   dois blocos — não reescreva a lógica.

8. `MATRIZ.md` em `.tmp/prova/`: tabela `caso | linha | veredito ANTES | veredito DEPOIS | muda? | classe`,
   + o resumo do conjunto completo + o resultado do diferencial + a lista dos veredictos inalterados.
9. Rode `bun install` e depois `zapp-verify . --rapido` neste workspace e guarde a saída em
   `.tmp/prova/logs/zapp-verify-rapido.log` (tem de ser verde).

NÃO faça push, merge, deploy, `zapp-db-local up/down`, nem toque em produção, em `~/.local/bin`,
`~/arquitetura-v2/**` ou nos workspaces de outros cartões. NÃO altere `~/.local/bin/zapp-verify` nem os
arquivos de `REF_*`: tudo o que você escrever fica DENTRO do seu workspace.

## COMO ESTA ENTREGA SERÁ JULGADA

- Só os arquivos de "ARQUIVOS QUE PODE TOCAR". Achado fora disso vai para .tmp/achados.md, sem corrigir.
- Cada critério de pronto precisa de teste que falha sem a correção e chama o código real
  (não literal, não cópia, não só mock, não regex sobre o texto do arquivo).
- Comportamento de SQL se prova executando o SQL com papel de usuário (skill backend-zapp-como-provar).
- Duas escritas dependentes vão numa RPC/transação só. Todo `error` é conferido. Proteção nunca é opcional.
- Rollback da migration restaura GRANT, assinatura e dados.
- .tmp/relato.md: um item por critério (critério → arquivo → teste e saída real), a lista de arquivos colada de
  `git diff --name-only`, e o que NÃO foi feito dito com todas as letras.

## ARQUIVOS QUE PODE TOCAR

Só `.tmp/**` deste workspace (cartão de prova: nenhum arquivo versionado muda; o diff tem de sair vazio).
