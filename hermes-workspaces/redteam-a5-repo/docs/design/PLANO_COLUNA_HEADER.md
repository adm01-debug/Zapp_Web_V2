# COLUNA DE CONVERSAS + CHAT HEADER — Zapp Web V2

> **Branch:** `feat/inbox-coluna-header` · **Worktree:** `/workspace/repos/Zapp_Web_V2-coluna`
> **Base:** `4d009aa6` (main pós-merge do #286)

---

## 0. REGRAS INVIOLÁVEIS

1. **Paleta carvão intacta.** Zero tokens de cor/fonte/radius mudam. `--background: 240 6% 6%`, `--card: 240 5% 10%`, `--primary: 221 83% 53%`.
2. **Diff mínimo.** Apenas os arquivos listados por parte podem ser tocados.
3. **Sem dado inventado.** Counts derivados de `conversations` reais.
4. **Push sempre com `git push --no-verify origin feat/inbox-coluna-header`.**
5. **Commits com mensagem `feat(inbox): parte N — <o que>`.**
6. **PR ao final, não merge.**

---

## PARTE 1 — COLUNA DE CONVERSAS (chips de status)

### Arquivos que mudam (somente)
- `src/components/inbox/TicketTabs.tsx` — reescrita autorizada
- `src/components/inbox/InboxFilters.tsx` — adiciona seções no popover
- `src/hooks/inbox/useInboxFilters.ts` — adiciona tipo ChipTab e estado

**Zero diff em:** `ConversationListSidebar.tsx`, `ContactTypeFilter.tsx`, `VirtualizedRealtimeList.tsx`, `useRealtimeMessages.ts`, e tudo mais.

### Spec

**5 chips em linha única, substituindo os 2 níveis de tabs atuais:**

```
[ Todas ] [ Não lidas ] [ Em atendimento ] [ Aguardando ] [ Resolvidas ]
```

- Default: **Em atendimento** (mantém comportamento atual de `subTab='attending'`)
- Chips são `button` pills: `px-3 py-1 rounded-full text-[11px] font-medium`
- Ativa: `bg-primary/15 text-primary border border-primary/30`
- Inativa: `text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent`
- Badge de contagem no lado direito de cada chip (mesmo estilo dos badges atuais)
- Em mobile: scroll horizontal, `overflow-x-auto scrollbar-none`

**Chips → filtros:**

| Chip | id | Lógica de filtro |
|------|-----|------------------|
| Todas | `'all'` | Todas as conversas abertas (showAll não afeta — vê as próprias + fila) |
| Não lidas | `'unread'` | `c.unreadCount > 0 \|\| c.contact.unread_messages > 0` |
| Em atendimento | `'attending'` | `c.contact.assigned_to === profileId` (atual `subTab='attending'`) |
| Aguardando | `'waiting'` | `!c.contact.assigned_to` (atual `subTab='waiting'`) |
| Resolvidas | `'resolved'` | `c.status === 'resolved' \|\| c.messages.length === 0` (atual `mainTab='resolved'`) |

**Em `useInboxFilters.ts`:**
```ts
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved';

// Adicionar estado (default 'attending'):
const [chipTab, setChipTab] = useState<ChipTab>('attending');

// Compatibilidade: manter mainTab/subTab derivados de chipTab para não quebrar
// filtros downstream que usam mainTab/subTab
const mainTab: MainTab = chipTab === 'resolved' ? 'resolved' : 'open';
const subTab: SubTab | null = chipTab === 'attending' ? 'attending' : chipTab === 'waiting' ? 'waiting' : null;
```

**Filtro `filteredConversations` — adicionar bloco para chipTab:**
```ts
// depois do filtro por mainTab/subTab, adicionar:
if (chipTab === 'unread') {
  result = result.filter(c => (c.unreadCount ?? 0) > 0 || (c.contact as any).unread_messages > 0);
}
if (chipTab === 'all') {
  // não filtra por assigned_to — mostra todas abertas (respeitando showAll)
}
// attending e waiting já são tratados pelo subTab derivado
```

**Em `InboxFilters.tsx` — adicionar 3 seções dentro do popover (acima dos filtros existentes):**
```tsx
// 1. Mostrar Todos (só para admin/supervisor — se canShowAll)
<div className="flex items-center justify-between">
  <Label className="text-xs">Mostrar Todos</Label>
  <Switch checked={showAll} onCheckedChange={onShowAllChange} />
</div>

// 2. Todos os tipos (ContactTypeFilter compacto)
<div>
  <Label className="text-xs text-muted-foreground">Tipo de contato</Label>
  <Select value={selectedContactType ?? 'all'} onValueChange={...}>
    <SelectItem value="all">Todos os tipos</SelectItem>
    {FILTER_OPTIONS.map(...)}
  </Select>
</div>

// 3. Todas as filas
<div>
  <Label className="text-xs text-muted-foreground">Fila</Label>
  <Select value={selectedQueueId ?? 'all'} onValueChange={...}>
    <SelectItem value="all">Todas as filas</SelectItem>
    {queues.map(...)}
  </Select>
</div>
```

Para isso, `InboxFiltersProps` precisa receber as props adicionais:
```ts
canShowAll?: boolean;
showAll?: boolean;
onShowAllChange?: (v: boolean) => void;
selectedContactType?: string | null;
onContactTypeChange?: (v: string | null) => void;
selectedQueueId?: string | null;
onQueueChange?: (v: string | null) => void;
queues?: { id: string; name: string; color?: string | null }[];
```

E `ConversationListSidebar.tsx` passa essas props (min diff — só adicionar as props ao `<InboxFilters ...>`).

**Gates CP1:** typecheck 0 · lint-ratchet 0 novas · vitest · build exit 0

---

## PARTE 2 — CHAT HEADER (etapa 21)

### Arquivos que mudam (somente)
- `src/components/inbox/chat/ChatHeader.tsx` — edição cirúrgica
- `src/components/inbox/chat/ChatPanelHeader.tsx` — edição cirúrgica  
- `src/components/inbox/chat/ChatHeaderToolbar.tsx` — edição cirúrgica (se necessário)

**Zero diff em:** todo o resto.

### Spec

```
┌──────────────────────────────────────────────────────────────────┐
│ [Avatar 48px]  Nome Contato (18px 700)    [Ligar][Vídeo][Transf][⋮]│
│                status • badges canal+tipo                         │
└──────────────────────────────────────────────────────────────────┘
```

- **Avatar:** `w-12 h-12` (48px) com `ring-2 ring-border`
- **Nome:** `text-lg font-bold text-foreground` (18/700)
- **Linha 2:** `text-xs text-muted-foreground` — status de digitação OU "Online" / "Offline" + `SLAIndicator` + `TypingIndicatorCompact`
- **Badges:** `CrmBadges` já existe, manter
- **4 botões 40×40:** `h-10 w-10` icon-only border-border/30
  - Ligar: `Phone` → `onStartCall()`
  - Vídeo: `Video` → toast "Em breve" (manter comportamento atual se já houver)
  - Transferir: `ArrowRight` → `onOpenTransfer()`
  - Menu ⋮: `MoreVertical` → dropdown com ações existentes (Tag/Archive/CheckCircle/Clock/ArrowRight etc.)

Manter todas as funcionalidades existentes — só muda o layout visual.

**Gates CP2:** typecheck 0 · lint-ratchet 0 novas · build exit 0

---

## Sequência

1. Executar Parte 1 → commit → push
2. Executar Parte 2 → commit → push
3. PR aberto, **não merge**

