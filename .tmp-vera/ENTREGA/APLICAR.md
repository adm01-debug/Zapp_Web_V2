# Correção pronta: integrador confere a BASE com conjunto quando a ponta traz migration

Cartão: t_f0c461f6 (worker ci / vera). O cartão pedia editar
`/home/joaquim_ataides/arquitetura-v2/integrador/integrar.sh`, mas a guarda de agente proíbe escrita em
`~/arquitetura-v2` (é a pasta das ferramentas da fábrica): "mexer nas guardas/ferramentas do Hermes é proibido".
Por isso a correção ficou pronta aqui e **não** foi instalada. Quem instala: o Joaquim (ou a rodada do
auditor/revisor, que rodam fora das guardas de agente).

## Arquivos

| o quê | onde | md5 |
|---|---|---|
| arquivo corrigido (completo, 472 linhas) | `ENTREGA/integrar.sh` | `8fbd40f84c4145d786cd562ebd52d8ca` |
| diff unificado (72 linhas, 5202 bytes) | `ENTREGA/integrador-integrar.sh.diff` | — |
| original (base, `HEAD:integrador/integrar.sh`) | `orig-integrar.sh` | `cc765dbaa9332423f265a530b5375ae7` |
| prova controlada (script + log) | `prova/prova.sh`, `prova/prova.log` | — |

Caminho absoluto da pasta: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/`

## O que muda

1. Seção nova `CONFERÊNCIA DA BASE` (após `reteste_isolado`): `ponta_tem_migration()` (a ponta traz migration?) e
   `conferir_base()` (rota COM conjunto × rota sem banco; sobe e desmonta o conjunto `v2-integrador` na árvore
   conferida, com `zapp-db-local up`/`down`, e registra no log qual rota escolheu).
2. Ponto A (`integrar.sh:240`, base marcada vermelha): passa a chamar `conferir_base` com os pares
   `base_dia|sha` dos cartões prontos (a ponta da fila).
3. Ponto B (`integrar.sh:422`, base depois de um cartão vermelho): passa a chamar `conferir_base` com o par
   `BASE_SHA|NOVO` do cartão que acabou de entrar.
4. Comentário do QA1-03 atualizado (uma linha).

Sem migration na ponta, a chamada sai igual à de hoje: `zapp-verify full "$INT"` (sem conjunto), e o passo
`banco_local` segue `AVISO NÃO VERIFICADO`. O caminho do lote/bissecção (linhas 149 e 201) não foi tocado: ele só
carrega cartões SEM migration (a linha 191 garante isso).

## Como aplicar (fora da sessão de agente)

```bash
cd /home/joaquim_ataides/arquitetura-v2
git apply --check /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/ENTREGA/integrador-integrar.sh.diff
git apply        /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/ENTREGA/integrador-integrar.sh.diff
bash -n integrador/integrar.sh                     # sintaxe (já conferida: OK)
git commit -m "integrador: conferência da BASE usa o conjunto v2-integrador quando a ponta traz migration" -- integrador/integrar.sh
```

Alternativa (substituir o arquivo inteiro, mesmo md5 de `ENTREGA/integrar.sh`):

```bash
install -m 775 /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/ENTREGA/integrar.sh \
        /home/joaquim_ataides/arquitetura-v2/integrador/integrar.sh
```

## Prova (comandos rodados, saída em `prova/prova.log`)

```bash
bash -n novo/integrar.sh                                  # SINTAXE OK
bash /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-vera/prova/prova.sh
```

Saída (trecho real):

```
PAR COM (traz migration): dia/2026-10-04..689345d7f (supabase/migrations/20261004172554_fecha_record_incoming_call_event.sql)
PAR SEM (sem migration):  dia/2026-10-04..05859cedf
  ponta_tem_migration 'par COM' -> 0 ; 'par SEM' -> 1
ROTA 1: LOG PROVA-COM: a ponta traz migration — BASE conferida COM o conjunto v2-integrador ...
        CMD zapp-db-local up <copia> v2-integrador
        CMD zapp-verify full <copia> v2-integrador
ROTA 2: LOG PROVA-SEM: a ponta não traz migration — BASE conferida sem banco ...
        CMD zapp-verify full <copia>
```

O corpo das duas funções usado na prova é extraído por `sed` do próprio arquivo corrigido (linhas 135–171),
não é cópia digitada. O integrador inteiro não é executado: ele recusa rodar em sessão de agente e essa guarda
não se toca.
