# Fixture/dry-run do integrador: rotas COM e SEM migration nos dois pontos de conferência da BASE

Cartão: **t_1f707485** (worker/geral). Pai: t_c70e7ee3. Irmão: t_c8a65217 (edgar, edita o `integrar.sh`).
Verificação independente: t_4cdad92b.

## Por que o teste está aqui e não em `~/arquitetura-v2/integrador/testes/`

A guarda de agente proíbe escrita em `~/arquitetura-v2` (a pasta das ferramentas da fábrica): tentei
escrever em `integrador/testes/`, em `integrador/` e em `arquitetura-v2/` e as três foram bloqueadas
("editar as guardas do Hermes é proibido"). Mesmo precedente do cartão t_f0c461f6
(`.tmp-vera/ENTREGA/APLICAR.md`): a entrega fica pronta aqui e **quem instala é o Joaquim (ou a rodada
do auditor/revisor, que roda fora das guardas de agente)**.

Pasta absoluta: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/ENTREGA-rotas-base/`

| o quê | arquivo | md5 |
|---|---|---|
| o fixture (pronto para instalar) | `rotas-base-dry-run.sh` (14,5 kB) | `01ee1a6e74cb0f97b63a2d4a9d348ef3` |
| ensaio 1 — integrador VIVO (hoje) | `prova-1-vivo.log` | `f7c18e686c0fe7371bc6ed86e103ca51` |
| ensaio 2 — correção de referência | `prova-2-correcao-referencia.log` | `fd9a44f5a01a4a463e9c67c66ffe3104` |
| ensaio 3 — mutante (conjunto incondicional) | `prova-3-mutante-sem-migration.log` | `6e801e1e614cc6e6db268bdc74a9696c` |

Arquivo vivo no ensaio: `~/arquitetura-v2/integrador/integrar.sh` md5 `d48e0769b5f5eba96546d22ad74f551e` (470 linhas, 06/10 22:00).
Correção de referência: `~/hermes-workspaces/Zapp_Web_V2/.tmp-vera/ENTREGA/integrar.sh` md5 `8fbd40f84c4145d786cd562ebd52d8ca` (493 linhas, cartão t_f0c461f6).

## Instalação (fora da sessão de agente)

```bash
mkdir -p /home/joaquim_ataides/arquitetura-v2/integrador/testes
install -m 755 /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/ENTREGA-rotas-base/rotas-base-dry-run.sh \
        /home/joaquim_ataides/arquitetura-v2/integrador/testes/rotas-base-dry-run.sh
bash -n /home/joaquim_ataides/arquitetura-v2/integrador/testes/rotas-base-dry-run.sh   # sintaxe (OK)
bash /home/joaquim_ataides/arquitetura-v2/integrador/testes/rotas-base-dry-run.sh      # roda contra o integrador vivo
```

Instalado em `integrador/testes/`, o script acha o integrador sozinho (o `../integrar.sh` irmão) — não
precisa de argumento nenhum.

## O que o teste prova

Nos **dois pontos de conferência da BASE** (ponto A = `integrar.sh:251-267`, base marcada vermelha;
ponto B = `integrar.sh:436-441`, QA1-03), para as duas pontas (a que traz migration e a que não traz):

| rota | esperado | como é medido |
|---|---|---|
| COM migration | o comando efetivo do `zapp-verify` leva o **conjunto explícito** (3º argumento `v2-integrador`) e o banco É verificado | argv gravado pelo stub (`set=v2-integrador`) e log da BASE sem `NÃO VERIFICADO` |
| SEM migration | **nenhuma** chamada ao banco (zero `zapp-db-local`) e o comando segue **sem** nome de conjunto, mantendo `AVISO ... NÃO VERIFICADO` | registro do stub `zapp-db-local` vazio, `set=-` e `AVISO ... NÃO VERIFICADO` presente no log da BASE |

Critério de aceite do cartão = 4 casos, 2 por ponto: `A-com`, `A-sem`, `B-com`, `B-sem`.
`exit 0` = todas as rotas conforme o contrato; `exit 1` = alguma fora.

### Como (dry-run, sem tocar em produção nem na fila)

1. O integrador **recusa rodar em sessão de agente** (ele mesmo sai com 75, `integrar.sh:18`), então o
   teste **não executa o integrador**. Ele **extrai com `awk` o texto real** do bloco de cada ponto (e as
   definições de função do arquivo) e roda esse texto num script de areia. Nada é redigitado: o comando
   sob teste é o texto que está no arquivo-alvo. Âncora não encontrada ⇒ o teste **aborta alto** (`exit 3`),
   nunca passa em silêncio por o código ter sido refatorado.
2. Areia = `HOME` sintético (`mktemp`) com repositório git mínimo: `main` → `dia/2026-10-07` → branch do
   cartão. No caso "com", a branch do dia e a ponta trazem `supabase/migrations/*.sql`; no caso "sem",
   nenhuma das duas traz.
3. `zapp-verify` e `zapp-db-local` são **stubs** no `PATH` da areia. Cada um grava o que recebeu, e o
   `out=` (destino do stdout, via `/proc/$$/fd/1`) identifica de qual ponto veio a chamada: as duas
   verificações da BASE escrevem em `.verificacao-da-base.log`. O stub do `zapp-verify`, sem nome de
   conjunto, imprime o mesmo AVISO do `zapp-verify` real (`~/.local/bin/zapp-verify:35-37`).
4. A fila real (`~/.v2-fila`), o `~/hermes-workspaces/Zapp_Web_V2` real e o banco não são tocados: tudo
   aponta para dentro da areia.

## Resultado dos três ensaios

**Ensaio 1 — integrador VIVO (470 linhas, sem a correção): 4 falhas.** As duas rotas COM migration
reprovam, exatamente o defeito que o cartão existe para pegar; as duas SEM migration passam (comportamento
de hoje preservado).

```
-- A-com   FALHA rota COM migration NAO usou conjunto explicito — conjunto(s): [- ] (esperado v2-integrador)
           FALHA rota COM migration deixou o banco NAO VERIFICADO no log da BASE
-- A-sem   ok (sem conjunto, zero banco, AVISO/NAO VERIFICADO)
-- B-com   FALHA rota COM migration NAO usou conjunto explicito — conjunto(s): [- ]
           FALHA rota COM migration deixou o banco NAO VERIFICADO no log da BASE
-- B-sem   ok
== resumo: 4 falha(s)
```

**Ensaio 2 — correção de referência (493 linhas, cartão t_f0c461f6): 0 falhas.**

```
-- A-com   ok rota COM migration usou conjunto explicito (v2-integrador)
          nota conjunto montado antes? 3 chamada(s) ao banco citando v2-integrador   (down/up/down)
          log da BASE: VERIFY: VERDE (1s)  (sem "NAO VERIFICADO")
          rota no log: "a ponta traz migration — BASE conferida COM o conjunto v2-integrador"
-- A-sem   ok rota SEM migration nao fez nenhuma chamada ao banco | AVISO/NAO VERIFICADO no log da BASE
-- B-com   ok rota COM migration usou conjunto explicito (v2-integrador)
-- B-sem   ok rota SEM migration nao fez nenhuma chamada ao banco | AVISO/NAO VERIFICADO no log da BASE
== resumo: 0 falha(s)     TODAS AS ROTAS CONFORME O CONTRATO.
```

**Ensaio 3 — mutação de sensibilidade: 6 falhas.** Mutante = arquivo vivo com o conjunto forçado
incondicionalmente nas duas linhas de conferência da BASE (2 substituições):

```bash
python3 -c 'import sys
p,o=sys.argv[1],sys.argv[2]; s=open(p).read()
alvo="timeout 1200 zapp-verify full \"$INT\" >"
novo="zapp-db-local up \"$INT\" v2-integrador >/dev/null 2>&1 || true; timeout 1200 zapp-verify full \"$INT\" v2-integrador >"
open(o,"w").write(s.replace(alvo,novo))' \
  ~/arquitetura-v2/integrador/integrar.sh /tmp/integrar-mutante-conjunto-incondicional.sh
V2_TESTE_INTEGRAR=/tmp/integrar-mutante-conjunto-incondicional.sh bash rotas-base-dry-run.sh
```

```
-- A-com   ok    rota COM migration usou conjunto explicito (v2-integrador)
-- A-sem   FALHA rota SEM migration passou conjunto [v2-integrador] — o zapp-verify consultaria o banco
           FALHA rota SEM migration ACESSOU O BANCO: zapp-db-local up <integrador> v2-integrador
           FALHA o log da BASE perdeu o AVISO/NAO VERIFICADO na rota sem migration
-- B-com   ok
-- B-sem   (as mesmas 3 FALHA do A-sem)
== resumo: 6 falha(s)
```

Ou seja: o teste é sensível nos **dois** sentidos — falha se a rota com migration não usar conjunto
explícito (ensaio 1) e falha se a rota sem migration encostar no banco (ensaio 3) —, e passa quando as
duas rotas respeitam o contrato (ensaio 2). O ensaio 2 também prova que a extração funciona num arquivo
de layout diferente (definições 165 linhas, ponto A na 272, ponto B na 459).

## Robustez do próprio teste (ensaios 4-7)

```
4) independência de cwd e repetibilidade: rodado de /tmp e de / (V2_TESTE_INTEGRAR=correção) -> 0 falha(s) nas duas
5) alvo sem as âncoras (V2_TESTE_INTEGRAR=/etc/hostname) -> "não achei o ponto A ... teste abortado", rc=3
6) alvo inexistente -> "integrador não encontrado", rc=2
7) 4 casos (A-com, A-sem, B-com, B-sem); md5 do fixture: 01ee1a6e74cb0f97b63a2d4a9d348ef3
```

## Como rodar

```bash
bash rotas-base-dry-run.sh                                   # integrador vivo (o do dia)
V2_TESTE_INTEGRAR=/caminho/integrar.sh bash rotas-base-dry-run.sh   # outra versão / mutante
V2_TESTE_LIMPAR=1 bash rotas-base-dry-run.sh                 # apaga a areia no fim
```

## Ressalvas honestas

- O teste **não executa o integrador inteiro** (a guarda proíbe): ele exercita os dois blocos de
  conferência da BASE, com o texto real do arquivo, numa areia. O que fica fora do escopo é o caminho do
  lote/bissecção (`integrar.sh:149/218`), que por desenho só carrega cartões sem migration (garantido
  pela linha 191) — se algum dia essa premissa mudar, este teste não pega.
- O teste mede o **comando efetivo** (`argv`) e o **resultado no log da BASE** (com/sem `NÃO VERIFICADO`).
  Ele não valida se o conjunto `v2-integrador` é o conjunto certo para a cópia em produção, nem o conteúdo
  do banco.
- A correção de referência está pronta em `.tmp-vera/ENTREGA/integrar.sh` (cartão t_f0c461f6), mas o diff
  dela **não aplica mais limpo** no arquivo vivo (`git apply --check` sai rc=3; ela nasceu da revisão de
  453 linhas, antes do bloco "faixa 2"). Quem instalar a correção precisa revalidar com este teste.
- Se a correção entrar com outro nome de conjunto que não `v2-integrador`, o ensaio "com" reprova — o nome
  é o seletor já usado no fluxo (`integrar.sh:382`) e é o único que o cartão com migration monta.
