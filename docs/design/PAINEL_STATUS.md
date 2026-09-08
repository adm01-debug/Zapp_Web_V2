# PAINEL DIREITO COM 5 ABAS — Ledger de execução

> Branch: `feat/inbox-painel-direito` · Worktree: `/workspace/repos/Zapp_Web_V2-painel`
> Plano: `docs/design/PLANO_PAINEL_DIREITO_TABBED.md`

---

## CP1 — Fase 1 (tiles de ação + avatar 72px)

- [x] **1.** `ContactActionButtons.tsx` reescrito: 5 tiles 56×56 (`w-14 h-14`) — Ligar (dropdown WhatsApp/Telefone), WhatsApp (`wa.me`), E-mail (`mailto`/navigate, disabled sem email), Transferir (dispara `CustomEvent('open-transfer-dialog')`, ouvido em `ChatPanel.tsx` — abre o `TransferDialog` já existente), Mais (dropdown: Editar/VIP/Arquivar/Bloquear/Sincronizar CRM/Recolher seções). Handlers originais todos preservados (nenhum removido; CRM-sync extraído para `CrmSyncMenuItem` interno, só monta `useSyncToCRM` quando `isExternalConfigured && conversation`, preservando o comportamento condicional anterior do `CRMSyncButton`).
  - Edição cirúrgica em `ChatPanel.tsx`: `useEffect` novo (12 linhas) ouvindo `open-transfer-dialog` → `openDialog('transferDialog')`, filtrado por `contactId`.
- [x] **2.** `ContactHeaderSection.tsx`: avatar `w-24 h-24` (96px) → `w-[72px] h-[72px]` (72px, único ponto de mudança — SVG do anel de engajamento usa `calc(100%+12px)` relativo ao próprio container, escala automaticamente, não precisou de outro ajuste). `data-testid="contact-avatar"` adicionado. Nada mais no arquivo foi tocado (badge de canal, logo CRM, nome, telefone, chips — inalterados).
- [x] **3.** Commit `feat(painel): fase 1 — tiles de ação e avatar 72px`. Push `--no-verify`.

**Gates CP1:**
- `npm run typecheck` (`tsc -b --force`) → **exit 0**, 0 erros novos.
- `node scripts/ci/lint-ratchet.mjs` → `baseline=1189, atual=1189, novas=0` → **OK**.
- `npx vitest run src/components/inbox/contact-details src/components/inbox/ChatPanel` → **63/63 passed** (suite existente `ContactHeaderSection.test.tsx` continuou verde após extrair `CrmSyncMenuItem` para não quebrar o QueryClient nos testes sem provider).
- Screenshot: `docs/design/painel-01-tiles.png` — QA real (`qa.visual@promobrindes.com.br`) logado via Playwright headless, inbox aberto, conversa selecionada, painel direito visível.
- Medição programática via Playwright (`boundingBox()`), confirmando os pixels reais renderizados no browser:
  - `[data-testid="contact-avatar"]` → `{"width":72,"height":72}`
  - 5× `[data-testid="contact-action-tile"]` → todos `{"width":56,"height":56}`
- Paleta carvão: **zero token novo** — só classes utilitárias já existentes no design system (`bg-muted/40`, `border-border`, `text-muted-foreground`, `text-primary`, `hover:bg-muted/70`).

**Regra 4 (seções não somem):** não aplicável nesta fase — `ContactAccordionSections.tsx`/`contactDetailSections.ts` não foram tocados na Fase 1.

---

## CP2 — Fase 2 (Tabs + aba Contato)

_pendente_

## CP3 — Fase 3 (abas Histórico/Tarefas/Notas/Arquivos)

_pendente_
