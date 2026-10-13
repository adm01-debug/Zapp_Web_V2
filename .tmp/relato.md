Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/contact-details/CustomFieldsSection.tsx` (novo): seção "Campos personalizados" que lista nome+valor de `contact_custom_fields`, cria, edita na linha (Enter salva / Esc cancela) e exclui com confirmação. O corpo só monta com a seção aberta (Radix desmonta `AccordionContent` fechado), então abrir uma conversa não dispara consulta extra.
- `src/components/inbox/ContactDetails.tsx`: registra a seção no acordeão do painel (`<CustomFieldsSection contactId={contact.id} />`), ao lado das seções já existentes.
- `src/hooks/crm/useContactCustomFields.ts`: faltava a operação de editar — adiciono `updateField(fieldId, fieldValue)` (`update ... eq('id')`, espelhando o `delete` que já existia). O `upsert` antigo só serve para criar; editar por ele colidiria com o índice único `(contact_id, field_name)`.
- `src/components/inbox/contact-details/__tests__/CustomFieldsSection.test.tsx` (novo): prova pela seção REAL + hook REAL, mockando só a borda do Supabase.

## RLS / somente leitura
A tela não duplica a regra de permissão: espelha a resposta do servidor. Quando o PostgREST recusa a escrita por RLS (`42501` / "row-level security"), a seção vira somente leitura (some com Adicionar/Editar/Remover e mostra o aviso), mantendo os valores em leitura — exatamente o caso "agente que vê o contato por fila sem poder editar" (PB-26). A tela nunca confirma antes do servidor: o sucesso/remoção só acontecem depois do retorno; o diálogo de exclusão fica aberto até o servidor responder.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/contact-details/__tests__/CustomFieldsSection.test.tsx -t "não some da lista antes"` com uma remoção otimista temporária no hook → `Tests 1 failed | 8 skipped (9)` na linha 198 (`expect(screen.getByText('CPF')).toBeInTheDocument()` — a linha sumia antes do servidor).
- verde depois: `npx vitest run src/components/inbox/contact-details/__tests__/CustomFieldsSection.test.tsx` → `Test Files 1 passed (1); Tests 9 passed (9)`.
- regressão (arquivos vizinhos): `npx vitest run src/components/inbox/contact-details/__tests__/CustomFieldsSection.test.tsx src/hooks/__tests__/useContactCustomFields.test.tsx src/components/inbox/contact-details/sidebar/__tests__/` → `Test Files 13 passed (13); Tests 89 passed (89)`.

## Cobertura dos critérios (testes nomeados no arquivo novo)
listar; vazio + Adicionar; criar (payload exato ao servidor); editar Enter; editar Esc (não grava); editar pelo check; excluir com confirmação; sem sumir antes do servidor; RLS → somente leitura.

## O que NÃO fiz e por quê
- Não mexi em `src/services/contact.service.ts` nem em migration/policy: a permissão é decidida pela RLS existente na tabela; o cartão limita o SQL a outra trilha.
- Não usei nem criei etiqueta/tag.
- Não coloquei a seção entre as 3 do `sidebarSections` (professional/personal/singu): aquela config é de outro plano e o teste dela fixa o default nas 3; segui o precedente da seção já montada direto no acordeão.
