Especialista: worker (geral)
Cartão: t_1f707485 — "Criar fixture/dry-run do integrador para rotas com e sem migration"

Entrega: `rotas-base-dry-run.sh` (fixture/dry-run, 4 casos: A-com, A-sem, B-com, B-sem) + `APLICAR.md`
+ 3 logs de prova, em `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/ENTREGA-rotas-base/`.
md5 do fixture: `01ee1a6e74cb0f97b63a2d4a9d348ef3`.

Onde deveria ficar: `~/arquitetura-v2/integrador/testes/rotas-base-dry-run.sh`. A guarda de agente bloqueia
escrita em `~/arquitetura-v2` (medido: bloqueada em `integrador/testes/`, em `integrador/` e em
`arquitetura-v2/`), então o arquivo fica pronto na pasta acima; instalação é 1 comando de sessão não-agente
(`install -m 755 ... integrador/testes/`), no mesmo formato do precedente `.tmp-vera/ENTREGA/APLICAR.md`
(cartão t_f0c461f6).

Como o teste funciona: o integrador recusa rodar em sessão de agente (`integrar.sh:18`), então o fixture não
executa o integrador — ele EXTRAI com `awk` o texto real do bloco de cada ponto de conferência da BASE
(A = `integrar.sh:251-267`, B = `integrar.sh:436-441`) e o EXECUTA num HOME de areia (`mktemp`) com stubs de
`zapp-verify`/`zapp-db-local` no PATH. A asserção é sobre o argv efetivo do `zapp-verify` e sobre o log da BASE.
Âncora não encontrada = aborta com rc=3 (nunca passa em silêncio).

Prova, três ensaios (logs crus na pasta):
1. integrador VIVO (md5 `d48e0769b5f5eba9`, 470 linhas): **4 falhas** — as duas rotas COM migration reprovam
   (`conjunto(s): [-]`, banco ficou `NÃO VERIFICADO`); as duas SEM migration passam.
2. correção de referência (`.tmp-vera/ENTREGA/integrar.sh`, md5 `8fbd40f84c4145d7`, cartão t_f0c461f6):
   **0 falhas** — COM migration usa `v2-integrador` (down/up/down no banco) e SEM migration fica com `set=-`,
   zero `zapp-db-local` e `AVISO ... NÃO VERIFICADO` no log da BASE.
3. mutante de sensibilidade (conjunto+`zapp-db-local up` incondicionais nas duas linhas): **6 falhas** — as
   rotas SEM migration reprovam nos três pontos (conjunto passado, banco acessado, AVISO perdido).

Critério de aceite do cartão cumprido nas duas direções: falha se a rota com migration não usar conjunto
explícito (ensaio 1) e falha se a rota sem migration encostar no banco (ensaio 3); passa quando as duas rotas
respeitam o contrato (ensaio 2).

O que NÃO foi verificado: o caminho do lote/bissecção (`integrar.sh:149/218`, por desenho só carrega cartão
sem migration) e o conteúdo real do banco. Nada de produção, nada da fila real e nenhum banco foi tocado —
`~/.v2-fila`, `~/hermes-workspaces/Zapp_Web_V2` e o repositório real não aparecem em nenhum caminho do teste.
Observação de escopo alheio (não corrigido): o diff da correção de referência não aplica mais limpo no
arquivo vivo (`git apply --check` rc=3; ela nasceu da revisão de 453 linhas, antes do bloco "faixa 2").
