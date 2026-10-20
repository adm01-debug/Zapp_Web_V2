Especialista: complexo (area-sql-banco)

# Relato — t_137805b5: provar não-regressão (migrations realmente falhas continuam reprovando)

A entrega é PROVA, não código: o diff versionado sai vazio por construção (`git diff --name-only
dia/2026-10-07...HEAD` = vazio). O conserto do `zapp-verify` (patch de `explicada()` de t_699fa539) NÃO está
instalado — a guarda recusa escrita de agente em `~/.local/bin`. Por isso a prova roda sobre uma CÓPIA
byte-exata: alvo vivo `aa5301f7…5508` + patch entregue = `82fa553d…f63d` (sha conferido, `bash -n` rc=0).
A rota `--aceitar` do integrador (t_59eb0a93) já está instalada (integrar.sh `dc5237c5…`, mtime 17:45,
`ACE_OPT` nas linhas 518-537).

## Critério de pronto → prova

**1. As 21 falhas reais de 794 migrations continuam reprovando** (logs `logs/conjunto-completo-*.log`)
- `ls REF_COPIA/supabase/migrations/*.sql | wc -l` = **794**.
- `REF_ESTADO/falhas.tsv` = **21 linhas**, sha256 `16a06b0796e447d19ed9b2473b6c1bebdcef1a45df19d1b4ac7a8c194421daae`;
  `diff` da 1ª coluna contra `~/.local/share/zapp-local/falhas-esperadas.txt` = **vazio** → as 21 falhas são
  exatamente as esperadas.
- `zapp-db-local check REF_COPIA v2-26100709037ed9` (somente `check`; nunca `up`): `ESTRUTURA: 47 diferença(s)`,
  rc=1; o sha256 de `falhas.tsv` é IDÊNTICO antes e depois → **falhas.tsv inalterado**.
- `comm -12` entre as 21 falhas e a lista de aceite `t_59eb0a93/261006143922bb.txt` = **0 linhas**; e
  `falhas-esperadas.txt` ∩ lista de aceite = **0** → nenhuma falha real entrou como "aceita".
- Bloco do portão no estado real (W = REF_COPIA com a pendente `20261005224959_…` restaurada, ST = estado real):
  **ATUAL rc=1 FALHOU** ("rls|inbound_message_effects; indexes|…_pkey; constraints|relation:…_pkey (+…)");
  **NOVO rc=0 `ok|drift=0`**.
- Regra estrita (migration pendente consta em `falhas.tsv`): **FALHOU rc=1 nas DUAS versões** —
  "migration pendente falhou no conjunto: 20261007095739_indeterminate_optout_outbox.sql".

**2 a 5. Casos negativos — continuam reprovando (saída crua em `logs/`; re-rodados por MIM, iguais aos do Devin)**

| caso | linha | ANTES | DEPOIS |
|---|---|---|---|
| A `c2-rls-negativo` | `rls\|t137805b5_ausente` (tabela não criada) | FALHOU rc=1 | FALHOU rc=1 |
| B `c4-index-negativo` | `indexes\|foo_bar.foo_bar_pkey` (foo_bar não citada) | FALHOU rc=1 | FALHOU rc=1 |
| C `c5-column-negativo` | `columns\|t137805b5_pend.col_nao_citada` | FALHOU rc=1 | FALHOU rc=1 |
| D1 `c6a-acl-policy-negativo` | `policies\|t137805b5_pend.pol_errada` (pendente só cria `pol_certa`) | FALHOU rc=1 | FALHOU rc=1 |
| D2 `c6b2-acl-papel-naocitado` | `relation_grants\|…\|auditoria_role\|SELECT` (papel fora dos padrão, não citado) | FALHOU rc=1 | FALHOU rc=1 |
| D3 `c6c-acl-funcao-negativo` | `routine_grants\|f:t137805b5_fn(…)\|authenticated\|EXECUTE` (função não criada) | FALHOU rc=1 | FALHOU rc=1 |
| estrito `c8-real-falha` | pendente em `falhas.tsv` (estado real) | FALHOU rc=1 | FALHOU rc=1 |
| igual-antes-e-depois `c6b`/`c6d` | papel CITADO no texto da pendente | EXPLICADA | EXPLICADA |

Dois desvios do texto literal do cartão, ditos com todas as letras:
- `c6b` (pendente com `grant … to relatorio_role` e diff citando `relatorio_role`) sai EXPLICADA nas DUAS
  versões: a regra ANTIGA do portão (`cita(papel)`) já explica papel citado no texto da pendente. O negativo
  pretendido (papel NÃO citado) está coberto por `c6b2`. Não é regressão: idêntico antes e depois.
- A 4ª classe que muda de veredito: `policies` com nome entre aspas. Conferi na fonte: a pendente
  `20261005183057_ia_timeout_001_event_id_outbox.sql` traz literalmente
  `create policy "Service role can manage AI usage outbox"` (linha 61) — é a MESMA prova "nome citado no texto
  da pendente" que já existia para `policies`; o patch só tirou aspas/caixa do alvo (o `\b` antigo não casava
  ao lado das aspas). Duas linhas no diferencial (stacks …1517b70e e …201329a5). Está FORA das 3 classes
  nomeadas pelo cartão e vai dito aqui.

**Controles positivos (mudam de FALHOU → `ok|drift=0`)**: `c1` (`rls` de tabela criada pela pendente), `c3`
(`indexes`/`constraints` com `_pkey` gerado da tabela criada), `c7-real` (as 47 linhas do estado real).

## Diferencial (prova de que NÃO há alargamento) — `diferencial/saida.txt` e minha reconferência

44 estados reais (toda `stacks/*/estado` com `copia.txt` → cópia existente com `.hermes-tarefa`),
**18.873 linhas** comparadas linha a linha, com as pendentes lidas de `APLICADA_LOCAL` do `.hermes-tarefa`:
- 18.793 vereditos iguais; **80 mudaram, todos FALHOU → EXPLICADA**;
- por classe: **rls 13, nome-gerado 25, acl-padrao 40** (as 3 do cartão) + **policies-citada 2** (acima);
- **explicada ANTES e FALHOU DEPOIS = 0** (zero regressão em qualquer direção);
- **mudança fora das classes nomeadas = apenas as 2 de policies-citada**.
Re-rodei o diferencial EU MESMO: saída byte-idêntica à do Devin.

## O que EU conferi (não é o relato do Devin)

- **Escopo**: `git diff --name-only dia/2026-10-07...HEAD` vazio; `git status --short` vazio.
- **Alvo intocado**: sha256 de `~/.local/bin/zapp-verify` = `aa5301f7…5508` antes e depois; cópia = `aa5301f7`
  → patch → `82fa553d…f63d`; `bash -n` rc=0; **um único hunk `@@ -126,25 +126,62 @@`, integralmente dentro do
  bloco python (linhas 117-203)**: fora do bloco, o shell é byte-idêntico (diff vazio) — o portão não muda de
  mecânica, só a classificação da linha.
- **Blocos extraídos por mim** (entre a linha `python3 - <<'PY'` e a linha `PY`): `cmp` byte-idêntico aos usados
  pelo Devin; `bloco-atual.py` sha256 `f6828357521bfb7d05abf869cf867d8ec763fa2eb7c84945f0a164e0e3f50d5f`
  (= o registrado por t_699fa539).
- **Matriz**: re-rodei os 12 casos nos dois blocos; vereditos idênticos aos do Devin (logs em
  `../conferencia/casos/`).
- **Fixtures reais**: `c7-real/estado/check-diferencas.txt` é byte-idêntico ao estado real daquele conjunto
  (47 linhas); a pendente restaurada tem sha256 `0724249a2aa90732…` = o sha registrado na `.hermes-tarefa`
  da cópia; a cópia da fixture reúne 795 arquivos (794 da REF_COPIA + essa pendente).
- **Nada de outro cartão foi escrito**: `git status` da REF_COPIA limpo; `falhas.tsv` da REF com o mesmo sha
  de antes; nada em `~/.local/bin` nem em `~/arquitetura-v2`.
- **Verificação**: `zapp-verify . --rapido` re-rodado por mim → `VERIFY: VERDE SEM BANCO (282s)`
  (db_guard, tipos, lint, migrations OK; banco não verificado por falta de nome de conjunto — esperado).

## Achados fora do escopo (registrados no cartão, não corrigidos)

1. Com `zapp-db-ler` recusando agente (rc=77, "PROIBIDO a agentes"), `LEDGER_OK=0` e o passo `banco_local` do
   `zapp-verify` fica SEMPRE estrito: o caminho "AVISO / diferença explicada pela pendente" nunca dispara para
   agente — ele só existe para quem lê o registro da produção (o integrador). O conserto não altera isso (é do
   wrapper, byte-idêntico), mas convém saber: a mudança de veredicto do cartão aparece no portão do integrador.
2. A REF_COPIA (`…/Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9`) tem
   `APLICADA_LOCAL=20261005224959_inbound_message_effects_outbox.sql` no `.hermes-tarefa`, mas esse arquivo
   NÃO existe mais em `supabase/migrations/` (consolidado; base em `.tmp/base_inbound_message_effects_outbox.sql`,
   sha `0724249a2aa90732`). Rodando os blocos direto com `W=REF_COPIA`, os dois estouram `FileNotFoundError`
   → rc=1 nas duas versões (veredicto igual, sem alargamento). É registro velho de migration renomeada.
3. O script do diferencial depende de rodar no próprio diretório (usa caminhos relativos ao `__file__`); rodado
   de uma cópia, ele compara 0 linhas e sai "verde" — fragilidade de prova, não do portão.

## O que NÃO foi feito

- Nenhum arquivo versionado tocado, nenhum commit. `hermes-tarefa-fechar` **não se aplica**: o próprio script
  exige commit novo em relação a `dia/<hoje>` (linha 41) e este cartão não muda arquivo de projeto — a entrega
  é a evidência em `.tmp/prova/` + `.tmp/conferencia/`, anexada ao cartão.
- Não instalei o patch (guarda), não rodei `zapp-db-local up/down`, não toquei em banco de produção, não fiz
  push/merge/deploy, não mexi em `~/arquitetura-v2/**`, `~/.local/bin/**` nem em workspace de outro cartão.
