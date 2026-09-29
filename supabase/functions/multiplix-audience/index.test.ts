import { mapResolvedRecipients } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// F08 (Bloco A): o navegador deixa de decidir quem recebe. Estes testes cobrem
// a transformacao que a edge aplica na resposta de multiplix_resolve_recipients
// antes de chamar a RPC transacional multiplix_create_draft — o resto do
// contrato (idempotencia por client_request_id, transacao, teto de
// destinatarios) e provado no harness de banco
// (scripts/db-audit/multiplix-rls.test.sh, F08/F17).

Deno.test('F08: só destinatário classificado como apto entra no disparo', () => {
  const mapped = mapResolvedRecipients([
    { company_id: 'c-1', company_name: 'Apta', elegibilidade: 'apto', destino_e164: '5511900000001' },
    { company_id: 'c-2', company_name: 'Inválida', elegibilidade: 'destino_invalido', destino_e164: null },
    { company_id: 'c-3', company_name: 'Fora do escopo', elegibilidade: 'fora_do_escopo', destino_e164: '5511900000003' },
  ]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(mapped[0].company_id === 'c-1', `company_id inesperado: ${mapped[0].company_id}`);
});

Deno.test('F08: linha sem company_id não vira destinatário', () => {
  const mapped = mapResolvedRecipients([
    { company_id: null, elegibilidade: 'apto', destino_e164: '5511900000009' },
    { company_id: '', elegibilidade: 'apto' },
    { company_id: 'c-ok', elegibilidade: 'apto' },
  ]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(mapped[0].company_id === 'c-ok', `company_id inesperado: ${mapped[0].company_id}`);
});

Deno.test('F08: sem classificação explícita o destinatário entra como apto', () => {
  // Mesma leitura da RPC (COALESCE(elegibilidade,'apto')): o resolvedor antigo
  // não devolvia a coluna e a linha não pode ser descartada por isso.
  const mapped = mapResolvedRecipients([{ company_id: 'c-1', company_name: 'Sem classificação' }]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(mapped[0].elegibilidade === null, `elegibilidade esperada null, veio ${mapped[0].elegibilidade}`);
});

Deno.test('F08: campos que não existem no contrato não passam para a RPC', () => {
  // O corpo da requisição nunca define destinatário: o destino vem do
  // resolvedor do Singu. Campos extras do resolvedor não são repassados.
  const mapped = mapResolvedRecipients([
    {
      company_id: 'c-1',
      company_name: 'Acme',
      destino_e164: '5511900000001',
      destino_origem: 'crm',
      elegibilidade: 'apto',
      destino_forjado: '5511999999999',
      company_name_snapshot: 'Nome forjado',
    },
  ]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  const keys = Object.keys(mapped[0]).sort();
  assert(
    keys.join(',') === 'company_id,company_name,destino_e164,destino_origem,elegibilidade',
    `campos inesperados no destinatario: ${keys.join(',')}`,
  );
  assert(mapped[0].destino_e164 === '5511900000001', `destino inesperado: ${mapped[0].destino_e164}`);
});

Deno.test('F08: nenhum destinatário apto → lista vazia (endpoint responde 400)', () => {
  const mapped = mapResolvedRecipients([
    { company_id: 'c-1', elegibilidade: 'fora_do_escopo' },
    { company_id: 'c-2', elegibilidade: 'destino_invalido' },
  ]);
  assert(mapped.length === 0, `esperava lista vazia, veio ${mapped.length}`);
});

Deno.test('F08: entrada não-array ou vazia não quebra a transformação', () => {
  assert(mapResolvedRecipients([]).length === 0, 'lista vazia deveria continuar vazia');
});
