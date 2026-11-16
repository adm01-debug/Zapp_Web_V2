# Trilha bruta da auditoria das 329 entradas

Este diretório guarda o **material de origem** da auditoria adversarial que fechou as 329
branches/PRs do resgate de 15/11. O resultado já estava versionado em
`analise-prs/resgate-261115/auditoria/` (o `itens-confirmados.json` com as 226 evidências e os
13 arquivos de lote); o que faltava era **o que produziu esse resultado**.

Sem isto, era impossível refazer a conta: durante a própria auditoria foi preciso voltar aos
diários para restaurar 221 pareceres de revisor que um script meu havia cortado em 160
caracteres. Se este material sumisse com o contêiner, essa reparação não poderia ser repetida
nem conferida.

## O que é cada pasta

| Pasta | Arquivos | O que guarda |
|---|---|---|
| `items/` | 381 | A **entrada** de cada branch/PR: `tip`, `merge_base`, `ahead`, data do último commit e o diff que o auditor leu. É o estado do repositório no momento da análise. |
| `triagens/` | 329 | O **primeiro veredito** de cada entrada (`INCORPORADA`, `OBSOLETA`, `PERDA`…), com resumo em linguagem de negócio e confiança declarada. |
| `verificacoes/` | 328 | A passada **adversarial**: um segundo agente tenta *refutar* o veredito da triagem procurando por comportamento, não por caminho de arquivo. Traz `concorda`, `veredito_final` e o motivo. |
| `reexames/` | 47 | Terceira passada nas entradas em que a verificação derrubou ou colocou em dúvida o veredito. |
| `achados/` | 47 | Os hunks concretos (commit, arquivo, linhas, amostra) que sustentam cada achado de perda. |
| `lotes/` | 36 | Os resumos por lote de execução (`RX*`, `T*`, `VA*`, `VP*`) e os `resultados/` consolidados de cada frente. |
| `metodo/` | 4 | Os prompts exatos que definiram cada passada. São eles que tornam o resultado reproduzível. |

Na raiz: `vereditos-finais.json` (o veredito por entrada depois das três passadas) e
`perda-intermediaria.json` (as perdas candidatas antes do corte final).

Mais duas pastas, acrescentadas no fechamento da sessão para não deixar nada só no contêiner:

| Pasta | Arquivos | O que guarda |
|---|---|---|
| `dossies-prs-antigas/` | 199 | Dossiês de PRs **anteriores** ao resgate (números 1930–2200 em diante), com veredito por PR. Conjunto distinto do `../dossies/`: 193 destes não existiam no repositório. |
| `diarios-sessao/` | 235 | Todo o restante do material da sessão cujo conteúdo não estava no repositório — argumentos de orquestração (`args-*.json`, `argsB/argsC`), consolidações (`auto.json`, `auto2.json`, `backlog-resgate.json`, `audit.json`) e os relatórios intermediários. |

**Leia `diarios-sessao/` com uma ressalva:** parte desses arquivos **não é autoral** — são
extratos de arquivos que vivem em *outras branches* do próprio repositório, copiados para
servir de lado esquerdo/direito de uma comparação. O nome diz qual é qual: prefixo `br-`,
`branch-` ou `branch_` é a versão **da branch**; `main-`, `ba-` ou `base-` é a versão **da
`main`**; `del-`/`add-` são as linhas removidas/adicionadas. Esses extratos estão aqui por
completude da trilha, não porque corriam risco: o original continua na branch no GitHub.
O que é mesmo autoral desta sessão são os `args-*`, `auto*`, `backlog-resgate`, `audit.json`
e os dossiês.

## Como isto se liga ao resultado

O `itens-confirmados.json` da pasta de cima é o **destilado** destes diários: cada um dos 226
itens aponta para a `branch` e traz o campo `prova` e o `motivo_revisor`, que vêm respectivamente
de `achados/` + `triagens/` e de `verificacoes/` + `reexames/`. Para conferir qualquer item,
procure o `id` da branch com o mesmo nome de arquivo nestas pastas.

**Aviso que vale repetir:** os 226 são *evidências*, não tarefas. Várias apontam para o mesmo
arquivo (24 delas para um único arquivo de teste). Contar linhas aqui não dá a quantidade de
trabalho que falta.

## Procedência

Arquivos gerados pelos agentes da auditoria durante a sessão de 15–16/11 e preservados sem
edição. Os únicos textos que parecem segredo são JWTs **falsos** dentro de código de teste
(`JWT_FAKE`, payload `{"sub":"1234"}`), fixtures do guard de redação de log GA38 — conferidos
um a um antes deste commit.
