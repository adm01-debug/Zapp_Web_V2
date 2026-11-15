# claude/fix-paleta-filtros-celebracoes-261025-2110 (PR #2266)

- tip `c32f113a754e5754c2d041f28423f4bab6854750` · merge_base `2d97c44cfe7f2fa8a3ca572f8f5689118328e858` (2026-10-24)
- 103 commits, 171 arquivos, +3648/-2212. Branch "guarda-chuva": um lote de ~100 fixes de front/teste
  (inbox, Talk X, admin, a11y, paleta de comandos, filtros do inbox, celebrações) + 1 migration de KPI.
- Mecânica: 94 arquivos byte-idênticos à main, 37 `PRESENT_REVERSE_APPLIES` (já na main), 39 em conflito —
  dos quais 31 com lacuna de linha. **Veredito: PERDIDA_PARCIAL** (3 lacunas reais, 2 testes + 1 detalhe de a11y).

## Verificado como INCORPORADO (amostra com prova)

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261026210000_dashboard_kpi_periodo_aditivo.sql` | idêntico na main | `IDENTICAL_TO_MAIN` / `PRESENT_BYTE` |
| `src/lib/authenticatedUserId.ts` | na main e evoluído (só a chave do projeto configurado) | `git show origin/main:src/lib/authenticatedUserId.ts` → `configuredSessionKey()` |
| `src/services/outbound-message.service.ts` | `pertenceAoUsuarioAtual` na main; main endureceu (item sem dono **não** drena) + `surfaceDisconnected` | `git diff <ref> origin/main -- src/services/outbound-message.service.ts` |
| `src/hooks/gamification/useAgentCelebrations.ts` | fix de relógio na main (`TOLERANCIA_RELOGIO_MS = 2000` inline no efeito) | `origin/main:...:171-190` |
| `src/hooks/inbox/useInboxFilters.ts` | back/forward do `?type=` na main, via `useEffect`+`useRef` em vez do setState em render | `origin/main:src/hooks/inbox/useInboxFilters.ts:162-178` |
| `src/components/ui/phone-input.tsx` | fixo sem `9` inicial e passthrough `+${digits}` na main; main foi muito além (paste/drop, refs de intenção) | `origin/main:src/components/ui/phone-input.tsx:20-24, 30` |
| `src/components/admin/MediaMigrationTool.tsx` | contagem de pendentes + histórico de `audit_logs` extraídos para `src/services/mediaMigration.service.ts` (`CDN_TEMP_PREFIXES`, `MIGRATION_ACTION`, `HISTORY_LIMIT`, `countPendingMedia`, `fetchMigrationHistory`) | `origin/main:src/services/mediaMigration.service.ts:3-39`; import em `MediaMigrationTool.tsx:9` |
| `src/components/talkx/TalkXSegments.tsx` (161 linhas "faltando") | X111/X112/X116 todos na main, reimplementados: `viewMode` (l.57), `selectedSegment` com comparação de `updated_at` (l.86-94), `closePanel` devolvendo foco + Esc (l.95-108), abas da tela 03 (l.389-392), painel "Detalhes do segmento" (l.767) | `git show origin/main:src/components/talkx/TalkXSegments.tsx` |
| `src/components/talkx/TalkXView.tsx` | `'paused'` no `TalkXTopView` (l.66, main ainda soma `'report'`), `openPaused`, `pausedCampaignId` | `origin/main:src/components/talkx/TalkXView.tsx:66,112,310` |
| `src/hooks/integrations/useTalkXSegments.ts` | `assertNoBridgeFields` virou `ponteOnly`/`assertNoPonteOnlyFields` (mesma falha fechada); main ainda soma `status:'draft'` | `git diff <ref> origin/main -- src/hooks/integrations/useTalkXSegments.ts` |
| `src/components/security/AuditLogDashboard.tsx` | hook `useAuditLogDashboard` + `stat.hint` na main (classe `text-2xs` no lugar de `text-[11px]`) | `origin/main:...:11,70,124` |
| `src/components/dashboard/useSentimentData.ts` | `error`/`isError` na main, com `incomplete` como estado real | `origin/main:...:92,234` |
| `src/components/settings/SettingsView.tsx` | botão global "Salvar Alterações" removido também na main (hoje `saveAppearanceSettings`) | `origin/main:...:74`; nenhum match de "Salvar Alterações" |
| `src/components/inbox/InboxEmptyChat.tsx` | só renome de token (`text-[11px]`→`text-2xs`, `text-[10px]`→`text-3xs`) | `git diff <ref> origin/main -- src/components/inbox/InboxEmptyChat.tsx` |
| `src/components/inbox/MessageReactions.tsx`, `src/hooks/chat/useTeamChatNotifications.ts` | main é superconjunto (`isError`/`disabled`; `navigateToView('team-chat',{cid})`) | `git diff <ref> origin/main -- <arquivo>` |
| `ESTADO.md`, `docs/talkx/ARQUITETURA.md`, `supabase/schema-manifest.json` | artefatos gerados; main tem versão mais nova (inventário de edges com linha, `TalkXCampaignPaused` citado em `ARQUITETURA.md:7`, hashes de policy regerados) | `git grep -n TalkXCampaignPaused origin/main -- docs/talkx/ARQUITETURA.md` |
| 8 testes em conflito (`useAdminDataCreateUser`, `ContactDetails.quickActions`, `ChatMessagesArea.pagination`, `team-chat-notifications-mount`, `useInboxBulkActions`, `N8nIntegrationView.a11y`, `TalkXView.route`, `WhatsAppTemplatesManager.confirmacaoExclusao`) | main tem o mesmo teste, evoluído (ex.: RPC `set_conversations_status` plural com `p_contact_ids`, `clientHeight/offsetHeight` em `Element.prototype`, mock `{isAdmin:true,isSupervisor:true}`) | greps citados abaixo |

## OBSOLETA

**`src/components/catalog/WhatsAppTemplatesManager.tsx`** — a branch travava Novo/Editar/Duplicar/Excluir em
`isAdmin` ("A escrita em `whatsapp_templates` é admin-only na RLS"). A main faz o mesmo gate com
`const { isSupervisor: canWrite } = useUserRole();` (`origin/main:...:39,58-141`) e o texto é "Somente
administradores **e supervisores**".
Produção dá razão à main (consulta só leitura, MCP `SUPABASE - ZAPP WEB V2 - MCP`):

```
select policyname, cmd, qual, with_check from pg_policies where tablename='whatsapp_templates';
 ALL    | is_admin_or_supervisor(auth.uid())        | Admins can manage templates
 INSERT | with_check: is_admin_or_supervisor(...)   | Admins can insert templates
 SELECT | true                                      | Authenticated users can view templates
```

Portar a versão da branch esconderia os controles de quem a RLS autoriza. **Não recuperar.**
Mesma razão para o 1 linha de `WhatsAppTemplatesManager.confirmacaoExclusao.test.tsx` (mock só `isAdmin`).

## LACUNAS A RECUPERAR

### 1. Teste de regressão do relógio das celebrações (médio)
`src/hooks/gamification/__tests__/useAgentCelebrations.test.tsx` — `ABSENT_APPLIES_CLEAN` (aplica limpo na main).
O fix de produção está na main, mas sem este teste nada impede a tolerância de 2 s de voltar a zero.
Inserir após o caso `'...a-nova'` (main l.~257):

```tsx
  it('relógio do cliente levemente atrasado não transforma conquista antiga em festa', async () => {
    // earned_at é do servidor; com o cliente ~1 s atrás, uma conquista de instantes
    // antes do mount parece "posterior" ao marco. A tolerância de 2 s a suprime.
    const quaseAgora = new Date(Date.now() + 1_000).toISOString();
    janelaDeConquistas(conquista({ id: 'a-antiga-skew', earned_at: quaseAgora }));
    const { result } = await montar();

    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));
    expect(result.current.celebrations).toHaveLength(0);
  });
```

### 2. Teste de back/forward do filtro `?type=` do inbox (médio)
`src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` — o comportamento está na main
(`useInboxFilters.ts:162-178`), o teste não. Precisa reinstalar o `useNavigate` no `Probe` (a main o removeu):

```tsx
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

// Navegação externa ao hook (simula back/forward do histórico).
let externalNavigate: (to: string) => void = () => {};
function Probe() {
  const { search } = useLocation();
  const navigate = useNavigate();
  useEffect(() => { externalNavigate = (to) => navigate(to); }, [navigate]);
  useEffect(() => { routerSearchRef.current = search; }, [search]);
  return null;
}

describe('useInboxFilters — back/forward do histórico (?type=)', () => {
  it('depois de troca manual, a URL mudando por fora atualiza o filtro', () => {
    const { result } = montar('/inbox?type=cliente');
    act(() => result.current.handleContactTypeChange('grupo'));
    expect(result.current.selectedContactType).toBe('grupo');

    act(() => externalNavigate('/inbox?type=cliente'));
    expect(result.current.selectedContactType).toBe('cliente');

    act(() => externalNavigate('/inbox'));
    expect(result.current.selectedContactType).toBeNull();

    act(() => externalNavigate('/inbox?type=grupo'));
    expect(result.current.selectedContactType).toBe('grupo');
  });
});
```

Atenção: a main mudou o contrato de `setFilters` (sem `tags`) — usar a forma que os outros casos do arquivo já usam.

### 3. "Buscas recentes" dentro do `role="listbox"` da paleta ⌘K (baixo)
`src/components/ui/command-palette.tsx:269-287` (main). Os botões de "Buscas recentes" e o "Limpar" ficam
**dentro** de `<div id={listboxId} role="listbox">` sem `role="option"` — filhos inválidos de listbox. A branch
movia esse bloco para fora do listbox e marcava as seções com `role="group" aria-label="Recentes"/"Acesso rápido"`.

Parte já resolvida de outro jeito na main (não recuperar): ids duplicados quando o mesmo comando está em
"Recentes" e em "Acesso rápido" — a main deduplica a fonte
(`quickAccessItems` filtra `recentIds`, `origin/main:src/components/ui/command-palette.tsx:125-133`) e já tem o
teste equivalente (`...a11y.test.tsx:25` "não duplica option/id quando um acesso rápido também está nos recentes").
Perdido junto: o teste `'buscas recentes ficam fora do listbox'`:

```tsx
  it('buscas recentes ficam fora do listbox', () => {
    renderPalette({ recentSearches: ['caneca'] });
    const listbox = screen.getByRole('listbox', { name: 'Acesso rápido' });
    expect(listbox).not.toContainElement(screen.getByText('caneca'));
  });
```

## Branch
`apagar_branch_seguro: false` — recuperar os 3 itens acima (nada fora de `src/`, sem banco, sem workflow) e
só então apagar. Nada aqui é DECISAO_DONO.

## Verificação adversarial

Tentei refutar o PERDIDA_PARCIAL por dois lados (lacunas inexistentes / lacunas extras não vistas). **A triagem se sustenta: concordo, PERDIDA_PARCIAL, `apagar_branch_seguro: false`.** Nenhuma lacuna adicional de valor ≥ médio.

### As 3 lacunas são reais e ainda encaixam na main

1. **Teste do relógio das celebrações** — a lista de casos de `origin/main:src/hooks/gamification/__tests__/useAgentCelebrations.test.tsx` (10 `it(`, l.167-316) não tem nada de skew/`a-antiga-skew`; o fix que o teste guardaria está lá (`origin/main:src/hooks/gamification/useAgentCelebrations.ts:173` `const TOLERANCIA_RELOGIO_MS = 2000`, l.190 `Date.parse(...) > marcoMontagem + TOLERANCIA_RELOGIO_MS`). Não foi removido de propósito: `git log -S'a-antiga-skew' origin/main -- <arquivo>` → **0 commits** (nunca existiu na main).
2. **Teste de back/forward do `?type=`** — `origin/main:src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` só tem os `describe` "type pela URL (PK-14)" e "busca em memória (PK-14)"; nenhum `useNavigate`. Comportamento confirmado na main em `src/hooks/inbox/useInboxFilters.ts:162-179` (`lastUrlType = useRef`, `useEffect` sincronizando o rascunho). `git log -S'back/forward do histórico' origin/main -- <arquivo>` → 0 commits. Como o sync é `useEffect`, o caso da branch (`act(() => externalNavigate(...))`) continua válido.
3. **Paleta ⌘K** — li a main: `<div id={listboxId} role="listbox" aria-label="Acesso rápido">` abre antes do bloco de "Buscas recentes", cujos botões e o "Limpar" **não** têm `role="option"` (trecho em `origin/main:src/components/ui/command-palette.tsx`, ~l.271-289; os `role="option"` só começam nos `recentCommands`, ~l.296). Os 21 casos de `command-palette.a11y.test.tsx` na main não cobrem isso, e os casos de axe renderizam sem `recentSearches`, então nada pega. `git log -S'aria-label="Recentes"' origin/main -- command-palette.tsx` → 0 commits. Lacuna real, valor baixo (anúncio de contagem de opções pelo leitor de tela).

### Tentativas de refutação que FALHARAM (a main realmente cobre)

| Alegação da triagem | Checagem independente | Resultado |
|---|---|---|
| `TalkXSegments.tsx` (161 linhas "faltando") incorporado | `origin/main:...:57` `viewMode`, `:95-107` `closePanel`+Esc, `:389` aba "Regras Avançadas", `:467-468` toggle lista/grade, `:588` painel de detalhes | cobre |
| `useTalkXSegments.ts` `assertNoBridgeFields` → `ponteOnly` | `origin/main:...:80-81` `real_sector/real_uf` com `ponteOnly:true`, `:280-285` `assertNoPonteOnlyFields`, `:311,333` chamadas (mesma falha fechada) | cobre |
| `MediaMigrationTool.tsx` extraído para serviço | `origin/main:src/services/mediaMigration.service.ts:3,4,5,20,33` (`CDN_TEMP_PREFIXES`, `MIGRATION_ACTION`, `HISTORY_LIMIT`, `countPendingMedia`, `fetchMigrationHistory`) | cobre |
| `outbound-message.service.ts` | `origin/main:...:378-380` `pertenceAoUsuarioAtual` com `if (!message.userId) return false` — main é **mais** restritiva que a branch (`return true`) | cobre, de propósito |
| `authenticatedUserId.ts` | `origin/main:...:25-31` `configuredSessionKey()` + varredura só como fallback (l.39-40) | cobre |
| `phone-input.tsx` | `origin/main:...:19-21` fixo de 8 dígitos sem `9` → `XXXX-XXXX`; l.25,27 passthrough `+${digits}`; l.34-41 refs de intenção/paste | cobre |
| `useTeamChatNotifications.ts` | `origin/main:...:243` `{ tag: \`team-msg-${msg.conversation_id}\`, onClick: () => navigateToView('team-chat', { cid: ... }) }` | cobre |
| `ChatMessagesArea.pagination.test.tsx` | `origin/main:...:60,68` `clientHeight`/`offsetHeight` no prototype | cobre |
| `useInboxBulkActions.test.ts` | `origin/main:...:183` RPC plural `set_conversations_status`, l.609 nota de `'pending'` legado | cobre |
| OBSOLETA: `WhatsAppTemplatesManager.tsx` | `origin/main:...:39` `const { isSupervisor: canWrite } = useUserRole()`, l.58-141 gates por `canWrite`; RLS de produção `is_admin_or_supervisor(auth.uid())` | **confirmo: não recuperar** |

### Candidata a lacuna extra que investiguei e descartei

`src/components/admin/useAdminData.ts` — a branch acrescenta `special_agent: { label: 'Agente Especial' ... }` ao `roleConfig` e o teste da branch espera o enum com `'special_agent'`; a main não tem nenhuma ocorrência de `special_agent` em `src/` (`git grep -c special_agent origin/main -- src` → vazio; `AppRole = 'admin' | 'supervisor' | 'agent'` em `origin/main:src/services/role.service.ts:3`). Produção dá razão à main (MCP `SUPABASE - ZAPP WEB V2 - MCP`, só leitura):

```
select e.enumlabel, (… count user_roles …) from pg_enum e join pg_type t … where t.typname='app_role';
 admin | 2 · supervisor | 3 · agent | 6     → não existe 'special_agent'
```

Papel inexistente no enum do banco: recuperar isso só criaria rótulo para um role impossível. **Obsoleto, não recuperar.** No mesmo arquivo a main é superior: tem o piso de "pelo menos um administrador ativo" (guard que a branch removia) — mais uma razão para não portar nada daí.

### Veredito

`concorda = true` · `veredito_final = PERDIDA_PARCIAL` · `apagar_branch_seguro = false` (apagar só depois de portar os 3 itens: 2 testes + 1 ajuste de a11y, todos em `src/`, sem banco/edge/workflow — nada de DECISAO_DONO).
