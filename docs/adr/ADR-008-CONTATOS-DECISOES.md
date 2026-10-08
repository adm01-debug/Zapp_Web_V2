# ADR-008: Contatos — decisões do dono (D1–D7)

- **Status:** Accepted — resposta/padrão aprovado pelo dono em 2026-10-08 (etapa MC-003); vale até o dono mudar
- **Data:** 2026-10-08
- **Decisor:** Joaquim (dono do produto)
- **Escopo:** módulo Contatos (`src/components/contacts`, `src/hooks/crm`, `src/services/contact*`)
- **Plano:** `docs/plans/PLANO_MODULO_CONTATOS_100_ETAPAS_2026-10-08.md`, seção 9 (D1–D7)

## Contexto

A auditoria de 08/10/2026 (plano, seção 2) encontrou o módulo com pontos que dependiam de decisão do dono:
os cards de KPI "Empresas" e "Fornecedores" apareciam zerados e sem definição escrita; o alternador
"Mostrar legados" não explicava o que são legados nem tinha nome acessível; não havia limite para
contagem exata; restaurar contato excluído só existia por SQL manual; e o enriquecimento do CRM
externo (Singu) não tinha escopo documentado.

As sete decisões foram apresentadas na seção 9 do plano e respondidas pelo dono em 2026-10-08 (padrão
recomendado aprovado; D6 respondida mantendo o escopo atual, com revisão marcada). Em todas vale a
regra da casa: **o Zapp Web não exporta, não importa e não faz edição em massa de contatos** (isso é do
Singu) e nenhuma informação sai do sistema.

## Decisões

Uma linha por decisão, com a resposta do dono, o motivo e as etapas MC-0xx que a implementam.

| # | Decisão | Motivo | O que muda nas etapas MC-0xx |
|---|---|---|---|
| **D1 · KPIs** | "Empresas" = empresas distintas dos contatos (contatos agrupados pela empresa normalizada); "Fornecedores" = contatos do tipo `fornecedor`; clicar no card aplica o filtro correspondente. | Os dois cards apareciam zerados e sem definição. Sem regra escrita, cada tela pode contar de um jeito: "empresas" não é "contatos com empresa preenchida", e fornecedor é um tipo, não uma tag. | **MC-048** (definição, tooltip com a definição e clique que filtra). MC-023 e MC-028 mexem nos mesmos cards (contraste e faixa no celular) sem mudar a definição. |
| **D2 · "Mostrar legados"** | O alternador fica, com explicação do que são os legados (contatos antigos importados sem telefone válido) e nome acessível; a tela de higiene de legados é **só para admin**. | Legado é dado real: não se esconde sem explicar. Reclassificar ou excluir um legado é ação sensível, então a higiene é de admin. Hoje o alternador não explica e a higiene não existe. | **MC-014** (role=switch, aria-checked, nome claro e explicação) e **MC-077** (higiene de legados, um contato por vez, só admin). MC-085 e MC-086 usam a mesma definição de legado. |
| **D3 · Contagem** | Exata até 10 mil contatos; acima disso, aproximada, com rótulo "≈". | Contar exato em base grande custa varredura completa a cada carregamento; número aproximado e rotulado é honesto e barato. | **MC-094** (contagem exata até o limite, aproximada/cacheada acima, rótulo "≈"). As contagens por tipo das abas continuam vindo da consulta agregada (MC-050). |
| **D4 · Fotos** | Foto real quando existir (`contacts.avatar_url`); sem foto, iniciais. | A base não tem foto para todos os contatos. Iniciais com cor estável por contato mantêm o avatar legível e sem salto de layout. | **MC-051** (avatar com foto real, carregamento preguiçoso e fallback de iniciais com cor estável). |
| **D5 · Lixeira** | Excluir contato é soft delete; lixeira de 30 dias; restaurar e apagar em definitivo **só admin**. | Exclusão precisa ser reversível por 30 dias, mas restaurar e apagar em definitivo (irreversível) são ações de risco. Hoje o restaurar só existe por SQL manual. | **MC-083** (excluir UM contato: confirmação, soft delete, aviso de impacto) e **MC-084** (lixeira de 30 dias: listar, restaurar e apagar definitivamente — admin); MC-085 roda as receitas do runbook em banco descartável. |
| **D6 · CRM externo (Singu)** | Fica **somente o que já existe em leitura**, sem ampliar nada: nenhuma leitura, exibição, sincronização ou importação nova. A revisão — o que lê, o que exibe e se continua — é a etapa **MC-068**. | O Singu é a fonte e o Zapp exibe. Como o Zapp não importa informações, a leitura existente não pode virar porta de entrada de dado. Remover agora perderia empresa/cargo/e-mail já usados na tela. | **MC-068** (documentar exatamente o que é lido/exibido e decidir com o dono se continua). Nenhuma outra etapa deste plano amplia o consumo do CRM externo. |
| **D7 · Mesclar e comparar** | Mesclar e comparar ficam no Zapp: operam sobre 2 ou 3 contatos específicos, não são edição em massa. | São correções pontuais de duplicidade escolhidas a dedo pelo operador; a edição em massa de contatos é feita só pelo Singu. | **MC-045** (seleção só para mesclar/comparar, até 3 contatos), **MC-029** (barra de seleção) e **MC-075** (retirar a edição em massa; ficam ações por contato, mesclar e comparar), com **MC-079 a MC-083** (duplicados, mesclar, comparar, auditoria e exclusão de um contato). |

## Estado no código em 2026-10-08 (evidência)

- **D1:** `src/components/contacts/ContactStatsCards.tsx` já exibe os rótulos "Empresas" e "Fornecedores" a
  partir de `src/hooks/crm/useContactsKpi.ts` (`empresasDistinct` = conjunto normalizado de `company`;
  `contact_type === 'fornecedor'`). `src/components/contacts/ContactKpiCard.tsx` não tem clique nem
  tooltip de definição — é o que a MC-048 acrescenta.
- **D2:** `src/components/contacts/ContactToolbar.tsx` tem o alternador "Mostrar legados" (`showLegacy`);
  `src/services/contact.service.ts` envia `include_legacy` para as RPCs `search_contacts` e
  `contacts_count_by_type`; a coluna nasce em
  `supabase/migrations/20260906000001_e31_contacts_is_lid_legacy.sql`. Não existe tela de higiene.
- **D3:** `useContactsKpi.ts` pagina a tabela inteira (`KPI_PAGE_SIZE = 1000`) e `contact.service.ts`
  usa `contacts_count_by_type` — hoje a contagem é sempre exata, sem o limite de 10 mil nem o "≈".
- **D4:** `src/components/contacts/ContactListItem.tsx` usa `contact.avatar_url` no `AvatarImage` e
  `getInitials`/`getAvatarColor` de `src/lib/avatar-colors.ts`; o mesmo par aparece em `ContactsTable.tsx`,
  `ContactKanbanView.tsx` e `ContactCompareDialog.tsx`.
- **D5:** o soft delete é `contacts.deleted_at`
  (`supabase/migrations/20260929370000_contacts_soft_delete_and_search_filters.sql`); não há lixeira nem
  restaurar na aplicação.
- **D6:** as leituras passam pela edge `crm-integration` (`src/lib/crmIntegration.ts` e
  `src/services/crm/external-crm.service.ts`), pelos hooks `useExternalContact360`, `useExternalEmpresas`,
  `useExternalCargos`, `useContactSidebar` e `useContactIntelligence`, e pela flag
  `useCRMIntegrationEnabled` — só leitura, nada é gravado no Zapp a partir daí.
- **D7:** `src/components/contacts/ContactMergeDialog.tsx`, `ContactCompareDialog.tsx` e
  `src/services/contact-merge.service.ts` (`mergeContactsAtomic`) já existem. A edição em massa ainda está
  no módulo (`src/components/contacts/BulkActionsBar.tsx`, `ContactBulkTagDialog.tsx`,
  `src/services/contact-bulk.service.ts`) e sai na MC-075.

**Nota de numeração:** "D4" também aparece em comentário antigo do código com outro sentido
(`src/components/contacts/ContactToolbar.tsx`, "D4: contatos legados ... ficam fora por padrão"), da
numeração de um plano anterior. Neste ADR, D1–D7 são as decisões do plano de 2026-10-08 (seção 9) e é
essa numeração que as etapas MC-0xx citam (ex.: MC-051 "(decisão D4)" = fotos).

## Alternativas descartadas

- **Contagem sempre exata (D3):** custo de varredura completa na base grande; um número aproximado e
  rotulado com "≈" é melhor do que atraso na tela.
- **Remover o enriquecimento do CRM externo (D6):** perderia empresa/cargo/e-mail já exibidos no painel;
  a decisão é manter o que existe sem ampliar, com a revisão em MC-068.

## Consequências

- As etapas que citam uma decisão (MC-014, MC-023, MC-028, MC-029, MC-045, MC-048, MC-050, MC-051, MC-068,
  MC-075, MC-077, MC-079 a MC-086 e MC-094) implementam o que está aqui; decisão que não está neste ADR
  não existe para o módulo.
- Nada neste ADR autoriza exportar, importar, baixar, copiar, imprimir ou editar em massa: essas ações
  continuam fora do Zapp (a edição em massa de contatos é do Singu).
- Mudar uma decisão exige ADR novo (ou emenda datada neste), não uma exceção dentro de uma etapa.

## Referências

- `docs/plans/PLANO_MODULO_CONTATOS_100_ETAPAS_2026-10-08.md` — plano do módulo (MC-003, seção 9 com as
  perguntas D1–D7 e seção 8 com a rastreabilidade das etapas).
- `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md` — fronteira com o Singu (canal não oficial).
- Regras da casa de 07–08/10/2026: nada sai do sistema; sem exportar/importar/edição em massa no Zapp.
