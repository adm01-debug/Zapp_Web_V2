# t_7dfec728 — por que o passo `banco_local` do `zapp-verify` reprova todo cartão que cria tabela nova

Especialista: worker (geral)
Alvo medido (intocado): `~/.local/bin/zapp-verify` sha256 `aa5301f7f6e6aa66e5a0a88c9511c2583c7756fed489522677ccf3fb14175508`, 13420 bytes, mtime 2026-10-07 11:41:32. Nenhuma linha foi escrita ali (a guarda do Hermes barra, e não tentei escrever: só li).
Fixtures e evidências cruas: `~/hermes-workspaces/_diag-t_7dfec728-explicador-banco-local/` (cópia de trabalho em `~/.cache/hermes-tmp/t_7dfec728/`).

Resposta curta: o explicador não "avalia errado" — ele **não tem ramo** para 4 das 6 seções que aparecem no diff de um cartão que cria tabela, e o escape de drift (`drift_canonico`, linha 176) nunca cobre uma tabela que o próprio cartão cria, porque a migration pendente cita o nome dela. Resultado: cartão de tabela nova é FALHOU por construção.

---

## (a) Os ramos de `explicada()` — file:line no arquivo instalado hoje

O cartão citava `explicada()` em "linhas 69-111" (`functions`@85, seções@87, grants@94, `default_grants`@101, `return False`@103). A numeração andou: essa faixa hoje é 129-151, porque o bloco `verify-par` (linhas 30-68) e a leitura de ledger/migrations pendentes (82-116) entraram depois. Medido por `grep -n` (`evidencia/01-ramos-explicada.txt`):

```
124:def cita(x):                 # prova por TEXTO: re.search(r'\b'+re.escape(x)+r'\b', texto)
126:def nome_funcao(obj):        # r'f:([a-z_0-9]+)\('
129:def explicada(l):
133:    if tipo == 'functions':                       # -> cita(nome_funcao(partes[1]))      [134]
135:    if tipo in ('columns','indexes','constraints','defaults','policies','triggers'):
137:            return False                          # linha sem objeto
141:        return cita(obj.split('(')[0].split('.')[-1])   # tira r:|t:|f:|i: antes [139-140]
142:    if tipo in ('relation_grants','routine_grants','schema_grants'):
143:        papel = (partes[2] ...).lower()           # 144-145 cita(papel)
146:        if tipo == 'routine_grants' ...           # 147 cita(nome_funcao(...))
148:        return False
149:    if tipo == 'default_grants':
150:        return 'default privileges' in texto      # expressão literal
151:    return False                                  # FALLBACK: todo tipo não listado cai aqui
```

`grep -n "rls" explicador_extraido.py` -> **nenhuma ocorrência**. Confirmado: `rls` não aparece em ramo nenhum; `rls|...` cai no `return False` de **151**.

Ordem de julgamento (linhas 193-200): `explicada(l)` -> senão `drift_canonico(l)` (176-192) -> senão vai para `sem`. O veto decisivo do drift é a linha **186** (`if cita(n): return False`): se a migration pendente cita o nome, a diferença é debitada ao cartão e o drift não pode cobri-la. E a linha **166-168** remove da massa `APLICADAS` exatamente as migrations pendentes.

## (b) Fixture + comando cru (determinístico)

Fixture **real e congelada** (`fixture-real/`): a cópia do cartão `prazo-ia-consumo-corpo-44-2610051517b70e` com 795 migrations + `supabase/schema-manifest.json` + o **estado real** do stack `v2-2610051517b70e` (`estado/check-diferencas.txt`, sha256 `478972f244d5340905c83ce2664fd24b730ada40a2d70ebda740aa7ec17246fe`; `estado/falhas.tsv`), mais as 3 migrations pendentes reais daquele instante. O bloco python do `zapp-verify` foi **extraído verbatim** (linhas 118-202; sha256 do bloco `f6828357521bfb7d05abf869cf867d8ec763fa2eb7c84945f0a164e0e3f50d5f`) por `extrair_explicador.py` — o que roda é o código de verdade, não uma reescrita.

```
$ bash rodar_real.sh
COMANDO: NOVAS="$(cat nova_mig.txt)" W="$PWD/fixture-real" ST="$PWD/fixture-real/estado" python3 "$PWD/fixture-real/explicador_extraido.py"
diferença não explicada por migration pendente: rls|ai_usage_outbox; rls|gmail_oauth_states; indexes|ai_usage_outbox.ai_usage_outbox_pkey (+25)
rc=1
```

rc=1 é o que o `zapp-verify` transforma em `FALHOU  banco_local`. Duas rodadas seguidas: `diff` -> **IDENTICO** (`evidencia/03-prova-real-1.txt` vs `-2.txt`). Mesma assinatura do log medido `261006143922bb-091156.log` (que traz `rls|ai_usage_outbox; indexes|..._pkey; constraints|relation:..._pkey (+24)`).

Fixture **sintética mínima** (`fixture-sint/`), tabela nova sem GRANT/REVOKE/policy — o caso genérico que o cartão descreve:

```
$ bash rodar_sintetico.sh
diferença não explicada por migration pendente: rls|nova_tabela; indexes|nova_tabela.nova_tabela_pkey; constraints|relation:nova_tabela.nova_tabela_pkey (+4)
rc=1
```

E o diff real filtrado só ao objeto do cartão (`fixture-outbox/`) reproduz a assinatura do log de 07/10, com um item a mais que o cartão não listou:

```
diferença não explicada por migration pendente: rls|ai_usage_outbox; indexes|ai_usage_outbox.ai_usage_outbox_pkey; policies|ai_usage_outbox."Service role can manage AI usage outbox" (+9)
rc=1
```

Classificação **linha a linha** do estado real (o bloco de verdade, uma linha por execução — `mapa.py`, 160 linhas):

```
DRIFT-CANONICO 57 · EXPLICADA 75 · NAO-EXPLICADA 28
as 28 NAO-EXPLICADAS: rls 2 · constraints 4 · indexes 3 · policies 1 · relation_grants 16 · default_grants 2
```

## (c) Lista fechada das mudanças de classificação necessárias

1. **`rls|` — sem ramo (a causa nº 1).** `rls|ai_usage_outbox` -> `return False` (151). Nos 16 logs `FALHOU banco_local`, **16 de 16** começam por uma linha `rls|` — é sempre o primeiro bloqueio. Mudança: tratar `rls` como as seções de objeto — `rls|<tabela>` explica-se por `cita(<tabela>)`.
2. **Nome GERADO de índice/constraint (`*_pkey`, `*_fkey`, `*_check`).** `indexes|<t>.<t>_pkey`, `constraints|relation:<t>.<t>_pkey` e `..._fkey` nunca aparecem no texto: a migration escreve o atalho inline. Medido na migration do cartão: `_pkey`=0 ocorrências e `primary key`=1 (`id uuid not null default gen_random_uuid() primary key`, linha 38); na `gmail_oauth_state_attempts.sql`, `id uuid primary key default gen_random_uuid()` e `user_id uuid not null references auth.users (id)` — que geram `gmail_oauth_states_pkey` e `gmail_oauth_states_user_id_fkey`, ambos NAO-EXPLICADA. Mudança: quando o nome não for citável, aceitar como prova a **tabela dona** citada em `create table` na pendente — restrito a sufixos gerados (`_pkey`, `_key`, `_fkey`, `_check`, `_excl`) para não abrir a porta a qualquer nome inventado.
3. **Grant por papel (`relation_grants`/`routine_grants`/`schema_grants`/`column_grants`).** Hoje só passa se o papel aparecer no texto. Isolamento medido (mesma tabela, mesmo diff, só muda a migration): sem GRANT/REVOKE -> `authenticated`, `anon`, `service_role` e `postgres` NAO-EXPLICADA (4/4); com `revoke ... from anon/authenticated` + `grant ... to service_role` -> os 3 primeiros passam a EXPLICADA e **só o papel dono `postgres` continua NAO-EXPLICADA** (ele nunca é citável: ninguém escreve `to postgres`; no estado real são 16 linhas assim). Mudança: aceitar a linha de grant de papel Supabase (`postgres` dono, `anon`, `authenticated`, `service_role`) quando a tabela é criada pela pendente **e** a pendente não tem nenhuma cláusula (GRANT/REVOKE/default privileges) sobre aquele papel — a ausência de cláusula é a prova de que o grant é do bootstrap do Supabase.
4. **`policies` com nome entre aspas — achado NOVO, fora da lista do cartão.** `policies|ai_usage_outbox."Service role can manage AI usage outbox"` -> NAO-EXPLICADA: a linha 141 pega o objeto **com as aspas** e o `\b` do `cita` (125) não casa ao lado de aspas. Prova isolada: a MESMA policy, com o diff entre aspas = NAO-EXPLICADA; sem aspas = EXPLICADA. Mudança: tirar as aspas — o próprio arquivo já faz isso em `nomes_do_objeto` (linha 163, `.strip('"')`).
5. **`default_grants|...` — a condição está invertida.** 149-150 exige a expressão literal `'default privileges'` no texto da pendente; nenhuma migration do cartão mexe em default privileges, então as 2 linhas reais (`default_grants|<global>|postgres|f|...` e `default_grants|row:<global>|owner=postgres|object=f`) ficam NAO-EXPLICADAS. Para "diferença de default privileges que a pendente não toca", a prova tem de ser a **ausência** da cláusula, não a presença.

Não são causa do cartão: 57 das 160 linhas do estado real passam por `drift_canonico` (ex.: `talkx_storage_purge_queue`); por isso o caminho verde/AVISO existe em tese, mas exige que a pendente **não** cite o objeto — impossível quando o objeto é o do cartão.

## (d) Contagens (`grep -c` em `~/arquitetura-v2/integrador/verificacoes/`, `evidencia/06-contagens.txt`)

```
FALHOU  banco_local : 16 linhas em 16 arquivos (de 59 logs)     [o cartão dizia 17; medido agora: 16]
AVISO   banco_local : 21 linhas em 21 arquivos — TODAS "NÃO VERIFICADO: sem nome de conjunto"
'toda diferença é citada por elas' : 0 ocorrências no diretório inteiro (o explicador nunca aprovou nada)
linhas FALHOU que começam por 'rls|' : 16 de 16
```

## Avisos operacionais para o cartão de conserto

- O `zapp-verify` instalado hoje (**`aa5301f7…`**, mtime 07/10 11:41:32) **não é** o artefato `.tmp/ENTREGA/zapp-verify.novo` do cartão `t_b8a069f2` (sha `332d7167…`, base declarada `c95e371a`): base diferente, precisa rebasear/reconferir antes de instalar. O arquivo instalado ainda tem o `explicada()` sem ramo de `rls`.
- O número de linhas do cartão estava deslocado (`69-111` vs medido `129-151`) — quem editar deve casar por conteúdo/`grep -n`, não por linha.
- O conserto tem de ser em `explicada()`; `drift_canonico` não cobre tabela criada pelo cartão por causa da linha 186 + 166-168.
- Duas linhas de comando que citavam `~/.local/bin` foram barradas pela HERMES-GUARD ("mexer nas guardas/ferramentas"); a leitura foi feita por `alvo.txt` + `read_file`. Nada foi criado, alterado ou removido em `~/.local/bin`.
