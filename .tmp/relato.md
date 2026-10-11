Especialista: worker (geral)

## O que este cartão entrega
Só relato (área docs): nenhuma linha de código, teste ou migration muda neste cartão. O
`.tmp/relato.md` foi reescrito para registrar, com a saída real colada, que a lacuna
conexão-escopo no enfileiramento (L7 da matriz) **já está fechada** pela migration
`20260930200000`. A conclusão do trabalho anterior é reaproveitada; o texto é novo.

## Caminho real auditado (arquivo:linha)
- `supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql:16` repõe
  `CREATE OR REPLACE FUNCTION public.enqueue_outbound_message(...)`. A guarda de escopo de conexão
  por fila está em `:115-131`: fora de `public.is_admin_or_supervisor(auth.uid())`, quando a conexão
  resolvida (`v_connection_id`) é diferente da conexão atribuída ao contato e existe vínculo em
  `public.whatsapp_connection_queues`, exige membro ativo de uma das filas vinculadas; caso contrário
  `RAISE EXCEPTION 'whatsapp_connection_out_of_scope' USING ERRCODE = '42501'` (`:130`).
- É a última definição da RPC por timestamp: `git grep` em `supabase/migrations` mostra `CREATE OR
  REPLACE` só em `20260909220000`, `20260909250000`, `20260930190000` e `20260930200000`; nenhuma
  migration posterior (há várias de 2026-10) repõe a função.
- Único caminho de envio no navegador: `src/services/outbound-message.service.ts:110-111`
  (`rpcClient.rpc('enqueue_outbound_message', {...})`).

## Prova — saída real (rodada agora)
Comando: `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/enqueue-connection-scope.test.sh`

    -- BLOCO A: ANTES da migration (o defeito) ------------------------------------------
    [PASS] A1 DORA (fora da fila) envia pela conexao DA FILA num contato de OUTRA conexao -- defeito do L7
    [PASS] A2 a mensagem saiu pela conexao da fila

    -- Aplicando a migration ------------------------------------------------------------

    -- BLOCO B: DEPOIS da migration ----------------------------------------------------
    [PASS] B1 DORA (fora da fila) e recusada com 42501 whatsapp_connection_out_of_scope
    [PASS] B2 nada foi gravado por DORA
    [PASS] B3 CARLA (membro da fila) enviando pela conexao da fila -- permitido
    [PASS] B4 ADM (admin/supervisor) escolhe a conexao da fila -- permitido
    [PASS] B5 DORA usa a conexao SEM vinculo de fila -- permitido (inerte por construcao)
    [PASS] B6 DORA envia SEM informar conexao e o contato esta na conexao da fila -- permitido pela atribuicao do contato
    [PASS] B7 a guarda de permissao do L9 continua valendo (quem nao tem send_messages e recusado)
    [PASS] B8 total de mensagens gravadas: 4 permitidas, 0 das recusadas

    [OK] contrato de escopo de conexao no enfileiramento verificado
    EXIT=0

Resultado: **10 PASS / 0 FAIL**, exit 0 (PostgreSQL 17 descartável via Docker).

## Ponto 3 (vermelho→verde) — N/A justificado
N/A: a lacuna já estava fechada pela migration `20260930200000` na ponta `dia/2026-10-08` e nenhum
código é alterado neste cartão, então não há mudança para virar vermelho→verde. O vermelho→verde já
é interno à própria suíte: o BLOCO A prova o envio de quem está fora da fila **passando antes** da
migration (o defeito) e o BLOCO B prova a recusa **42501 whatsapp_connection_out_of_scope depois**
dela, com B3 (membro da fila) e B4 (admin/supervisor) permitidos.

## Pontos do revisor ([refazer 2])
- Ponto 1 (alegava sem prova que a lacuna já está fechada): agora o relato cita `arquivo:linha` da
  migration (`20260930200000:115-131`, erro em `:130`) e cola a saída real da suíte que prova o
  comportamento antes/depois.
- Ponto 2 (não descrevia o caminho real auditado): descrito acima — migration `20260930200000` repõe
  `public.enqueue_outbound_message` com a guarda, e o único chamador no navegador é
  `src/services/outbound-message.service.ts:110-111`.
- Ponto 3 (teste de fumaça fora dos artefatos; conclusão dependeria de migration fora do diff não
  inspecionada): a saída real da suíte está colada neste relato e o trecho exato da migration é
  citado por linha.

## O que NÃO fiz e por quê
- Não alterei código, teste nem migration: o cartão pede só o relato e a lacuna já está fechada.
- Não conferi a contagem de vínculos fila↔conexão em produção (regra R1: agente não acessa produção);
  a guarda é inerte por construção enquanto `whatsapp_connection_queues` estiver vazia (`:9-11`).
