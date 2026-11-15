# claude/fix-talkx-segmentos-estimativa-261025-2110 (PR #2269)

- `merge_base` 2d97c44cfe7f2fa8a3ca572f8f5689118328e858 · `tip` ccd09bebc410b7b9bad363add64f10fd74c3b477 (2026-10-25) · 101 commits, 173 arquivos.
- NÃO é ancestral de `origin/main` (`git merge-base --is-ancestor` → NOT-ANCESTOR).
- **Veredito: PERDIDA_PARCIAL.** 141 dos 173 arquivos já estão byte a byte ou em substância na main
  (93 `IDENTICAL_TO_MAIN` + 48 `PRESENT_REVERSE_APPLIES`/sem linha faltante). Sobram **3 lacunas reais**,
  todas no Talk X → Segmentos, mais os 2 testes novos que as provam.

## Propósito
Branch "guarda-chuva": 100 commits de correções de teste/UI já incorporadas + 1 commit-cabeça
(`ccd09be`, "fix: talkx segmentos - real_* em breve, estimativa nula e seleção fantasma") que é o que
sobrou de fora. A migration `supabase/migrations/20261026210000_dashboard_kpi_periodo_aditivo.sql`
está `IDENTICAL_TO_MAIN` (já na main) — nada de banco a recuperar.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/integrations/useTalkXSegments.ts` | **LACUNA 1 e 2** (estimativa nula + `allSettled`). O resto (`assertNoBridgeFields`/`isBridgeField`) virou `assertNoPonteOnlyFields`/`ponteOnly` na main | main `useTalkXSegments.ts:275-289` (assert), `:360-371` (`useAudienceEstimate` sem guarda de nulo), `:789-796` (`refreshEstimates` com `Promise.all`, sem toast, sem `onError`) |
| `src/components/talkx/TalkXSegments.tsx` | 170 linhas "faltantes" são o X111/X112/X116 **reimplementado na main** (abas, lista/grade, rail, ↻, cópia mais nova por `updated_at`). Falta só a **LACUNA 3** (seleção fantasma do rail) | main tem abas `:386`, toggle `:467-468`, grade `:506`, rail `:757-798`, "Recontar público" `:794`, ↻ `:379-383`, cópia fresca `:88-94`. O efeito de fantasma da main (`:196-205`) limpa **só `selectedIds`** (checkbox), não `selected` (rail); único clear de `selected` é na exclusão unitária `:347` |
| `src/components/talkx/TalkXCampaignWizard.tsx` · `segments/TalkXSegmentBuilder.tsx` | Exibição `'—'` para contagem nula — só faz sentido junto da LACUNA 1 | main wizard mostra `fmtInt(count)` e builder `fmtInt(est?.count ?? 0)`; main rail cai em `s.estimated_count` (`TalkXSegments.tsx:787`) |
| `src/hooks/integrations/__tests__/useTalkXSegments.estimativa.test.tsx` | **NOVO, ausente na main**; cobre LACUNA 1 e 2 | `git ls-tree origin/main -- src/hooks/integrations/__tests__` não lista; `git grep -l "allSettled\|comingSoon" origin/main -- '**/__tests__/**'` não cobre estimativa de segmento |
| `src/components/talkx/__tests__/TalkXSegments.selecaoFantasma.test.tsx` | **NOVO, ausente na main**; cobre LACUNA 3 | main tem `TalkXSegments.detailFresh/detailPanel/feedbackMassa...`, nenhum de fantasma (`git grep -l fantasma origin/main -- src/components/talkx` → só o código) |
| `real_sector`/`real_uf` como `comingSoon` (hook + `useTalkXSegments.test.ts`) | **OBSOLETA**: a main escolheu caminho mais rígido (`ponteOnly`, falha fechada que **lança**), em vez de silenciosamente tirar a regra da conta | main `useTalkXSegments.ts:80-81, 206-208, 275-289`; teste da main `__tests__/useTalkXSegments.test.ts:130` fixa `comingSoon = ['lead_origin','lead_score','risk_score']` |
| `src/components/catalog/WhatsAppTemplatesManager.tsx` (+ teste de exclusão) | **OBSOLETA e errada**: a branch restringia escrita a `isAdmin`; a RLS de produção é `is_admin_or_supervisor` | `pg_policies` em `tnnnlkbymytvtqngbbqh`: `"Admins can manage templates" ALL qual=is_admin_or_supervisor(auth.uid())`, `"Admins can insert templates" INSERT with_check=is_admin_or_supervisor(...)`. Main já usa `isSupervisor: canWrite` (`:39`, gates em `:58,60,66,101,138-141`) |
| `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` | **OBSOLETA**: esperava enum com `special_agent` | enum `app_role` em produção = `admin, supervisor, agent` (consulta `pg_enum`); teste da main `:148` com 3 papéis |
| `src/services/outbound-message.service.ts` | **OBSOLETA**: branch fazia item sem dono drenar (`return true`); a main endureceu | main `:379` `if (!message.userId) return false;` e `:405-408` `enqueueOffline` lança sem sessão |
| `src/components/admin/MediaMigrationTool.tsx` | Incorporada por versão própria da main (contagem de pendentes + histórico) | main `:132,165-168` (pendentes), `:277` ("Histórico de migrações") |
| `src/components/ui/phone-input.tsx` | Incorporada e superada (E.164 explícito por ref, fixo de 8 sem `9`) | main `phone-input.tsx:19-21`, `:37-52`, `:77-82` |
| `src/components/talkx/TalkXView.tsx` | Incorporada e superada (`'paused'` **e** `'report'`) | main `TalkXView.tsx:66, 187-191, 310, 422-428` |
| `useTeamChatNotifications.ts`, `useAgentCelebrations.ts`, `useInboxFilters.ts`, `authenticatedUserId.ts`, `useSentimentData.ts`, `SettingsView.tsx`, `AuditLogDashboard.tsx`, `InboxEmptyChat.tsx`, `MessageReactions.tsx` | Incorporadas (main igual ou melhor) | main, respectivamente: `:243` (com `cid`), `:189-190` (com tolerância de relógio), `:65,107-109`, `:40`, `:234` (com `incomplete` real), `:74` (com `isSaving`), `:124-125` (`stat.hint`), `:112-122` (`kbd`), 0 linhas faltantes |
| `ESTADO.md`, `docs/talkx/ARQUITETURA.md`, `src/__tests__/a11y/icon-buttons-baseline.json`, `supabase/schema-manifest.json` | Artefatos gerados/regerados na main | `ESTADO.md:116,119` e `ARQUITETURA.md:7,92` mais novos que a branch |
| 8 testes restantes (`ContactDetails.quickActions`, `ChatMessagesArea.pagination`, `team-chat-notifications-mount`, `useInboxBulkActions`, `N8nIntegrationView.a11y`, `TalkXView.route`, `WhatsAppTemplatesManager.confirmacaoExclusao`, `VoiceChanger*`) | Incorporados em redação própria da main | ex.: main usa RPC `set_conversations_status` (plural) em `ContactDetails.quickActions.test.tsx:74,166`; `ChatMessagesArea.pagination.test.tsx:60,67-68`; `team-chat-notifications-mount.test.ts:52-56,76` |

## Exposição real hoje (produção, leitura)
`select count(*) ... from public.talkx_segments` → **1 segmento**, nenhum com regra `lead_origin/lead_score/risk_score`
nem `real_sector/real_uf`. As LACUNAS 1 e 2 são defensivas (regra "em breve" legada ou futura): o builder da main
já bloqueia adicionar campo `comingSoon` (`segments/TalkXSegmentBuilder.tsx:101,268-276`, `segments/RuleRow.tsx:38-40`).

## Lacunas a recuperar (hunks)

### LACUNA 1 — estimativa de público nula quando todas as regras são "em breve"
Hoje, na main: `splitRules` descarta a regra `comingSoon` → `complete.groups` fica `[]` → `countAudience({groups:[]})`
chama a RPC sem filtro e devolve **a base elegível inteira** como "público estimado" (main `useTalkXSegments.ts:310-322`).

`src/hooks/integrations/useTalkXSegments.ts` (aplicar sobre `useAudienceEstimate`, main `:360-371`):
```ts
function hasComingSoonRule(rules: SegmentRules | null | undefined): boolean {
  return (rules?.groups ?? []).some((g) => g.rules.some((r) => RULE_FIELDS.find((f) => f.value === r.field)?.comingSoon));
}

export function useAudienceEstimate(rules: SegmentRules | null | undefined, enabled = true) {
  const key = JSON.stringify(rules ?? null);
  const { complete, incompleteCount } = splitRules(rules);
  return useQuery({
    queryKey: ['talkx-audience-estimate', key],
    queryFn: async (): Promise<{ count: number | null; sample: AudienceContact[]; incompleteCount: number }> => {
      // Todas as regras "em breve" (ex.: só lead_origin): `complete.groups` vazio o motor
      // leria como base inteira. Sem estimativa honesta: contagem nula ("—" na tela).
      if (complete.groups.length === 0 && hasComingSoonRule(rules)) return { count: null, sample: [], incompleteCount };
      const [count, sample] = await Promise.all([countAudience(complete), resolveAudience(complete, 5)]);
      return { count, sample, incompleteCount };
    },
    enabled,
    staleTime: 15_000,
  });
}
```
Consumidores que precisam aceitar `count: null` (mostrar `—`):
- `src/components/talkx/TalkXCampaignWizard.tsx` (main, `SegmentPreviewCard`):
  `const count = est ? est.count : (estimatedCount ?? segment.estimated_count);` e
  `{count === null ? '—' : fmtInt(count)}`.
- `src/components/talkx/segments/TalkXSegmentBuilder.tsx:289` (main):
  `{est && est.count === null ? '—' : fmtInt(est?.count ?? 0)}`.
- `src/components/talkx/TalkXSegments.tsx:787` (main, rail): hoje `est?.count != null ? fmtInt(est.count) : s.estimated_count != null ? fmtInt(s.estimated_count) : '—'` — com a guarda, `count: null` cairia no `estimated_count` velho; trocar para mostrar `—` quando `est && est.count === null`.
- NÃO portar `comingSoon: true` em `real_sector`/`real_uf`: na main eles são `ponteOnly` (falha fechada), decisão posterior.

### LACUNA 2 — "Atualizar" da biblioteca perde tudo se um segmento falhar
Main `useTalkXSegments.ts:789-796` usa `Promise.all` sem `onError`: um segmento cuja regra lança
(`assertNoPonteOnlyFields`, main `:283-287`) aborta o recálculo de todos, em silêncio. O botão é o ↻
"Atualizar" do cabeçalho (`TalkXSegments.tsx:379-383`).
```ts
  const refreshEstimates = useMutation({
    mutationFn: async (segments: TalkXSegment[]) => {
      // allSettled: um segmento que falha (ex.: regra da ponte Singu) não derruba os demais.
      const results = await Promise.allSettled(segments.map(async (s) => {
        const estimated_count = await countAudience(s.rules);
        if (estimated_count !== s.estimated_count) {
          const res = await fromTable('talkx_segments').update({ estimated_count }).eq('id', s.id);
          if (res?.error) throw new Error(res.error.message);
        }
      }));
      return { failed: results.filter((r) => r.status === 'rejected').length, total: segments.length };
    },
    onSuccess: ({ failed, total }) => {
      invalidate();
      if (failed > 0) toast.error(`Não foi possível recalcular ${failed} de ${total} segmento(s); os demais foram atualizados.`);
    },
  });
```

### LACUNA 3 — "segmento fantasma" no painel Detalhes depois de ação em massa
Main limpa só o checkbox (`selectedIds`, `TalkXSegments.tsx:196-205`); o rail continua mostrando um segmento
que já saiu da lista. Adaptar ao nome da main (`selected`/`setSelected`, `selectedSegment`):
```ts
  // Depois de excluir/arquivar em lote o segmento some da lista carregada: zera a seleção para
  // não deixar um segmento fantasma no rail. Só quando ele JÁ esteve na lista (`seenInListRef`):
  // o recém-criado, que a lista ainda não recarregou, permanece (ver `selectedSegment` acima).
  const seenInRailRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selected) { seenInRailRef.current = null; return; }
    if (segments.some((s) => s.id === selected.id)) { seenInRailRef.current = selected.id; return; }
    if (seenInRailRef.current === selected.id) { seenInRailRef.current = null; setSelected(null); }
  }, [selected, segments]);
```

### Testes a portar
- `src/hooks/integrations/__tests__/useTalkXSegments.estimativa.test.tsx` (branch, 96 linhas): manter os blocos
  `useAudienceEstimate · grupo só com regra "em breve"` (use `lead_origin`, **não** `real_sector`) e
  `refreshEstimates · falha parcial` (espera `update({estimated_count:5})`, `eq('id','ok')` e toast com "1 de 2").
  Descartar o `describe('real_sector/real_uf "em breve"')` — contraria `ponteOnly` da main.
- `src/components/talkx/__tests__/TalkXSegments.selecaoFantasma.test.tsx` (branch, 67 linhas): mocka
  `sonner`, `@/hooks/auth/useAuth`, `@/integrations/supabase/client` (chain + `rpc` devolvendo
  `{mode:'count',eligible:1,...}`) e `useTalkXSegments` com `segments` em `vi.hoisted`; clica num cartão,
  esvazia `state.segments`, re-renderiza e exige que o rail "Detalhes do segmento" desapareça.
  Precisa adaptar aos mocks atuais da main (ver `TalkXSegments.detailPanel.test.tsx`).

## Branch pode ser apagada?
**Não** — `apagar_branch_seguro = false` até as 3 lacunas + 2 testes serem portados.

## Verificação adversarial

Tentei refutar o PERDIDA_PARCIAL abrindo a main em cada linha citada. **Não refutei: concordo.**
`origin/main` = `dac285f62`. `git merge-base --is-ancestor ccd09beb origin/main` → NOT-ANCESTOR (confirmado).

### As 3 lacunas existem mesmo na main (lidas, não inferidas)

1. **Estimativa nula** — `origin/main:src/hooks/integrations/useTalkXSegments.ts` `useAudienceEstimate`
   (bloco que termina em `staleTime: 15_000`) tem `queryFn` sem guarda alguma: chama
   `countAudience(complete)` direto. `git grep -n hasComingSoonRule origin/main` → nada.
   `splitRules` descarta a regra `comingSoon` e depois `.filter((group) => group.rules.length > 0)`
   (main `:177-186`), então `complete.groups` fica `[]`.
   **Premissa confirmada no SQL**, não só no TS: `supabase/migrations/20261002391230_talkx_audience_rpc.sql:276-277`
   — `IF array_length(v_groups_sql, 1) > 0 THEN v_where := v_where || ' AND (...)'`. Sem grupos, nenhum
   filtro de regra entra no `WHERE`: a RPC devolve a base elegível/visível inteira. A lacuna é real.
   `lead_origin`/`lead_score`/`risk_score` seguem `comingSoon: true` na main (`:90, :99, :100`).
2. **`Promise.all` no ↻ Atualizar** — main `refreshEstimates` (logo após `deleteSegment`) usa
   `await Promise.all(...)`, `onSuccess: () => invalidate()`, **sem `onError` e sem toast**.
   `git grep -n allSettled origin/main -- src/hooks/integrations/useTalkXSegments.ts` → zero ocorrências.
   **Agravante que o dossiê não destacou:** a main também ignora o erro do UPDATE
   (`await fromTable('talkx_segments').update({ estimated_count }).eq('id', s.id)` sem ler `res.error`),
   então hoje nem um `Promise.allSettled` isolado avisaria — portar junto o `if (res?.error) throw`.
3. **Seleção fantasma no rail** — main `TalkXSegments.tsx:196-205` mantém `seenInListRef` apenas para
   `selectedIds` (checkbox) e chama `clearSelection()`/`selectAll(stillAlive)`; **nunca** `setSelected(null)`.
   Os únicos `setSelected(null)` da main são `:97` (closePanel), `:245` (openNew) e `:347` (exclusão unitária).
   O rail monta em `{selected ? <SegmentDetailRail s={selectedSegment!} .../>` (`:588`) e
   `selectedSegment` (`:88-94`) faz fallback para `selected` quando a lista não tem a id
   (`if (!cached || !selected) return selected ?? null`) — ou seja, o fantasma sobrevive por construção.
   O efeito de rota `:128-134` não cobre: clicar numa linha/cartão só faz `setSelected(s)` (`:512, :536, :564`),
   sem `route.segmentId`.

### Não foi removido de propósito
`git log -S'hasComingSoonRule' --oneline origin/main`, `-S'Não foi possível recalcular'` e
`-S'seenInRailRef'` → **nenhum commit**. Nunca entrou na main; não houve revert/desativação.

### Encaixa no código atual
`RULE_FIELDS.comingSoon`, `splitRules`, `countAudience`, `fromTable`, `toast`, `selected/setSelected`,
`segments` — todos existem na main com a mesma assinatura. Só o `real_sector/real_uf` do commit-cabeça
não encaixa (main usa `ponteOnly` + `assertNoPonteOnlyFields` `:275-289`), como o dossiê já disse.

### Testes
`git ls-tree -r origin/main -- src/hooks/integrations/__tests__` lista 5 arquivos `useTalkXSegments.*`
(acoesEmMassa, dia-calendario, rpcDesacoplada, test.ts, viewMode) e **não** `estimativa.test.tsx`.
`src/components/talkx/__tests__` tem 20 arquivos de segmento e **nenhum** `selecaoFantasma`
(`git grep -ln fantasma origin/main -- src/components/talkx src/hooks/integrations` só acha código, nenhum teste).
`git show ccd09beb --stat` confirma que o commit-cabeça é exatamente 6 arquivos / 202 inserções.

### Correções ao dossiê (não mudam o veredito)
- **O gatilho descrito está errado.** "Depois de excluir/arquivar em lote" não produz o fantasma:
  `TalkXSegmentBulkAction = 'draft' | 'activate' | 'deactivate' | 'archive' | 'tag'` (main `:616`) —
  **não existe exclusão em lote** — e `segmentsQuery` faz `select('*, creator:created_by(name)')` sem
  filtro de status/arquivo, então arquivar **não** tira o segmento de `segments`. O fantasma real é
  segmento **apagado em outra aba/por outro usuário** (cenário que o próprio comentário da main `:193-194`
  reconhece para o checkbox) ou id que a RLS deixou de devolver. O defeito existe; o roteiro de repro, não.
  Quem portar deve escrever o teste com esse gatilho (esvaziar `segments`), que é justamente o que o
  teste da branch faz.
- **Risco do rail elevado por isso:** com o fantasma aberto, "Usar em campanha" (`:588` → `onUseCampaign([id])`)
  dispara o wizard com uma id que não existe mais. Mantém a lacuna em valor médio.
- **Exposição hoje é zero, não só baixa.** Produção (`tnnnlkbymytvtqngbbqh`, leitura):
  `select count(*) ... from public.talkx_segments` → 1 segmento, `com_em_breve=0`, `com_ponte=0`,
  **`sem_grupos=1`** (o único segmento tem `groups: []`). Para ele, `hasComingSoonRule` é falso: a guarda
  da LACUNA 1 **não** dispararia, e mostrar a base inteira para um segmento sem regra é o comportamento
  correto. Confirma que as LACUNAS 1 e 2 são guardas para regra legada/futura, não bug ativo.
- Ao portar a LACUNA 3, atenção: o rail da main monta em `selected` (`:588`), não em `selectedSegment` —
  zerar `selected` é o que faz o rail fechar.

**Veredito final: PERDIDA_PARCIAL. `apagar_branch_seguro = false`** até os 3 hunks + 2 testes estarem na main.
