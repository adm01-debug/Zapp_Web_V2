/**
 * Semente LOCAL que reproduz as tarefas das imagens de referência do módulo de
 * Tarefas (etapa 004 do PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS).
 *
 *   bun scripts/tarefas/seed-local-imagens.ts              # cria/atualiza
 *   bun scripts/tarefas/seed-local-imagens.ts --remover    # apaga o que criou
 *
 * Exige no ambiente (saiam de `zapp-db-local env . <stack>`, NUNCA de produção):
 *   API_URL, DB_URL, SERVICE_ROLE_KEY
 *
 * O que garante, SÓ no banco LOCAL e para o usuário de teste da pré-visualização
 * (`created_by` = perfil dele):
 *   14 tarefas abertas  (3 caixa de entrada + 4 a fazer + 3 fazendo + 4 aguardando),
 *    2 delas atrasadas e 4 para hoje;
 *   5 tarefas concluídas nos últimos 7 dias — a MÉDIA de `completed_at`−`created_at`
 *   dá exatamente 1,4 dia (D13: tempo médio = da criação à conclusão);
 *   contatos com foto, sem foto e do tipo `cliente`.
 *
 * Idempotente: ids fixos + `on conflict`. Rodar duas vezes produz o mesmo estado.
 * Removível: `--remover` apaga só as linhas com o nosso prefixo de id.
 *
 * SEGURANÇA: recusa rodar se API_URL/DB_URL não apontarem para host local.
 */
// O tsconfig carrega só tipos do Node; o seed usa o cliente SQL transacional do
// Bun em runtime. A superfície usada fica declarada aqui (tipos mínimos).
type LinhasSql = Record<string, unknown>[];
interface SqlTx {
  (partes: TemplateStringsArray, ...valores: unknown[]): Promise<LinhasSql>;
}
interface SqlCliente extends SqlTx {
  begin<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}
// @ts-expect-error — 'bun' é módulo de runtime; não há pacote de tipos no projeto.
import { SQL } from 'bun';
const abrirSql = SQL as unknown as (url: string) => SqlCliente;

/** Prefixo de id do fixture — é o que o modo `--remover` apaga. */
const PREFIXO = '5eed1a00-0000-4000-8000-';
const id = (n: number | string): string =>
  PREFIXO + String(n).padStart(12, '0');

const REMOVER = process.argv.includes('--remover');

function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`seed tarefas-local: variável ${nome} ausente (rode via env de zapp-db-local)`);
  }
  return valor;
}

function exigirLocal(url: string, rotulo: string): void {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(
      `seed tarefas-local: ${rotulo} aponta para host não-local (${host}). Proibido — só banco local.`,
    );
  }
}

const API_URL = exigirEnv('API_URL').replace(/\/$/, '');
const DB_URL = exigirEnv('DB_URL');
const SERVICE_ROLE_KEY = exigirEnv('SERVICE_ROLE_KEY');
exigirLocal(API_URL, 'API_URL');
exigirLocal(DB_URL, 'DB_URL');

const USUARIO = {
  id: id(1),
  email: 'e2e.tarefas@example.com',
  senha: 'e2e-tarefas-local-sintetico-2610',
  nome: '[E2E] Tarefas Local',
};

/** Contatos: com foto, sem foto, e do tipo `cliente`. */
const CONTATOS = [
  { n: '0c1', nome: 'Ana Cliente Foto', telefone: '5511900000101', foto: true, tipo: 'cliente' },
  { n: '0c2', nome: 'Bruno Cliente Sem Foto', telefone: '5511900000102', foto: false, tipo: 'cliente' },
  { n: '0c3', nome: 'Carla Fornecedor Foto', telefone: '5511900000103', foto: true, tipo: 'fornecedor' },
  { n: '0c4', nome: 'Diego Colaborador Sem Foto', telefone: '5511900000104', foto: false, tipo: 'colaborador' },
] as const;

/** FOTO sintética (data URI pequeno — não é dado real nem sai da máquina). */
const FOTO =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMjAiIGZpbGw9IiNmOTczMTYiLz48dGV4dCB4PSIyMCIgeT0iMjUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IndoaXRlIj5FVDwvdGV4dD48L3N2Zz4=';

type Tarefa = {
  n: string;
  titulo: string;
  status: 'backlog' | 'todo' | 'doing' | 'waiting' | 'done';
  prioridade: 'low' | 'medium' | 'high' | 'urgent';
  /** Dias em relação a hoje (null = sem prazo). */
  prazo: number | null;
  /** true = prazo de dia inteiro (23:59); false = prazo com hora (09:00). */
  diaInteiro?: boolean;
  /** Dias que a tarefa está "fazendo" (started_at) ou concluída (completed_at). */
  iniciadaHa?: number;
  concluidaHa?: number;
  /** D13: dias de `created_at`→`completed_at` (média das concluídas = 1,4 dia). */
  cicloDias?: number;
  motivoEspera?: string;
  contato?: string;
};

// 14 abertas: 3 backlog + 4 todo + 3 doing + 4 waiting; 2 atrasadas; 4 para hoje.
const TAREFAS: Tarefa[] = [
  { n: '101', titulo: 'Cadastrar novo cliente no CRM', status: 'backlog', prioridade: 'medium', prazo: null, contato: '0c1' },
  { n: '102', titulo: 'Anotar ideia de campanha', status: 'backlog', prioridade: 'low', prazo: null },
  { n: '103', titulo: 'Revisar catálogo de outubro', status: 'backlog', prioridade: 'medium', prazo: 5, contato: '0c3' },
  { n: '104', titulo: 'Enviar proposta para Ana', status: 'todo', prioridade: 'high', prazo: 0, diaInteiro: true, contato: '0c1' },
  { n: '105', titulo: 'Ligar para Bruno', status: 'todo', prioridade: 'medium', prazo: 0, diaInteiro: true, contato: '0c2' },
  { n: '106', titulo: 'Preparar orçamento de brindes', status: 'todo', prioridade: 'urgent', prazo: 1, diaInteiro: true },
  { n: '107', titulo: 'Estudar novo fornecedor', status: 'todo', prioridade: 'low', prazo: null },
  { n: '108', titulo: 'Fechar pedido da Carla', status: 'doing', prioridade: 'urgent', prazo: 0, diaInteiro: true, iniciadaHa: 2, contato: '0c3' },
  { n: '109', titulo: 'Cobrar pagamento atrasado', status: 'doing', prioridade: 'high', prazo: -1, iniciadaHa: 3, contato: '0c1' },
  { n: '110', titulo: 'Montar apresentação comercial', status: 'doing', prioridade: 'medium', prazo: 3, iniciadaHa: 1 },
  { n: '111', titulo: 'Aguardar resposta do cliente', status: 'waiting', prioridade: 'high', prazo: 0, diaInteiro: true, motivoEspera: 'Aguardando retorno do cliente', contato: '0c2' },
  { n: '112', titulo: 'Aguardar nota fiscal do fornecedor', status: 'waiting', prioridade: 'medium', prazo: -2, motivoEspera: 'Fornecedor vai emitir a nota', contato: '0c3' },
  { n: '113', titulo: 'Aguardar aprovação da arte', status: 'waiting', prioridade: 'medium', prazo: 1, diaInteiro: true, motivoEspera: 'Cliente vai aprovar a arte' },
  { n: '114', titulo: 'Aguardar peças do estoque', status: 'waiting', prioridade: 'low', prazo: 6, motivoEspera: 'Estoque vai repor as peças', contato: '0c4' },
  // Concluídas nos últimos 7 dias: ciclos created→completed {1,0;1,2;1,4;1,6;1,8}
  // cuja MÉDIA é 1,4 dia (D13: da criação à conclusão). started_at fica no meio.
  { n: '115', titulo: 'Confirmar endereço de entrega', status: 'done', prioridade: 'medium', prazo: null, concluidaHa: 1, cicloDias: 1.0, contato: '0c1' },
  { n: '116', titulo: 'Responder e-mail do cliente', status: 'done', prioridade: 'low', prazo: null, concluidaHa: 2, cicloDias: 1.2, contato: '0c2' },
  { n: '117', titulo: 'Atualizar planilha de preços', status: 'done', prioridade: 'medium', prazo: null, concluidaHa: 3, cicloDias: 1.4 },
  { n: '118', titulo: 'Agendar reunião com equipe', status: 'done', prioridade: 'high', prazo: null, concluidaHa: 4, cicloDias: 1.6, contato: '0c4' },
  { n: '119', titulo: 'Arquivar conversa antiga', status: 'done', prioridade: 'low', prazo: null, concluidaHa: 5, cicloDias: 1.8 },
];

/** D13: média esperada de `completed_at` − `created_at` nas concluídas = 1,4 dia. */
const DIAS_CICLO = 1.4;

async function remover(db: SqlCliente): Promise<void> {
  await db.begin(async (tx) => {
    // Modo replica desliga os gatilhos de integridade referencial: no banco local
    // as tabelas da publicação de realtime (ex.: talkx_recipients) recusam DELETE
    // em cascata ("Column list used by the publication does not cover the replica
    // identity"). O produto é local e o fixture não cria dependentes — seguro.
    await tx`set local session_replication_role = replica`;
    await tx`delete from conversation_tasks where id::text like ${PREFIXO + '%'}`;
    await tx`delete from contacts where id::text like ${PREFIXO + '%'}`;
    await tx`delete from user_settings where user_id = ${USUARIO.id}`;
    await tx`delete from user_roles where user_id = ${USUARIO.id}`;
    await tx`delete from profiles where user_id = ${USUARIO.id} or id = ${id(10)}`;
    await tx`delete from auth.identities where user_id = ${USUARIO.id}`;
    await tx`delete from auth.users where id = ${USUARIO.id}`;
  });
  process.stdout.write(`[seed tarefas-local] removido (prefixo ${PREFIXO})\n`);
}

async function criar(db: SqlCliente): Promise<void> {
  await db.begin(async (tx) => {
    await tx`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', ${USUARIO.id}, 'authenticated', 'authenticated',
        ${USUARIO.email}, extensions.crypt(${USUARIO.senha}, extensions.gen_salt('bf')), now(),
        '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
      )
      on conflict (id) do update
        set email = excluded.email,
            encrypted_password = excluded.encrypted_password,
            email_confirmed_at = excluded.email_confirmed_at,
            updated_at = now()`;

    await tx`
      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
      ) values (
        ${id('0a1')}, ${USUARIO.id}, ${USUARIO.id}, 'email',
        ${{ sub: USUARIO.id, email: USUARIO.email, email_verified: true }},
        now(), now(), now()
      )
      on conflict (id) do update set identity_data = excluded.identity_data, updated_at = now()`;

    // O gatilho on_auth_user_created cria o profile; se não existir, cria com id fixo.
    let [profile] = await tx`select id from profiles where user_id = ${USUARIO.id}`;
    if (!profile) {
      [profile] = await tx`
        insert into profiles (id, user_id, name, email, role)
        values (${id(10)}, ${USUARIO.id}, ${USUARIO.nome}, ${USUARIO.email}, 'agent')
        returning id`;
    }
    const profileId = profile.id as string;

    await tx`
      update profiles set name = ${USUARIO.nome}, email = ${USUARIO.email}, role = 'agent', updated_at = now()
      where id = ${profileId}`;
    await tx`insert into user_roles (user_id, role) values (${USUARIO.id}, 'agent') on conflict do nothing`;
    await tx`insert into user_settings (user_id) values (${USUARIO.id}) on conflict (user_id) do nothing`;

    for (const c of CONTATOS) {
      await tx`
        insert into contacts (id, name, phone, avatar_url, contact_type, assigned_to)
        values (
          ${id(c.n)}, ${c.nome}, ${c.telefone}, ${c.foto ? FOTO : null}, ${c.tipo}, ${profileId}
        )
        on conflict (id) do update
          set name = excluded.name, phone = excluded.phone, avatar_url = excluded.avatar_url,
              contact_type = excluded.contact_type, assigned_to = excluded.assigned_to,
              updated_at = now()`;
    }

    for (let i = 0; i < TAREFAS.length; i++) {
      const t = TAREFAS[i];
      const position = i;
      const contatoId = t.contato ? id(t.contato) : null;
      const cicloDias = t.cicloDias ?? DIAS_CICLO;
      // created_at: nas concluídas, recua o ciclo (created→completed) da tarefa.
      const criadaAtras = t.status === 'done' ? (t.concluidaHa ?? 0) + cicloDias : 10 + i;
      const statusChangedSegs = (t.status === 'done' ? t.concluidaHa ?? 0 : criadaAtras) * 86400;
      const startedSegs =
        t.status === 'doing'
          ? (t.iniciadaHa ?? 0) * 86400
          : t.status === 'done'
            // started_at no meio do ciclo: created_at <= started_at <= completed_at.
            ? ((t.concluidaHa ?? 0) + cicloDias / 2) * 86400
            : 0;
      const completedSegs = (t.concluidaHa ?? 0) * 86400;
      const temPrazo = t.prazo !== null;
      // Prazo: dia inteiro = às 23:59; com hora = às 09:00 do dia relativo.
      const prazoSegs = temPrazo ? (t.prazo as number) * 86400 + (t.diaInteiro ? 86340 : 32400) : 0;

      await tx`
        insert into conversation_tasks (
          id, contact_id, title, description, created_by, assigned_to, due_date, priority,
          status, waiting_reason, position, remind_at, started_at, completed_at,
          status_changed_at, created_at, updated_at
        ) values (
          ${id(t.n)}, ${contatoId}, ${t.titulo}, ${'Tarefa sintética da linha de base visual (etapa 004).'},
          ${profileId}, ${profileId},
          case when ${temPrazo}
            then date_trunc('day', now()) + make_interval(secs => ${prazoSegs})
            else null end,
          ${t.prioridade},
          ${t.status}, ${t.motivoEspera ?? null}, ${position}, null,
          case when ${t.status === 'doing' || t.status === 'done'}
            then now() - make_interval(secs => ${startedSegs})
            else null end,
          case when ${t.status === 'done'}
            then now() - make_interval(secs => ${completedSegs})
            else null end,
          now() - make_interval(secs => ${statusChangedSegs}),
          now() - make_interval(secs => ${criadaAtras * 86400}),
          now()
        )
        on conflict (id) do update
          set contact_id = excluded.contact_id, title = excluded.title,
              due_date = excluded.due_date, priority = excluded.priority,
              status = excluded.status, waiting_reason = excluded.waiting_reason,
              position = excluded.position, started_at = excluded.started_at,
              completed_at = excluded.completed_at, status_changed_at = excluded.status_changed_at,
              created_at = excluded.created_at, updated_at = now()`;
    }
  });
}

async function conferir(db: SqlCliente): Promise<void> {
  const [c] = await db`
    select
      count(*) filter (where status in ('backlog','todo','doing','waiting'))::int as abertas,
      count(*) filter (where status = 'backlog')::int as backlog,
      count(*) filter (where status = 'todo')::int as todo,
      count(*) filter (where status = 'doing')::int as doing,
      count(*) filter (where status = 'waiting')::int as waiting,
      count(*) filter (where status = 'done')::int as concluidas,
      count(*) filter (
        where status not in ('done','cancelled') and due_date is not null
          and due_date < date_trunc('day', now())
      )::int as atrasadas,
      count(*) filter (
        where status not in ('done','cancelled') and due_date is not null
          and due_date >= date_trunc('day', now())
          and due_date < date_trunc('day', now()) + interval '1 day'
      )::int as hoje
    from conversation_tasks where id::text like ${PREFIXO + '%'}`;

  const esperado = { abertas: 14, backlog: 3, todo: 4, doing: 3, waiting: 4, concluidas: 5, atrasadas: 2, hoje: 4 };
  for (const [k, v] of Object.entries(esperado)) {
    if (c[k] !== v) {
      throw new Error(`seed tarefas-local: esperado ${k}=${v}, encontrado ${c[k]}`);
    }
  }

  // D13: tempo médio = da CRIAÇÃO à conclusão, nas concluídas dos últimos 7 dias.
  const [ciclo] = await db`
    select avg(extract(epoch from (completed_at - created_at)) / 86400)::float as dias
    from conversation_tasks
    where id::text like ${PREFIXO + '%'} and status = 'done'
      and created_at is not null and completed_at is not null
      and completed_at >= now() - interval '7 days'`;
  const dias = Math.round((ciclo.dias as number) * 10) / 10;
  if (dias !== DIAS_CICLO) {
    throw new Error(`seed tarefas-local: tempo médio esperado ${DIAS_CICLO} dia, encontrado ${dias}`);
  }

  const [contatos] = await db`
    select count(*)::int as total,
           count(*) filter (where avatar_url is not null)::int as com_foto,
           count(*) filter (where avatar_url is null)::int as sem_foto,
           count(*) filter (where contact_type = 'cliente')::int as clientes
    from contacts where id::text like ${PREFIXO + '%'}`;

  process.stdout.write(
    [
      '[seed tarefas-local] ok:',
      `  usuário ${USUARIO.email} (id ${USUARIO.id})`,
      `  tarefas: ${c.abertas} abertas (${c.backlog} entrada + ${c.todo} a fazer + ${c.doing} fazendo + ${c.waiting} aguardando), ` +
        `${c.concluidas} concluídas, ${c.atrasadas} atrasadas, ${c.hoje} para hoje`,
      `  tempo médio (created_at→completed_at) = ${dias} dia`,
      `  contatos: ${contatos.total} (${contatos.com_foto} com foto, ${contatos.sem_foto} sem foto, ${contatos.clientes} cliente)`,
      '',
    ].join('\n'),
  );
}

await (async () => {
  const db = abrirSql(DB_URL);
  try {
    if (REMOVER) await remover(db);
    else {
      await criar(db);
      await conferir(db);
    }
  } finally {
    await db.end();
  }
})();
