# O que muda ao ligar a chave `crm.integration`

Gerado a partir dos usos de `useCRMIntegrationEnabled`
(`src/hooks/system/useCRMIntegrationEnabled.ts:6`).
Cada entrada lista a tela, o efeito e o risco quando a chave está ativa.

---

## Componentes (telas)

| Tela | Arquivo | Efeito ao ligar | Risco |
|------|---------|-----------------|-------|
| TalkX — seletor de contato | `src/components/talkx/TalkXContactSelector.tsx` | Mostra badge CRM com informações do CRM externo no seletor de contato | Se o CRM retornar dados inconsistentes, o badge exibe informações erradas |
| Admin — Dashboard CRM | `src/components/admin/AdminCRMDashboard.tsx` | Renderiza o dashboard completo em vez do aviso "CRM externo não configurado" | Se a Edge do CRM estiver indisponível, o dashboard pode falhar silenciosamente |
| Lista de contatos | `src/components/contacts/ContactsView.tsx` | Repassa `crmIntegrationEnabled` para componentes filhos que exibem dados CRM | Se a flag mudar dinamicamente, os filhos precisam reagir corretamente |
| CRM 360 Explorer | `src/components/crm360/CRM360ExplorerView.tsx` | Renderiza a view completa do CRM 360 em vez do aviso "CRM Externo Não Configurado" | Se a Edge do CRM estiver indisponível, a view pode falhar silenciosamente |
| Chat — cabeçalho da conversa | `src/components/inbox/chat/ChatHeader.tsx` | Busca dados CRM 360 e inteligência do contato para o briefing do chat | Se a API do CRM falhar, o briefing fica vazio mas o chat não quebra |
| Busca global — filtros | `src/components/inbox/search/GlobalSearchFilters.tsx` | Exibe o toggle de filtro CRM na barra de filtros de busca global | Se o toggle aparecer mas a API do CRM falhar, o filtro retorna resultados inconsistentes |
| Detalhes do contato — ações | `src/components/inbox/contact-details/ContactActionButtons.tsx` | Mostra o item de menu "Sincronizar com CRM" no dropdown de ações | Se a sincronização falhar, o contato pode ficar inconsistente entre Zapp e CRM |
| Detalhes do contato — cabeçalho | `src/components/inbox/contact-details/ContactHeaderSection.tsx` | Busca dados CRM para exibir informações adicionais no cabeçalho do contato | Se a API do CRM falhar, o cabeçalho mostra dados incompletos |

## Hooks (camada de dados)

| Hook | Arquivo | Efeito ao ligar | Risco |
|------|---------|-----------------|-------|
| useSyncToCRM | `src/hooks/integrations/useSyncToCRM.ts` | Habilita a mutação de sincronização de conversas com o CRM externo | Se a sincronização falhar, dados de conversas podem não ser refletidos no CRM |
| useExternalDB — useExternalSelect | `src/hooks/integrations/useExternalDB.ts` (linha 32) | Habilita queries para o banco de dados do CRM externo | Se o CRM externo estiver indisponível, queries de dados externos falham silenciosamente |
| useExternalDB — useExternalRPC | `src/hooks/integrations/useExternalDB.ts` (linha 61) | Habilita chamadas RPC para o banco de dados do CRM externo | Se o CRM externo estiver indisponível, RPCs falham silenciosamente |
| useEmailContactContext | `src/hooks/crm/useEmailContactContext.ts` | Habilita a busca de contexto de contato de e-mail no CRM externo | Se o CRM falhar, o contexto de e-mail fica indisponível mas não quebra o fluxo de e-mail |
| useExternalContact360 | `src/hooks/crm/useExternalContact360.ts` | Habilita a busca de dados 360° do contato no CRM externo | Se o CRM falhar, dados 360° ficam indisponíveis mas não quebram a UI |
| useExternalEmpresas | `src/hooks/crm/useExternalEmpresas.ts` | Habilita a busca de empresas no CRM externo | Se o CRM falhar, dados de empresas ficam indisponíveis |
| useExternalContact360Batch | `src/hooks/crm/useExternalContact360Batch.ts` | Habilita a busca batch de dados 360° de múltiplos contatos no CRM externo | Se o CRM falhar, dados batch ficam indisponíveis mas não quebram a UI |
| useContactSidebar | `src/hooks/crm/useContactSidebar.ts` | Habilita a busca de dados do sidebar de contato no CRM externo | Se o CRM falhar, o sidebar fica vazio mas não quebra a UI |
| useExternalCargos | `src/hooks/crm/useExternalCargos.ts` | Habilita a busca de cargos/funções no CRM externo | Se o CRM falhar, dados de cargos ficam indisponíveis |
| useAdvancedContactSearch | `src/hooks/crm/useAdvancedContactSearch.ts` | Habilita filtros CRM (vendedor, ramo, RFM segment) na busca avançada de contatos | Se o CRM falhar, filtros CRM retornam vazios mas não quebram a busca |
| useContactIntelligence | `src/hooks/crm/useContactIntelligence.ts` | Habilita a busca de inteligência do contato no CRM externo | Se o CRM falhar, dados de inteligência ficam indisponíveis mas não quebram a UI |
| useGlobalSearchData | `src/components/inbox/useGlobalSearchData.ts` | Inclui dados CRM nos resultados da busca global quando o filtro CRM está ativo | Se a API do CRM falhar, os resultados da busca podem ficar incompletos |

## Uso do hook central

| Arquivo | Papel |
|---------|-------|
| `src/hooks/system/useCRMIntegrationEnabled.ts` | Hook central: combina a flag de runtime `crm.integration` com a verificação de configuração externa (`isExternalConfigured`). Fail-closed: retorna `false` se qualquer uma das duas condições falhar. |
| `src/hooks/system/index.ts` (linha 43) | Re-exporta o hook para o resto do sistema. |
