# Plano — tipografia e design dos cards de Contatos (10/10/2026)

> Pedido do Joaquim: fontes grandes/desproporcionais no módulo Contatos + cards precisam
> de design melhor, mais moderno, com mais informação. Base: investigação exaustiva lendo
> os componentes reais (ContactCard, ContactListItem, ContactsTable, CRMContactCard,
> ContactDetailPanel, ContactGroupedList, ContactEmptyState).

## 1. Fato que muda a referência

A escala tipográfica fluida (`--text-xs`..`--text-4xl` em tokens.css) **não existe mais**
— foi removida em 09/10 (SL-177). A escala de verdade hoje é a modular fixa de
`tailwind.config.ts`: 3xs=10px, 2xs=11px, xs=12px, sm=14px, base=16px, lg=18px, xl=20px,
2xl=24px, kpi-value=34px, page-title=38px. Todo cartão abaixo usa essa escala.

## 2. O módulo tem 3 implementações independentes do "card de contato"

`ContactCard.tsx` (grade, view padrão), `ContactListItem.tsx` (lista) e
`CRMContactCard.tsx` (resultado de busca CRM) — nenhuma herda de uma base comum. Isso
explica boa parte dos achados: a mesma coisa (seleção, hover, tamanho de texto) foi
implementada 3 vezes, de 3 jeitos diferentes.

## 3. Achados — tipografia

1. `ContactCard.tsx` (view padrão): telefone/e-mail no mesmo tamanho do nome — zera a
   hierarquia. As outras 3 views já fazem certo (um degrau menor).
2. 9 ocorrências de `text-[9px]` arbitrário, ABAIXO do piso da própria escala (3xs=10px)
   — em CRMContactCard, ContactDetailPanel, ContactKanbanView, ContactSearchWithSuggestions.
3. `ContactCard.tsx`: nome da empresa 2px maior que nas outras 3 views.
4. Iniciais decorativas do avatar maiores/mais pesadas que o nome real da pessoa — inverte
   a hierarquia (no card de grade E no painel de detalhe).
5. Cabeçalho de grupo (nome da empresa que agrupa vários contatos) do mesmo tamanho/peso
   do nome de cada contato — sem destaque. O painel de detalhe já tem o padrão certo.
6. Estado vazio: mesmo papel semântico com peso de fonte diferente em 3 ocorrências.

## 4. Achados — design do card

1. **Mais grave — acessibilidade real**: controles que só aparecem no `:hover` (checkbox
   de seleção, ações rápidas) não têm NENHUM fallback de toque — inacessíveis em
   mobile/tablet, não é só estética.
2. 3 tratamentos visuais diferentes pro MESMO estado "selecionado" nas 3 views.
3. `CRMContactCard` quase não reage ao hover (opacidade 2%) comparado ao resto do módulo.
4. Card de grade com vão vazio quando o contato não tem telefone nem e-mail (altura
   mínima fixa, sem conteúdo de reserva).
5. 4 alvos de clique pra só 2 ações únicas (menu kebab duplica os botões do rodapé).
6. O mesmo componente de linha fica 50% mais apertado quando agrupado por empresa, sem
   motivo funcional.
7. View "Lista" tenta parecer tabular com flexbox de larguras mínimas, desalinha com
   conteúdo variável — a view "Tabela" já faz certo com `<table>` de verdade.
8. Estrutural: as 3 implementações não compartilham base — toda correção de estado
   precisa ser replicada 3x (prova: achados 2, 3 e 6 acima).

## 5. Pedido do Joaquim: mais moderno + mais informação

Não inventar métrica morta (ex. não reusar lead_score/risk_score — já confirmado sem
cálculo real, cartão à parte). Informação a acrescentar deve vir de dado que já existe
no registro do contato — decidir e confirmar coluna real antes de codar, não supor.

## 6. Ondas

1. Tipografia do card padrão (achados 1, 3, 4-grade) — maior visibilidade, menor esforço.
2. Tamanhos abaixo do piso (achado 2) — mecânico, 4 arquivos.
3. Cabeçalho de grupo + empty-state (achados 5, 6).
4. Acessibilidade de toque (achado design 1) — prioridade por ser funcional, não só visual.
5. Unificar estado selecionado (achado design 2).
6. Polimento: hover do CRMContactCard + vão vazio + botões duplicados + espaçamento
   agrupado (achados design 3, 4, 5, 6).
7. "Lista" vira grid real (achado design 7).
8. Base compartilhada entre as 3 implementações + acrescentar informação nova (achado
   design 8 + pedido do Joaquim) — por último, de propósito: só depois dos outros
   cartões corrigirem o que cada view tem hoje, extrair o compartilhado fica mais barato.

## Referências

- `src/components/contacts/ContactCard.tsx`, `ContactListItem.tsx`, `ContactsTable.tsx`,
  `CRMContactCard.tsx`, `ContactDetailPanel.tsx`, `ContactGroupedList.tsx`,
  `ContactEmptyState.tsx`, `ContactKanbanView.tsx`, `ContactSearchWithSuggestions.tsx`,
  `ContactContentArea.tsx`
- `tailwind.config.ts` (escala modular fixa, referência de tamanho correto)
