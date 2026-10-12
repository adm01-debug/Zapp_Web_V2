# retomar conflito: alerta de rate limit não pode apagar bloqueio permanente (R2-API-056)

Especialista: Edgar (area-edge-api)

## Situação
O cartão mandava reaplicar a entrega original (commit 14613a9b, também na branch
mentada 775420344) que ficou em conflito ao rebasear sobre dia/2026-10-11. Conferindo
o código ATUAL da base dia/2026-10-11, o defeito JÁ ESTÁ CORRIGIDO: uma correção
equivalente entrou no histórico pelo commit 5a371a96b ("fix(edge): alerta de rate limit
preserva bloqueio permanente", 07/10 22:22), que é ancestral do HEAD de hoje.

## O que já está no código (nenhuma mudança feita nesta tarefa)
- supabase/functions/send-rate-limit-alert/index.ts, bloco `if (blocked)`:
  - upsert com `{ onConflict: "ip_address", ignoreDuplicates: true }` → ON CONFLICT DO
    NOTHING, cria o bloqueio temporário só quando o IP não tem linha; nunca toca numa
    linha existente, então não apaga bloqueio administrativo permanente.
  - update compare-and-swap `.eq("is_permanent", false).lt("expires_at", expiresAt)` →
    só estende o prazo de linha temporária e mais curta; bloqueio permanente
    (is_permanent=true) e expires_at NULL não casam os filtros e não são tocados.
- supabase/functions/send-rate-limit-alert/index.test.ts: os 3 testes de R2-API-056 da
  entrega original estão presentes — bloqueio permanente preservado, prazo temporário
  mais longo não reduzido, e IP sem linha cria bloqueio temporário de ~15min.

## Prova
- diff desta tarefa: vazio (nada modificado) — o cartão manda fechar sem commit quando
  já resolvido.
- verde: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/send-rate-limit-alert/index.test.ts`
  → `ok | 10 passed | 0 failed (57ms)`, incluindo os 3 testes que provam o defeito:
  "blocked_ips: alerta NÃO sobrescreve bloqueio permanente (motivo/autoria preservados) ... ok",
  "blocked_ips: alerta NÃO reduz prazo de bloqueio temporário mais longo ... ok",
  "blocked_ips: sem linha → alerta cria bloqueio temporário de ~15min ... ok".

## Caminhos do mesmo defeito e como cada conflito ficou
- supabase/functions/send-rate-limit-alert/index.ts (ramo `if (blocked)`, o upsert
  incondicional que sobrescrevia o bloqueio permanente): já corrigido na base atual —
  upsert `ignoreDuplicates:true` (linhas 97-107) + update compare-and-swap (linhas 114-124).
- supabase/functions/send-rate-limit-alert/index.test.ts (o arquivo que apareceu como
  "em conflito hoje"): já traz os 3 testes de R2-API-056 a partir da linha 229, sem
  marcador de conflito. Nada a resolver: a base atual já contém a intenção da entrega.
- vermelho-antes: não se aplica — não há mudança nesta tarefa (o estado corrigido já é o
  da base); por isso nenhum commit de código.

## Sensibilidade
- Toca rate limit e service_role, mas nesta tarefa NÃO alterei nenhum arquivo (diff
  vazio): nenhuma proteção foi afrouxada.
- Prova do caso NEGADO (o defeito): o teste "alerta NÃO sobrescreve bloqueio permanente"
  passa com a semântica ON CONFLICT DO NOTHING + CAS; um upsert incondicional reprovaria
  is_permanent, expires_at, reason, blocked_at.
- Nenhuma referência a banco/endpoint de produção; os testes usam fake PostgREST em memória.
- Para quem chama: nada muda — a função segue respondendo 200 em sucesso e o comportamento
  de bloqueio já é o corrigido.

## O que NÃO fiz e por quê
- Não commitei código: o defeito já está corrigido na base atual; reaplicar o commit
  original duplicaria a correção e o diff não teria o que mudar.

Concluí: o defeito R2-API-056 não existe mais no código atual; a correção equivalente já
está integrada (5a371a96b) e é provada pelos testes verdes.
