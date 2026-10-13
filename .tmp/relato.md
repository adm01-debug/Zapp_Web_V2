Especialista: edgar

## Sensibilidade
- Toca `service_role`: o cliente service-role continua usado SÓ depois da autorização (lookup do relatório, envio e avanço do agendamento), como já era; o gate novo apenas lê a lista de domínios, não muda o gate de autorização.
- Nenhuma proteção afrouxada. Prova do caso NEGADO: `pd23: domínio externo → nada é enviado` (422, `resend.calls.length === 0`, agendamento não avança).
- Nenhuma referência ao banco/endpoint de produção; testes usam só o stub de fetch, sem rede real de provedor.
- Para quem chama (`src/hooks/chat/useScheduledReports.ts`): nada muda — ele dispara só `{ reportId }` e lê `error`; a resposta ganhou o campo numérico `rejected`.

## O que mudou e por quê (PD-23 / DD5)
- `supabase/functions/send-scheduled-report/index.ts`: gate de destinatário — só envia para e-mail sintaticamente válido E de domínio confiável; os demais são recusados e registrados apenas em CONTAGEM (nunca o endereço, que é dado pessoal) no log e na resposta. Limite de destinatários por relatório: acima dele nada é enviado e o ciclo não avança. A lista vem de `TRUSTED_EMAIL_DOMAINS`, com o mesmo default e a mesma regra do allowlist de signup (`app.settings.trusted_domains`, migration 20260925140000, default `promobrindes.com.br`). PostgREST/Edge não leem GUC de banco e o cartão restringe os arquivos a esta função (sem migration para criar RPC), então a Edge espelha a mesma regra/default — falha fechada, nunca "permite todos". O match de domínio é exato e case-insensitive (subdomínio não passa).
- `supabase/functions/send-scheduled-report/index.test.ts`: os testes existentes foram apontados para `@promobrindes.com.br` (antes `@exemplo.test`, que é domínio externo e agora seria recusado) e entraram 6 testes novos: recusa de domínio externo, misto (só o confiável sai), e-mail inválido, limite excedido, env/default e normalização da lista.
- Ramos de erro: mantive o comportamento anterior (falha total não avança o ciclo; parcial avança com status próprio) e acrescentei o ramo "nenhum destinatário permitido" → 422 sem avançar o ciclo, em vez de reportar sucesso silencioso.

## Prova
- vermelho antes (gate removido, mesmos testes): `deno test --allow-env --allow-net --filter "pd23" supabase/functions/send-scheduled-report/index.test.ts` → `FAILED | 3 passed | 4 failed | 18 filtered out` e `error: Error: esperado 422, recebido 200`
- verde depois: `deno test --allow-env --allow-net supabase/functions/send-scheduled-report/index.test.ts` → `ok | 25 passed | 0 failed`

## O que NÃO fiz e por quê
- Não mexi no manifesto de deploy: não entrou arquivo de função novo; o manifesto já lista a função (o integrador regenera).
- Não criei migration/RPC para ler o GUC do banco (fora dos arquivos do cartão).
- Não sobrescrevi `scheduled_reports.recipients`: os endereços continuam guardados como estão; a recusa é aplicada na hora do envio.
