Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/inbox/useRealtimeInbox.ts: quando o contato selecionado não está na lista (notificação, busca, link) o hook agora valida o UUID ANTES de consultar `contacts` e publica o resultado da ponte num estado próprio (`selectedContactFallbackStatus`: 'idle' | 'loading' | 'error' | 'not-found', mais `selectedContactFallbackError`). Antes, id malformado ia ao banco e virava "sem resultado", e falha de transporte só fazia `log.error` e retornava — a área de chat ficava mudada.
- src/components/inbox/RealtimeInboxView.tsx: com status 'not-found' ou 'error' a área de chat mostra o motivo em pt-BR ("Conversa não encontrada" / "Não foi possível abrir a conversa") e a ação "Voltar à lista" (limpa a seleção), em vez do vazio genérico "Selecione uma conversa". Durante a consulta mostra o spinner (motion-safe:animate-spin).

## Prova (execução concreta, zero falhas, zero pulados)
- `npx vitest run src/hooks/inbox/__tests__/useRealtimeInbox.contato-fora-lista.test.tsx src/components/inbox/__tests__/RealtimeInboxView.contato-fora-lista.test.tsx` → `Test Files 2 passed (2); Tests 7 passed (7)`

## Cobertura por caso (o que cada teste prova)
- id que não é UUID → `supabase.from` NÃO é chamado e o status é 'not-found'.
- falha de transporte → status 'error' com motivo visível.
- contato inexistente/sem acesso (zero linhas) → status 'not-found'.
- sucesso → conversa de fallback publicada e status 'idle'.
- view: 'not-found' e 'error' mostram o motivo e "Voltar à lista" chama `setSelectedContactId(null)`; sem seleção, o vazio genérico continua.

## O que NÃO fiz e por quê
- Não mexi no realtime de contatos nem na paginação: o defeito é só na ponte do contato fora da lista.
- `useRealtimeInbox` tem um único consumidor (RealtimeInboxView); a mudança no retorno é aditiva.
- O spinner usa `motion-safe:animate-spin` seguindo a convenção já usada no projeto (ex.: ConnectionAuditDialog, NotificationsPopover).

Concluí: os dois arquivos do cartão mudaram e os testes provam os quatro estados da ponte do contato fora da lista.
