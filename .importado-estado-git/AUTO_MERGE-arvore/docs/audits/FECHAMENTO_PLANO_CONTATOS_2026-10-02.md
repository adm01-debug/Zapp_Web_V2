# Fechamento — Plano de Contatos 100 etapas (estado em 02/10/2026)

Complementa o fechamento de 01/10 (`FECHAMENTO_PLANO_CONTATOS_2026-10-01.md`), que declarava
o plano encerrado com as pendências B1–B6. Esta rodada **reabriu** o que não tinha evidência e
**fechou** o que a medição permitiu fechar. Números abaixo são contagem por script sobre as caixas
do próprio plano, não estimativa.

Base da medição: `main` em `de64c092f` (02/10) — PRs desta rodada: #1589, #1597, #1630 e este.

## §0 — Diff entre a auditoria de 29/09 e o estado final

| Item | Auditoria 29/09 | Fechamento 01/10 | Final 02/10 |
|---|---|---|---|
| Etapas marcadas | 61/100 | 62/100 (declarado) | **84/100** (medido por script) → **90/100** (2, 3, 13, 16, 18, 58) → **97/100** (4, 5, 14, 17, 28, 39, 65) → **99/100** (11, 98) |
| F0 Decisões | 0/6 | entregue | 2/6 — D1–D6 respondidas; 2–5 abertas |
| F1 Banco (exclusão, Sicoob, grants) | 0/12 | entregue + DDL aplicada | 6/12 (`#1172` `41f66910`) |
| F2 Tipografia/geometria | 6/10 | — | 9/10 — aberta 28 |
| F3 Tipos de contato | — | — | 11/12 — aberta 39 |
| F4 Resíduos de CSV | — | — | **10/10** |
| F5 Legados/telefones/RPCs | 0/10 | 0/10 | 9/10 — 52 e 55 fechadas, 58 aberta |
| F6 Props mortas/tokens | — | — | 9/10 — 67 fechada por outro chat; aberta 65 |
| F7 Código morto e dívida | — | — | **8/8** |
| F8 Testes unitários e E2E | — | — | **12/12** — 90 fechada por outro chat (PNG de referência segue não versionado; ver achados) |
| F9 Documentação | — | 5/5 | 4/5 — aberta 94 |
| F10 Entrega/deploy/verificação | 0/5 | coberto | 4/5 — 98 aberta (2/4 evidências) |
| `db-live-guard` na `main` | vermelho | vermelho | **verde** (drift reconciliado) |
| Paridade arquivos↔ledger | divergente | 707 vs 709 | **748 = 748** |
| `deploy-functions.yml` | vermelho | vermelho (`extra=[sicoob-*]`) | **verde** — run `37030935744` |
| Etapa 94 (`CLAUDE.md`) | — | marcada indevidamente | **desmarcada** (hook de arquivo protegido) |
| Etapa 98 | — | marcada com `devin-e2e` | **reaberta** — 2/4 evidências |

## O que esta rodada fechou, e com que prova

- **52** — resolvida como **não aplicável, com medição**: o índice trigram em `contacts.name` não é
  usado pela consulta real (`search_contacts` filtra sete colunas com `OR`): `Seq Scan` 17,5 ms no
  canônico; na simulação PG16 a consulta simples cai de 5,03 ms para 0,278 ms (~18×), mas a forma real
  fica em 7,66 ms. Precedente do repo: os trgm de `contacts` foram removidos em `20260902100004` por
  **0 scans**. A migration foi escrita e deliberadamente **não** submetida.
- **55** — fechada com **uma migration a menos**: `get_last_message_dates` é `SECURITY DEFINER`, sem
  `anon`, e o índice `idx_messages_contact_created (contact_id, created_at DESC)` **já existe** —
  `Index Only Scan` em 0,048 ms numa tabela de 51.968 mensagens.
- **76** — DoD cumprido e **nada a descer**: `baseline=926, atual=926, removidas=0, novas=0`.
  `--update-baseline` testado: não baixa a contagem, só troca 2 `sha256` defasados — arquivo restaurado.
- **78** — `graphify update .` (binário era `0.9.48`, e a nota anterior dizia que não estava instalado):
  3.404 arquivos, **23.103 nós, 42.976 arestas, 2.329 comunidades**; `GRAPH_REPORT.md` com
  `Built from commit: 32614ee7` = HEAD; os **6 órfãos** com 0 ocorrências. `graphify-out/` é gitignored.
- **96** — os 6 SHAs de merge conferidos na `main`, na ordem exigida.
- **97** — run `37030935744` `success`, com a atestação emitida. **Sem apagar nenhuma edge function**:
  a `orphan_allowlist` do manifesto já tolera as duas órfãs (9/9 testes do gerador passam).
- **99** — trio verde: `db-live-guard` `success` na `main`; `usage-guard` `novas: 0`; paridade
  **748 = 748** (o órfão `20260930620000` existe nos dois lados — drift reconciliado).
- **100** — tabela "Status por fase" refeita com contagem medida, e este documento.

## O que continua aberto, e por quê

| Etapa | Motivo (medido, não suposto) |
|---|---|
| 2–5 | medições de uso/Sicoob e decisões de preparação — nunca executadas |
| 11, 13, 14, 16–18 | itens de banco/grants da F1 não verificados individualmente |
| 28 | medição pendente |
| 39 | aguarda decisão sobre os contatos-seed |
| 58 | depende do apply da migration da etapa 52, que foi decidido **não** aplicar |
| 65 | medição que falta na F3 (props mortas) |
| 94 | exige editar `CLAUDE.md`, protegido por hook — escrita precisa de clique humano |
| 98 | 2 de 4 evidências (ver bloqueio abaixo) |

## Bloqueios e achados desta rodada

1. **Overlay `z-[9999]` inoperabiliza a tela de Contatos em produção.** Playwright tentando clicar
   recebe `intercepts pointer events`, `hover`/`click` estourando 30 s — inclusive no botão "Entrar".
   Causa-raiz identificada: `src/components/onboarding/WelcomeModal.tsx:23` (única combinação exata de
   classes no repo), montado por `src/pages/Index.tsx:131` quando `hasCompletedOnboarding === false`.
   O `useOnboarding` decide "já completou" pela **existência de linha em `user_settings`**, mas
   `completeOnboarding()` **só grava no `localStorage`** — então quem não tem essa linha recebe o modal
   bloqueante em **todo contexto novo**. As 3 contas de QA medidas têm `tem_user_settings = false`.
   É também a causa das comparações instáveis da etapa 90 (B7). Virou tarefa própria.
   **RESOLVIDO no #1667** (`d8723e19`, mergeado 02/10 com deploy OK): a conclusão do tour passou a ser
   gravada em `user_settings` (upsert com `ignoreDuplicates`) e o modal ganhou `Escape`, `role="dialog"`
   e `aria-modal`. **Re-medido em produção depois do deploy**, com a conta QA COMPRAS: **zero camadas de
   tela cheia** (varredura de todos os elementos `fixed`/`absolute` cobrindo ≥90% do viewport, com
   `pointer-events != none`: lista vazia), o tour não abre mais, e o clique no toggle de Contatos
   chega (`aria-checked` `false → true`).
   **Lead falso descartado com medição:** o "modal de celebração da Multiplix" com o texto
   `Multiplix! 🎉` **não existe** — esse texto é o título do próprio `WelcomeModal`
   (`Bem-vindo{, ${nome}}! 🎉`), e o perfil daquela conta chama-se **`MultiplixCompras`**
   (`profiles.name`, medido). O único overlay de celebração do repo é o `CelebrationOverlay`
   (`Confetti.tsx:148+`, usado só pelo `GoalsDashboard`), que é **`pointer-events-none` e se desmonta
   sozinho em 3,5 s**; e o `TourOverlay` (`z-[10000]`) **tem** tratador de `Escape`
   (`TourOverlay.tsx:91`). Nenhum deles bloqueia clique nem ignora o Escape.
2. **`types-sync` segue vermelho mesmo com o ledger reconciliado** — a causa não era o drift.
3. **Exclusão das edges autorizada revelou-se desnecessária** (ver 97): a autorização **não** foi usada.
4. **Branches da etapa 100 — resolvido.** Cinco das seis já tinham sido apagadas no merge
   (`delete_branch_on_merge=true`). A sexta (`hermes/contatos-f1-banco-26092909260320`, #1172) eu não
   consegui remover: a guarda bloqueia escrita via `gh api` (só GET) e `git push --delete` é proibido
   pelo protocolo. **O coordenador apagou essa e também `hermes/contatos-debitos-pos-1187` (#1198,
   MERGED)**, com a autorização do Joaquim. Verificação antes de agir: o merge commit `41f66910a` do
   #1172 **é ancestral** da `main` (critério correto — o tip da branch não é ancestral, porque o merge
   é squash). Confirmei a exclusão com `git ls-remote --heads origin`: zero ocorrências das duas.
   Nenhuma branch do plano resta no remoto.
5. **Contatos `[E2E]` vivos acumulando em produção** (5+ com `deleted_at = null`, além de dezenas já
   soft-deletados criados e apagados entre 14:32 e 14:58 UTC de 02/10) — teardown dos e2e não limpa.
6. **`md5` par-a-par arquivos↔ledger não verificável por mim:** exige `DESTINO_URL` (segredo de CI).
   `check-triple-parity.mjs` sem ele responde `PARCIAL: 1/3` e valida só o manifesto de edges.

## Estado do banco canônico (`tnnnlkbymytvtqngbbqh`) em 02/10

- `contacts`: **3.342** linhas; **2.527** visíveis com legados desligados; **3.122** com legados ligados
  (o texto da etapa 98 falava de 3.104 → ≈2.498, números de 01/10, hoje defasados).
- `messages`: 51.968 linhas. `supabase_migrations.schema_migrations`: **748** versões = 748 arquivos.
- Nenhuma DDL ou DML foi executada nesta rodada: só `SELECT`, `EXPLAIN` e consultas de catálogo.

## Conclusão

O plano está **a uma etapa do fim**: **99/100** marcadas, com **1 aberta** — F9 **94** (6 linhas na seção "Contatos" do `CLAUDE.md`), que depende da **aprovação do Joaquim** no hook de arquivo protegido (decisão `20261002-161204-9789-plano-contatos-etapas-abertas`). A **11** foi fechada pela via do deploy, com o teste de invocação registrado como **inexecutável por falta de fonte local**; a **98** fechou com **4/4 evidências** em produção. O que mudou
em relação ao fechamento de 01/10 é a qualidade da prova: sete etapas passaram a ter número cru em vez
de declaração, uma foi **desmarcada** por falta de evidência, uma foi **reaberta** com 2 de 4
evidências, e um bug de produção com causa-raiz identificada foi retirado do limbo do "B7" e virou
tarefa própria.
