# Item 95 — Cérebro: mapa novo em `claude-cerebro`

> Documento criado em 2026-10-08 para fechar a conferência do item **95** do
> `docs/migration/PLANO.md` (Fase 8 — verificação final), catalogado em
> `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv:702` como
> `Outros · Cerebro · NAO_VERIFICAVEL · "Artefato fora do repo."`

## O que o item pede

> `docs/migration/PLANO.md:108` — "95. Cérebro: atualizar `claude-cerebro` com o mapa
> novo (refs, domínios, MCPs, onde cada segredo mora)."

`claude-cerebro` é um vault **fora deste repositório** (o próprio inventário marca o item
como `NAO_VERIFICAVEL` e diz, em "O QUE FALTA": *"Artefato fora do repo."*). O trabalho do
item é copiar o mapa para esse vault — não há nada de código a corrigir neste repositório.

## Conferência na ponta do dia (210c3e7c1)

Não existe caminho deste repositório para a lacuna. Provas:

```
$ git rev-parse --short HEAD
210c3e7c1

$ git grep -n "claude-cerebro" -- .
docs/migration/PLANO.md:108            # o próprio item 95
docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv:702   # o item no inventário
docs/audits/PLANO_BANCO_UNICO_200_ETAPAS_2026-09-24.md:176  # citação histórica
docs/reconciliation/...                # citações históricas da mesma frase
# -> só referências de plano/inventário; nenhum artefato `claude-cerebro`

$ git ls-files | grep -i cerebro
(vazio)                                # nenhum arquivo com "cerebro" no nome
```

Fora do repositório, também não existe nesta máquina: a busca em `~`, `~/projetos`
(profundidade 3), `~/arquitetura-v2` e `~/.claude` não encontra `claude-cerebro`. A nota de
memória do Claude de 05/10/2026 já registra o achado
(`~/.claude/projects/-home-joaquim-ataides/memory/arquitetura-v2-4-regras.md`,
linhas 39–40): *"Vault `claude-cerebro`: não existe nesta máquina (procurado em ~ e no
perfil do Windows em 05/10)".*

## O mapa novo já está pronto no repositório

O conteúdo que o item manda copiar para o vault é exatamente o mapa já mantido, como fonte
de verdade da migração, em `docs/migration/HANDOFF.md`:

| Seção | Conteúdo (o que o item chama de "mapa novo") |
|-------|----------------------------------------------|
| §2 — Identidades e endereços | refs de origem/destino, pooler, repositórios, worker MCP e seus conectores, VPS, Evolution GO, lab |
| §3 — Credenciais (onde estão) | onde cada segredo mora (arquivos/caminhos e nomes de variável), sem valores |
| §4 — Ferramentas MCP | qual MCP serve para quê e armadilhas de cada um |

Complementos: `docs/migration/PARITY-REPORT.md` (fingerprint do destino) e
`docs/migration/DECISIONS.md` (decisões da migração).

## Por que não há teste

O item não muda comportamento de código — é copiar um mapa para um vault externo. Não há
função, handler ou tela a exercitar; a prova é a ausência de caminho no repositório
(`git grep` / `git ls-files`, acima). Nenhum arquivo de código foi tocado.

## Ação do dono (fora do repositório)

Criar/atualizar o vault `claude-cerebro` copiando o mapa de `docs/migration/HANDOFF.md`
§2–§4 (refs, domínios, MCPs e onde cada segredo mora). Nada a alterar neste repositório.
