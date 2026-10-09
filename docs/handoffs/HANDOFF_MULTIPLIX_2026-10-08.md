# HANDOFF — Multiplix (Zapp_Web_V2) · 2026-10-08

Documento de encerramento do **PLANO DE FINALIZAÇÃO — MULTIPLIX (Zapp Web V2) · 100 etapas**
(item **F100**, Bloco J). Escrito em 08/10/2026 a partir do que foi **medido** nesta data;
onde não houve medição, está dito explicitamente.

## 1. Onde isto vive

| | |
|---|---|
| Módulo | **Multiplix** — disparo assistido em três regiões (01 público → 02 composição → 03 prévia e revisão) |
| Plano que este documento encerra | `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md` |
| Plano anterior (superado) | `docs/multiplix/PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_2026-09-26.md` |
| Retrospectiva irmã | `docs/audits/RETRO_MULTIPLIX_2026-10-08.md` |
| Ledger de reconciliação (fonte das contagens) | `docs/reconciliation/tasks/P039.json` |
| ADR vigente | `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md` |
| ADR anterior | `docs/adr/ADR-007-multiplix-ponte-singu.md` (Superseded by o acima) |
| Documentos do módulo | `docs/multiplix/` — `CANAL.md`, `PERMISSOES.md`, `PONTE_SINGU.md`, `DESIGN_TOKENS_MAP.md` |
| Especificação de produto | `docs/design/Multiplix_ZAPP_V2_Especificacao (1).md` |
| Código de tela e estado | `src/components/multiplix/`, `src/hooks/integrations/useMultiplix*.ts` |
| Código de servidor | `supabase/functions/multiplix-dispatch/`, `multiplix-send/`, `multiplix-audience/`, `multiplix-voices/` |
| Contratos do produto | `tests/contracts/multiplix-*.contract.test.ts` |
| Contrato deste encerramento | `tests/contracts/multiplix-handoff-f100.contract.test.ts` |

O identificador do projeto de banco **não** aparece aqui de propósito: o repositório tem contrato
que proíbe expor esse identificador em documento.

## 2. Estado do plano, medido em 08/10/2026

Duas leituras, de propósito diferentes:

- **Checkboxes do próprio plano:** 61 marcados `[x]` e **39 em aberto** — `F18`, `F60`, `F63` e todo
  o `F65`–`F100`. O critério de pronto do F100 é "**100/100 marcados com evidência**"; logo, **não
  atingido**.
- **Ledger de reconciliação** (`docs/reconciliation/tasks/P039.json`): 3 `DONE_VERIFIED` (F19, F28,
  F29), 34 `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE`, 30 `PARTIAL`, 15 `NOT_IMPLEMENTED`, 5
  `VALIDATED_FAIL`, 5 `ACTIVE_REGRESSION`, 5 `BLOCKED_EXTERNAL`, 1 `NEEDS_REVALIDATION`, 1
  `OBSERVATION_WINDOW`, 1 `HUMAN_ACCEPTANCE`. As contagens exatas e a comparação bloco a bloco
  estão em `docs/audits/RETRO_MULTIPLIX_2026-10-08.md`.

Por que os números divergem: o ledger só promove a `DONE_VERIFIED` o que foi reexecutado na cadeia
final; evidência escrita dentro do plano (hétero-relato histórico) não promove item. O encerramento
não maquia isso: **o Multiplix tem boa parte entregue e auditável, mas não está "100/100 com
evidência"**.

## 3. O que ficou fora

### 3.1 Não implementado (15 itens)

`F65` (fila de preparação de voz na edge), `F68` (gravação no compositor), `F69` (falha de
TTS/carregamento não pode sair pela metade), `F72` (view com as 3 regiões simultâneas), `F74` (lista
virtualizada e "selecionar todos os N do servidor"), `F76` (painel 02 — bloco de texto),
`F77` (blocos de voz, gravação e arquivo na prévia e no envio), `F78` (contagem N×M e autosave no
servidor), `F79` (painel 03 — destinatário, aptidão, revisão e congelamento), `F82` (repetir com
inteligência), `F83` (exportação CSV/JSON pela edge, respeitando escopo), `F85` (registrar envio como
interação no Singu), `F90` (E2E do fluxo no pipeline), `F92` (flag por departamento — ver §6),
`F94` (documentos finais do módulo).

### 3.2 Bloqueado por decisão do dono ou por terceiro (5 itens)

`F63` (teste real de PTT no canal), `F66` (estimativa de consumo × realizado e tetos),
`F95` e `F96` (pilotos com operador em Compras e Logística), `F97` (fechar o GATE C — as 5 RPCs
antigas do Singu ainda alcançáveis por `anon`).

### 3.3 Validado com falha — precisa voltar ao código (5 itens)

`F37`, `F42`, `F48`, `F55`, `F56`. A avaliação do ledger é "a prova voltou negativa"; tratar como
defeito aberto, não como pendência documental.

### 3.4 Regressão ativa (5 itens)

`F08`, `F10`, `F13`, `F17`, `F44` — itens do Bloco A e do Bloco E cuja verificação voltou a apontar
divergência. São os primeiros a conferir antes de qualquer avanço de tela.

### 3.5 Parciais (30 itens)

`F11 F25 F27 F41 F43 F45 F46 F50 F51 F54 F57 F59 F60 F62 F64 F67 F70 F71 F73 F75 F80 F81 F84 F86
F87 F88 F89 F91 F93 F99` — entregues em parte, sem fechar o critério do próprio item.

## 4. Dívidas

| Dívida | Item | Dono / como fecha |
|---|---|---|
| Flag por departamento ausente (kill switch atual é a permissão nomeada) | F92 | Decisão registrada em §6; implementar exige trilha de banco |
| Documentos finais do módulo (`SCHEMA.md`, `ARQUITETURA.md`, `COMPONENTES.md`) | F94 | card próprio |
| Pilotos com operador (Compras, Logística) | F95, F96 | operação, com envios reais registrados |
| GATE C: RPCs antigas do Singu ainda alcançáveis por `anon` | F97 | decisão do dono; mexe em banco de terceiro |
| Go-live amplo + 72 h de observação | F98 | decisão do dono |
| Grafo do repositório no commit final | F99 | regenerar e registrar |
| Deriva do guard de banco ao vivo | F18 | reconciliar pelo lado certo |
| Estimativa de consumo × realizado e tetos | F66 | decisão de custo |
| Teste real de PTT no canal | F63 | número interno, operação |

## 5. Evoluções (as três nomeadas no item)

As três vêm da especificação de produto (`docs/design/Multiplix_ZAPP_V2_Especificacao (1).md`) e
**nenhuma foi implementada** até 08/10.

### 5.1 Linguagem natural

Interpretar uma frase ("fornecedores de embalagens de São Paulo") em filtros estruturados
suportados, **mostrar os filtros produzidos** e nunca transformar a frase direto em disparo nem
ampliar a base quando a interpretação falhar. É a evolução de maior risco do módulo: qualquer
atalho aqui transforma um erro de leitura em envio para quem não devia.

### 5.2 Pressão de contato

Mostrar comunicações recentes vindas de Campanhas e de Multiplix e alertar quando a pessoa já foi
acionada, considerando finalidade e contexto — aviso operacional necessário não é a mesma coisa que
repetição de campanha. Precisa de fonte única de histórico (`crm_contact_links` e o registro de
envio do próprio Multiplix) e de regra declarada, não de heurística silenciosa.

### 5.3 Tarefas automáticas

Converter resposta de destinatário em tarefa, e permitir "repetir com inteligência" (não
respondidos, falhas corrigíveis, novos no público) sempre passando por nova revisão. O item F82 do
plano é a metade "repetir"; a outra metade (virar tarefa) ainda não tem item.

## 6. Decisão sobre a flag

**Decidido em 08/10/2026: MANTER o kill switch que existe e NÃO criar a flag
`multiplix_enabled_departments`.**

- **Medido:** a flag `multiplix_enabled_departments` **não existe** em `src/` nem em
  `supabase/functions/` — zero ocorrências. Ela só aparece no plano (F92) e no inventário de
  melhorias.
- **O kill switch que já funciona** é a permissão nomeada `multiplix.dispatch.create`: sem ela a
  entrada sai da navegação primária (`src/components/layout/Sidebar.tsx`), a rota é negada
  (`src/services/navigation.service.ts`) e a permissão vem do servidor
  (`src/hooks/system/useUserRole.ts`, matriz em `role_permissions`). Desligar para um perfil é uma
  linha em banco de permissão — **sem deploy**.
- **O que a flag acrescentaria** é o recorte *por departamento* em `global_settings`, e o item F92
  pedia isso mais telemetria (abrir, confirmar, erro). Exige linha nova em tabela — exatamente a
  trilha de banco que esta leva não abre.
- **Consequência:** `F92` segue **não implementada** e passa a viver como dívida explícita (§4), não
  como promessa de plano. Quem implementar a flag **precisa revisar esta seção**: o contrato
  `tests/contracts/multiplix-handoff-f100.contract.test.ts` quebra de propósito se a flag aparecer no
  código e a decisão não for atualizada.

## 7. Como retomar

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"

# estado do plano pelo ledger (NÃO use grep -r nos JSON de reconciliação: ~1 MB numa linha)
jq -c '.plan.status_counts' docs/reconciliation/tasks/P039.json
jq -r '.tasks[] | [.id,.status] | @tsv' docs/reconciliation/tasks/P039.json

# contratos do Multiplix (suíte de contrato)
bunx vitest run --config vitest.contracts.config.ts tests/contracts/multiplix-handoff-f100.contract.test.ts

# pendências por item
grep -nE '^- \[ \] \*\*F' docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md
```

Antes de abrir qualquer item do Bloco I (tela) ou do Bloco J (teste e roll-out), leia as §3.3 e §3.4
acima: há defeito confirmado e regressão ativa esperando, e refazer tela em cima de item falho
esconde o defeito.

## 8. Armadilhas

- Os JSON de `docs/reconciliation/` são enormes numa linha só: `grep -r` neles estoura a saída e
  derruba a máquina. Use `jq`.
- O plano marca `[x]` com evidência escrita; o ledger **não** aceita isso como prova. Não promova
  item por leitura do plano.
- Contagem de itens: o plano tem exatamente 100 itens `F001`–`F100`; qualquer soma diferente de 100
  é erro de leitura, não divergência.
- O identificador do projeto de banco não entra em documento (há contrato no repositório).
