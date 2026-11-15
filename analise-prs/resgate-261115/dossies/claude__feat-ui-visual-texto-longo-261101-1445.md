# Dossiê — claude/feat-ui-visual-texto-longo-261101-1445 (PR #2480, C297)

**Ref:** `origin/claude/feat-ui-visual-texto-longo-261101-1445` · tip `c5178c37d` · merge-base `1252bb5a4` (2026-11-01)
**PR #2480:** "feat: C297 — visual de texto longo em Badge, Card, Label, Tabs". Fechada em 01/11 pelo congelamento de features (#2545); CI falhou só por `build: cancelled` (saturação de runner), não por defeito.
**Triagem 2804:** DUPLICATA_PROVAVEL → só o Badge foi recuperado em `main` (#2805, commit `25e13ff60`, "achado C297 da auditoria Lote 5"). Card, Label, Tabs e o teste novo NÃO foram.

## Propósito
Texto longo (120 chars) nos primitivos de UI: Badge trunca com ellipsis; Card (Header/Title/Description/Content/Footer) cede largura (`min-w-0`) e quebra palavra; CardTitle `leading-none → leading-tight`; Label `leading-none → leading-snug`; TabsTrigger `min-w-0` + inner `<span className="truncate min-w-0">`. Teste novo cobrindo tudo.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/ui/badge.tsx` | **INCORPORADA** — classe base idêntica (`max-w-full min-w-0 truncate`) | `git show origin/main:src/components/ui/badge.tsx` linha 7 == branch; commit `25e13ff60` (#2805). Diferença restante é só comentário + `{children}` explícito (equivalente ao spread) → ruído |
| `src/components/ui/card.tsx` | **PERDIDA** — `min-w-0` em Header/Content/Footer, `min-w-0 break-words` em Title/Description, `leading-tight` no Title | main linhas 86, 98, 104, 109, 115 ainda `leading-none` / sem `min-w-0`; `git grep break-words origin/main -- src/components/ui/` só acha `breadcrumb.tsx:20` |
| `src/components/ui/__tests__/card.test.tsx` | **PERDIDA (acoplada ao card.tsx)** — asserts `leading-none → leading-tight` | main `card.test.tsx:103,113,125` ainda esperam `leading-none`; precisa mudar junto com card.tsx |
| `src/components/ui/label.tsx` | **PERDIDA** — `leading-none → leading-snug` | main linha 7 `cva("text-sm font-medium leading-none ...")`; `git grep leading-snug origin/main -- src/components/ui/` vazio |
| `src/components/ui/tabs.tsx` | **PERDIDA (portar com cuidado)** — `min-w-0` no trigger + inner span `truncate min-w-0` | main linhas 23-36 sem `min-w-0` nem span. **Risco:** `DiagnosticsView.tsx:152-156` põe `<span className="absolute ...">` como filho do TabsTrigger — com o inner span `truncate` (overflow-hidden) esse badge seria clipado; triggers com `gap-2` + ícone (`PasswordResetRequestsPanel.tsx:135`, `DiagnosticsView.tsx:152`) perdem o gap. O comentário da branch ("irmãos do span, fora dele") não vale para os consumidores atuais, que não separam filhos. Recomendação: portar só `min-w-0` no trigger (sem inner span) ou fazer o truncate opt-in. |
| `src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx` | **PERDIDA** — arquivo novo, 8 testes | `git grep TEXTO_120 origin/main` vazio; `same_basename_in_main: []`. Casos de Badge já passariam na main; Card/Label/Tabs dependem dos hunks acima; o caso "TabsTrigger inner span" deve ser reescrito se o span não for portado |
| `ChurnPredictionDashboard.test.tsx`, `tipografiaPisoEscalaContatos.test.tsx`, `DataExplorerTable.a11y.test.tsx`, `corCruaTokens.test.tsx`, `TalkXContactSelector.a11y.test.tsx` | **NENHUM** — só casts `as HTMLElement` sobre `getByText`/`findByText` (já retornam HTMLElement) e troca de comentário; resíduo da ida-e-volta do inner span do Badge (commit `ed418da45`) | diff tocando 1-5 linhas cada, sem mudança de asserção |
| `e2e/__screenshots__/contacts-*-{light,dark}-linux.png` (6) | **OBSOLETA / não portar** — branch apagou as baselines porque suas próprias mudanças de layout + Chromium local ≠ CI quebravam o `toHaveScreenshot`; main mantém os PNGs (blobs iguais ao merge-base) e roda `chromium-contacts-visual` no CI (`ci.yml:502`) | `git ls-tree origin/main e2e/__screenshots__/`; apagar = desligar a regressão visual de Contatos (etapa 90). **Se Card/Label/Tabs forem portados, as baselines precisarão ser regeradas no runner Linux do CI** (`bun run test:e2e -- --project=chromium-contacts-visual --update-snapshots`) |
| `e2e/contacts-snapshots.spec.ts` | **OBSOLETA** — só comentário "BASELINES AUSENTES" justificando a deleção acima; `test.skip(!existsSync(baseline)...)` já existe na main (`:157-158`) | — |

## Veredito: **PERDIDA_PARCIAL** (confiança alta)
Badge entrou via #2805. Card, Label, Tabs e o teste de 120 chars não entraram e continuam fazendo sentido no código atual (arquivos idênticos ao merge-base nesses trechos). Valor: médio (UX de texto longo em cartões/abas/rótulos; teste que protege). Não é DECISAO_DONO: não contradiz regra vigente nem gera custo. `apagar_branch_seguro = false`.

## Lacunas a recuperar (hunks essenciais)

### 1. `src/components/ui/card.tsx` (main linhas 86, 98, 104, 109, 115)
```diff
-    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
+    <div ref={ref} className={cn("flex flex-col min-w-0 space-y-1.5 p-6", className)} {...props} />
-  <Tag ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
+  <Tag ref={ref} className={cn("text-2xl font-semibold leading-tight tracking-tight min-w-0 break-words", className)} {...props} />
-    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
+    <p ref={ref} className={cn("text-sm text-muted-foreground min-w-0 break-words", className)} {...props} />
-  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
+  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0 min-w-0", className)} {...props} />
-    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
+    <div ref={ref} className={cn("flex items-center min-w-0 p-6 pt-0", className)} {...props} />
```
+ `src/components/ui/__tests__/card.test.tsx:103,113,125`: `'leading-none'` → `'leading-tight'`.

### 2. `src/components/ui/label.tsx` (main linha 7)
```diff
-const labelVariants = cva("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70");
+// `leading-snug` (e não `leading-none`): o rótulo de duas linhas não cola uma na outra.
+const labelVariants = cva("text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70");
```

### 3. `src/components/ui/tabs.tsx` (main linhas 23-36) — versão da branch; ver risco acima
```diff
->(({ className, ...props }, ref) => (
+>(({ className, children, ...props }, ref) => (
   <TabsPrimitive.Trigger
     ref={ref}
     className={cn(
-      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 ...",
+      "inline-flex items-center justify-center min-w-0 whitespace-nowrap rounded-sm px-3 py-1.5 ...",
       className,
     )}
     {...props}
-  />
+  >
+    <span className="truncate min-w-0">{children}</span>
+  </TabsPrimitive.Trigger>
```
Sugestão segura: só adicionar `min-w-0` à classe base e NÃO envolver `children` (evita clipar `DiagnosticsView.tsx:155` e quebrar `gap-2` com ícones).

### 4. `src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx` (novo, 116 linhas)
Conteúdo integral: `git show origin/claude/feat-ui-visual-texto-longo-261101-1445:src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx`. Se o inner span das Tabs não for portado, reescrever o caso "TabsTrigger: ... inner span trunca o texto" (asserções `aba.className` contém `min-w-0`/`whitespace-nowrap`; remover as de `innerSpan`).

### Dependência
Após portar 1-3, rodar `chromium-contacts-visual` no CI e, se os pixels mudarem acima de 0,2%, regenerar as 6 baselines `e2e/__screenshots__/contacts-*-linux.png` no runner Linux (nunca apagá-las).

## Verificação adversarial

Tentei refutar o PERDIDA_PARCIAL; **não consegui**. Confirmo o veredito e `apagar_branch_seguro = false`.

**Branch não está na main:** `git merge-base --is-ancestor c5178c37d origin/main` → NÃO. 9 commits (`df21e2836` … `c5178c37d`), diffstat `1252bb5a4..ref` = 18 arquivos, +162/-25.

**Lacunas conferidas uma a uma em `origin/main` (leitura direta do arquivo, não só o JSON):**

| Lacuna | Estado real na main | Evidência |
|---|---|---|
| `card.tsx` `min-w-0` em Header/Content/Footer; `min-w-0 break-words` em Title/Description; `leading-tight` no Title | **ausente** | `git show origin/main:src/components/ui/card.tsx` → CardHeader `"flex flex-col space-y-1.5 p-6"` (l. 84-86), CardTitle `"text-2xl font-semibold leading-none tracking-tight"` (l. 98), CardDescription `"text-sm text-muted-foreground"` (l. 104), CardContent `"p-6 pt-0"` (l. 109), CardFooter `"flex items-center p-6 pt-0"` (l. 115). `git grep -n break-words origin/main -- src/components/ui/` → só `breadcrumb.tsx:20` |
| `label.tsx` `leading-snug` | **ausente** | `origin/main:src/components/ui/label.tsx:7` = `cva("text-sm font-medium leading-none peer-disabled:…")`; `git grep -n leading-snug origin/main -- src/components/ui/` → vazio |
| `tabs.tsx` `min-w-0` no trigger (+ inner span) | **ausente** | `origin/main:src/components/ui/tabs.tsx:26-34`: `>(({ className, ...props }, ref) => (` e classe base sem `min-w-0`, sem `children`/span |
| `primitivos-texto-longo-a11y.test.tsx` (115 linhas, 8 casos) | **ausente** | `git grep -n TEXTO_120 origin/main` → vazio |
| `card.test.tsx` acoplado | main ainda espera `leading-none` | `origin/main:src/components/ui/__tests__/card.test.tsx:103,113,125` |

**Não foi remoção deliberada:** `git log -S'leading-snug' origin/main -- src/components/ui/label.tsx`, `git log -S'min-w-0' origin/main -- src/components/ui/card.tsx` e idem `tabs.tsx` → **nenhum commit**; essas classes nunca existiram na main, logo não houve revert/desativação. Histórico desses arquivos na main: `label.tsx` só `bebc3a202` (template), `tabs.tsx` último `8cd1a4b5e`, `card.tsx` último `025d0258d` — nenhum com "remove/revert/desativa" do tema.

**Ainda encaixa no código atual:** o teste novo importa só `@/components/ui/{badge,label,card,tabs}` e `Card/CardHeader/CardTitle/CardDescription/CardContent/CardFooter`, `Tabs/TabsList/TabsTrigger/TabsContent` — todos exportados na main (`card.tsx:120`, `tabs.tsx:53`). Nenhum guard de CI impede o port: `git grep -n "leading-" origin/main -- scripts/ci` só acha a fixture de 120px do NotFound em `tipografia-excecoes-doc.unit.mjs:140` e `.leading-relaxed` em `e2e-email-axe-ready.unit.mjs:176`; nada exige `leading-none` em `CardTitle`.

**Badge realmente incorporado (não é lacuna):** `origin/main:src/components/ui/badge.tsx:7` já tem `max-w-full min-w-0 truncate`, via `25e13ff60` ("fix(ui): Badge não trunca texto longo… achado C297 da auditoria Lote 5", #2805). `git diff origin/main ref -- src/components/ui/badge.tsx` deixa só o comentário e a troca de `{...props}` por `{...props}>{children}</div>` — **neutro** (o spread já renderizava `children`). Logo o arquivo marcado `CONFLICT` no JSON **não deve ser tocado** no port, o que elimina o único conflito do pacote.

**Risco do inner span das Tabs confirmado na fonte:** `origin/main:src/components/diagnostics/DiagnosticsView.tsx` usa `<TabsTrigger value="logs" className="gap-2 relative">` com ícone + `<span className="absolute -top-1 -right-1 …">` como irmão do texto; envolver `children` num `<span className="truncate">` (overflow-hidden) clipa esse selo e mata o `gap-2` (mesmo padrão em `src/components/security/PasswordResetRequestsPanel.tsx`). A recomendação da triagem (portar só `min-w-0`) está certa. Com o port seguro, do teste novo só falham as duas asserções de `innerSpan` (linhas 59-63); `expect(aba.className).not.toContain('truncate')` continua válido.

**Deleção das 6 baselines:** confirmada como não-portar — `git ls-tree origin/main e2e/__screenshots__/` lista os 6 PNGs e o CI roda `--project=chromium-contacts-visual`.

**Veredito final: PERDIDA_PARCIAL** (concordo, confiança alta). Nenhuma lacuna adicional além das já listadas.
