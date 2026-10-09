/**
 * IA-010 / cartão SL-059 — provisionamento do ambiente de ensaio.
 *
 * Gera, de forma determinística, o DML do ambiente de ensaio da IA-010
 * (`docs/ia/IA-010-ambiente-de-ensaio.md` §2): 6 departamentos com 1 fila e 6
 * contatos cada, 3 conversas de texto por departamento + 1 conversa longa
 * (> 200 mensagens, para exercitar a IA-063) e os casos de borda. Todo registro
 * nasce com o marcador `ENSAIO-` (nomes) ou no domínio de teste `ensaio.invalid`
 * (e-mails), com telefone fora de qualquer faixa real.
 *
 * O DML NÃO provisiona identidade: nenhum perfil, usuário ou papel é criado.
 * Os 4 perfis da §2 seguem apenas especificados (3 com papel no enum
 * `public.app_role`, o 4º pendente do SL-058), porque `profiles.user_id` e
 * `user_roles.user_id` são FK NOT NULL para `auth.users` e o login exige
 * `auth.identities` — criar identidade de ensaio obrigaria a escrever no schema
 * `auth`, fora do escopo e do permitido neste cartão. Pelo mesmo motivo a
 * reversão (`--remover`) não toca em `auth.users`, `auth.identities`,
 * `profiles` nem `user_roles`: ela apaga exatamente as tabelas que o
 * provisionamento escreve (departments, queues, contacts, messages).
 *
 * Este arquivo NÃO fala com banco nenhum: ele só IMPRIME DML. Quem aplica é o
 * banco LOCAL da cópia de trabalho, e só ele:
 *
 *   bun scripts/ia/ensaio-provisionamento.mjs                # plano (padrão; nada escreve)
 *   bun scripts/ia/ensaio-provisionamento.mjs --sql          # DML aditivo e idempotente
 *   bun scripts/ia/ensaio-provisionamento.mjs --remover      # DML de reversão, por prefixo
 *   bun scripts/ia/ensaio-provisionamento.mjs --sql \
 *     | zapp-db-local psql <cópia-de-trabalho> [nome]        # única aplicação autorizada a um agente
 *
 * Por que assim: a IA-010 §3.1 recomenda o seed versionado, mas escrevê-lo no
 * banco canônico é escrita em PRODUÇÃO e depende de autorização explícita do
 * Joaquim. Tirar o acesso a banco do gerador tira a possibilidade do acidente —
 * o mesmo artefato serve ao banco local (onde os ensaios rodam, regra R1) e ao
 * canônico, quando e se autorizado. Aplicar no local nunca toca produção:
 * `zapp-db-local` é, por construção, o Supabase da própria cópia.
 *
 * Três travas de honestidade embutidas:
 *   - nenhum perfil/usuário/papel é provisionado (identidade exige `auth`);
 *   - o 4º perfil ("somente leitura") fica declarado como PENDENTE, porque o
 *     enum `public.app_role` só tem `admin`, `supervisor` e `agent` (cartão
 *     SL-058) — nenhum papel novo é inventado aqui;
 *   - o caso de borda "outro contato com o mesmo telefone" (IA-098) fica
 *     declarado como BLOQUEADO, porque `contacts_phone_key` é único no schema
 *     canônico: dois contatos com o mesmo telefone não são graváveis hoje.
 */

/** Marcador obrigatório dos dados de ensaio (IA-010 §2). */
export const PREFIXO_ENSAIO = 'ENSAIO-';
/** Domínio de teste reservado (RFC 2606) — nunca resolve, nunca é de cliente. */
export const DOMINIO_ENSAIO = 'ensaio.invalid';
/** Prefixo de telefone fora de qualquer faixa real (DDD 00 não existe no Brasil). */
export const PREFIXO_TELEFONE_ENSAIO = '+5500';
/** Conversa longa da IA-063: mínimo de mensagens por departamento. */
export const MINIMO_CONVERSA_LONGA = 200;
/** Mensagens da conversa longa provisionada por departamento. */
export const MENSAGENS_CONVERSA_LONGA = 216;

/** Paleta já existente no sistema (src/components/queues/CreateQueueDialog.tsx). */
export const PALETA_FILAS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
];

/** Departamentos do ensaio (IA-010 §2). */
export const DEPARTAMENTOS_ENSAIO = ['Vendas', 'Compras', 'Logística', 'Financeiro', 'SAC', 'RH'];

/** Contatos por departamento (IA-010 §2). */
export const CONTATOS_POR_DEPARTAMENTO = 6;

/**
 * Os 4 perfis de ensaio. O 4º não tem papel no modelo atual: o enum
 * `public.app_role` (supabase/migrations/20251215025014_*.sql) tem só
 * `admin`, `supervisor` e `agent`.
 */
export const PERFIS_ENSAIO = [
  { chave: 'admin', papel: 'admin', nome: 'ENSAIO-Admin', email: 'ensaio.admin@ensaio.invalid' },
  {
    chave: 'supervisor',
    papel: 'supervisor',
    nome: 'ENSAIO-Supervisor',
    email: 'ensaio.supervisor@ensaio.invalid',
  },
  { chave: 'agent', papel: 'agent', nome: 'ENSAIO-Agent', email: 'ensaio.agent@ensaio.invalid' },
  {
    chave: 'somente-leitura',
    papel: null,
    nome: 'ENSAIO-Somente-Leitura',
    email: 'ensaio.somente-leitura@ensaio.invalid',
    pendencia:
      'public.app_role tem só admin/supervisor/agent — o 4º perfil depende da decisão + migration do cartão SL-058',
  },
];

/** Colunas que este gerador escreve, por tabela (conferidas contra o retrato canônico). */
export const COLUNAS_USADAS = {
  departments: ['id', 'name', 'is_active'],
  queues: ['id', 'name', 'description', 'color', 'is_active', 'priority'],
  contacts: [
    'id',
    'name',
    'phone',
    'email',
    'conversation_status',
    'queue_id',
    'consent_status',
    'notes',
  ],
  messages: [
    'id',
    'contact_id',
    'sender',
    'content',
    'message_type',
    'transcription',
    'is_read',
  ],
};

/** UUID determinístico do ensaio (formato v4; prefixo próprio, jamais colide com dado real). */
export function uuidEnsaio(sequencia) {
  if (!Number.isInteger(sequencia) || sequencia < 0 || sequencia > 0xffffffffffff) {
    throw new Error(`uuidEnsaio: sequência fora da faixa (${sequencia})`);
  }
  return `e0510000-0000-4000-8000-${sequencia.toString(16).padStart(12, '0')}`;
}

/** Telefone de ensaio: fora de qualquer faixa real do cliente. */
export function telefoneEnsaio(sequencia) {
  if (!Number.isInteger(sequencia) || sequencia < 0) {
    throw new Error(`telefoneEnsaio: sequência inválida (${sequencia})`);
  }
  return `${PREFIXO_TELEFONE_ENSAIO}${String(sequencia).padStart(9, '0')}`;
}

function semAcento(valor) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
}

function slug(valor) {
  return semAcento(valor).toLowerCase().replace(/[^a-z0-9]+/gu, '-');
}

/**
 * Plano completo do ensaio: dados determinísticos, contagens e o estado honesto
 * de cada caso de borda. Nada aqui depende de banco, relógio ou aleatoriedade.
 */
export function planoDeEnsaio() {
  let sequencia = 1;
  const departamentos = [];
  const casosDeBorda = [];

  DEPARTAMENTOS_ENSAIO.forEach((nomeDepartamento, indice) => {
    const nomeSlug = slug(nomeDepartamento);

    const fila = {
      id: uuidEnsaio(sequencia++),
      nome: `${PREFIXO_ENSAIO}${nomeDepartamento}-Fila`,
      descricao: `Fila sintética de ensaio do departamento ${nomeDepartamento} (IA-010)`,
      cor: PALETA_FILAS[indice % PALETA_FILAS.length],
      prioridade: indice + 1,
    };

    const contatos = [];
    for (let i = 1; i <= CONTATOS_POR_DEPARTAMENTO; i++) {
      const numero = String(i).padStart(2, '0');
      const mensagens = [];
      if (i <= 3) {
        for (let m = 1; m <= 3; m++) {
          mensagens.push({
            sender: m % 2 === 1 ? 'contact' : 'agent',
            content: `${PREFIXO_ENSAIO}${nomeDepartamento} conversa ${numero} mensagem ${m}`,
            message_type: 'text',
            transcription: null,
          });
        }
      } else if (i === 4) {
        mensagens.push({
          sender: 'contact',
          content: `${PREFIXO_ENSAIO}${nomeDepartamento} conversa sem análise`,
          message_type: 'text',
          transcription: null,
        });
        mensagens.push({
          sender: 'contact',
          content: `${PREFIXO_ENSAIO}${nomeDepartamento} áudio com autorização negada`,
          message_type: 'audio',
          transcription: null,
        });
      } else if (i === 5) {
        mensagens.push({
          sender: 'contact',
          content: `${PREFIXO_ENSAIO}${nomeDepartamento} contato sem memória`,
          message_type: 'text',
          transcription: null,
        });
      } else {
        mensagens.push({
          sender: 'contact',
          content: `${PREFIXO_ENSAIO}${nomeDepartamento} áudio sem transcrição`,
          message_type: 'audio',
          transcription: null,
        });
        for (let m = 1; m <= MENSAGENS_CONVERSA_LONGA; m++) {
          mensagens.push({
            sender: m % 2 === 1 ? 'contact' : 'agent',
            content: `${PREFIXO_ENSAIO}${nomeDepartamento} conversa longa ${m}`,
            message_type: 'text',
            transcription: null,
          });
        }
      }

      contatos.push({
        id: uuidEnsaio(sequencia++),
        nome: `${PREFIXO_ENSAIO}${nomeDepartamento}-C${numero}`,
        telefone: telefoneEnsaio(sequencia),
        email: `ensaio.${nomeSlug}-c${numero}@${DOMINIO_ENSAIO}`,
        casos: i === 4 ? ['conversa-sem-analise', 'audio-autorizacao-negada'] : i === 5 ? ['contato-sem-memoria'] : i === 6 ? ['audio-sem-transcricao'] : [],
        consent_status: i === 4 ? 'opt_out' : 'unknown',
        mensagens,
        conversaLonga: i === 6,
      });
      sequencia++;
    }

    departamentos.push({ nome: nomeDepartamento, nomeSlug, fila, contatos });
  });

  casosDeBorda.push(
    {
      chave: 'conversa-sem-analise',
      situacao: 'provisionado',
      descricao:
        'conversa sem linha em conversation_analyses — garantida por omissão: o gerador nunca cria análise para ela',
    },
    {
      chave: 'contato-sem-memoria',
      situacao: 'provisionado',
      descricao:
        'contato sem linha em conversation_memory — garantido por omissão: o gerador nunca cria memória para ele',
    },
    {
      chave: 'audio-sem-transcricao',
      situacao: 'provisionado',
      descricao:
        'mensagem de message_type=audio com transcription nula (o par é escrito com transcription = null)',
    },
    {
      chave: 'audio-autorizacao-negada',
      situacao: 'provisionado',
      descricao: "contato com consent_status = 'opt_out' e áudio na conversa",
    },
    {
      chave: 'mesmo-telefone',
      situacao: 'bloqueado',
      descricao:
        'outro contato com o MESMO telefone (IA-098) não é gravável: o schema canônico tem o índice único contacts_phone_key em contacts.phone',
      evidencia: 'supabase/schema-manifest.json → indexes.contacts.contacts_phone_key',
    },
  );

  const tot = {
    departamentos: departamentos.length,
    filas: departamentos.length,
    contatos: departamentos.reduce((soma, d) => soma + d.contatos.length, 0),
    conversasDeTexto: departamentos.length * 3,
    conversasLongas: departamentos.length,
    mensagens: departamentos.reduce(
      (soma, d) => soma + d.contatos.reduce((sub, c) => sub + c.mensagens.length, 0),
      0,
    ),
    perfis: PERFIS_ENSAIO.length,
    perfisProvisionaveis: PERFIS_ENSAIO.filter((p) => p.papel !== null).length,
  };

  return {
    prefixo: PREFIXO_ENSAIO,
    dominio: DOMINIO_ENSAIO,
    perfis: PERFIS_ENSAIO,
    departamentos,
    casosDeBorda,
    tot,
  };
}

function literais(valores) {
  return valores.map((valor) => {
    if (valor === null) return 'null';
    if (valor === true || valor === false) return String(valor);
    if (typeof valor === 'number') return String(valor);
    return `'${String(valor).replace(/'/gu, "''")}'`;
  });
}

/** Cabeçalho comum aos dois DML (provisionamento e remoção). */
export function cabecalhoSql(plano, rotulo) {
  return [
    `-- IA-010 / SL-059 — ${rotulo} do ambiente de ensaio`,
    `-- Fonte: docs/ia/IA-010-ambiente-de-ensaio.md §2`,
    `-- Marcadores: nomes com "${plano.prefixo}", e-mails em @${plano.dominio},`,
    `--             telefones em ${PREFIXO_TELEFONE_ENSAIO}***** (fora de faixa real).`,
    '-- Proibido: destinatário real, banco-fonte/CRM externo, contato de produção como fixture.',
    '-- Aplicar SÓ no banco local da cópia: zapp-db-local psql <cópia> [nome].',
  ];
}

/** DML aditivo e idempotente do ensaio (departamentos, filas, contatos e mensagens). */
export function sqlDeProvisionamento(plano = planoDeEnsaio()) {
  const linhas = [...cabecalhoSql(plano, 'provisionamento'), 'begin;'];

  const departamentos = plano.departamentos.map((d) => [
    uuidEnsaio(1000 + DEPARTAMENTOS_ENSAIO.indexOf(d.nome)),
    `${plano.prefixo}${d.nome}`,
    true,
  ]);

  linhas.push(
    `insert into public.departments (id, name, is_active) values`,
    departamentos.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do update set name = excluded.name, is_active = true;',
  );

  const filas = plano.departamentos.map((d) => [
    d.fila.id,
    d.fila.nome,
    d.fila.descricao,
    d.fila.cor,
    true,
    d.fila.prioridade,
  ]);
  linhas.push(
    '',
    `insert into public.queues (id, name, description, color, is_active, priority) values`,
    filas.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do update set name = excluded.name, description = excluded.description,',
    '  color = excluded.color, is_active = true, priority = excluded.priority;',
  );

  const contatos = [];
  plano.departamentos.forEach((d) => {
    d.contatos.forEach((c) => {
      contatos.push([c.id, c.nome, c.telefone, c.email, 'open', d.fila.id, c.consent_status, `${plano.prefixo}contato de ensaio`]);
    });
  });
  linhas.push(
    '',
    `insert into public.contacts (id, name, phone, email, conversation_status, queue_id, consent_status, notes) values`,
    contatos.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do update set name = excluded.name, phone = excluded.phone,',
    '  email = excluded.email, conversation_status = excluded.conversation_status,',
    '  queue_id = excluded.queue_id, consent_status = excluded.consent_status,',
    '  notes = excluded.notes;',
  );

  // Cada mensagem recebe id determinístico: base própria por conversa.
  let base = 0x1000000;
  const mensagens = [];
  plano.departamentos.forEach((d) => {
    d.contatos.forEach((c) => {
      c.mensagens.forEach((m) => {
        mensagens.push([
          uuidEnsaio(base++),
          c.id,
          m.sender,
          m.content,
          m.message_type,
          m.transcription,
          false,
        ]);
      });
    });
  });
  linhas.push(
    '',
    `insert into public.messages (id, contact_id, sender, content, message_type, transcription, is_read) values`,
    mensagens.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do update set contact_id = excluded.contact_id, sender = excluded.sender,',
    '  content = excluded.content, message_type = excluded.message_type,',
    '  transcription = excluded.transcription;',
    '',
    'commit;',
  );

  return linhas.join('\n') + '\n';
}

/** DML de reversão: tudo por prefixo/marcador, nada por id solto. */
export function sqlDeRemocao(plano = planoDeEnsaio()) {
  const rotulo = `${plano.prefixo}`;
  return (
    [
      ...cabecalhoSql(plano, 'reversão'),
      'begin;',
      '',
      `-- mensagens dos contatos de ensaio`,
      `delete from public.messages`,
      ` where contact_id in (select id from public.contacts where name like '${rotulo}%');`,
      '',
      `-- contatos de ensaio`,
      `delete from public.contacts where name like '${rotulo}%';`,
      '',
      `-- filas de ensaio`,
      `delete from public.queues where name like '${rotulo}%';`,
      '',
      `-- departamentos de ensaio`,
      `delete from public.departments where name like '${rotulo}%';`,
      '',
      '-- Sem deletes em auth.users, auth.identities, public.profiles ou',
      '-- public.user_roles: o provisionamento não cria identidade nenhuma, e',
      '-- criá-la exigiria escrever no schema auth — fora do escopo (IA-010 §6).',
      '',
      'commit;',
    ].join('\n') + '\n'
  );
}

/**
 * Trava de alvo: recusa qualquer URL de banco que não seja a cópia local.
 * Vazio/ausente não é alvo (o gerador não conecta em ninguém); é só o caso em
 * que não há nada a conferir.
 */
export function conferirAlvoLocal(url) {
  if (url === undefined || url === null || url === '') return null;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`ensaio: DB_URL não é uma URL válida (${url}). Proibido seguir sem saber o alvo.`);
  }
  const locais = ['127.0.0.1', 'localhost', '::1', '[::1]'];
  if (!locais.includes(host)) {
    throw new Error(
      `ensaio: DB_URL aponta para host não-local (${host}). Este provisionamento é LOCAL (regra R1): use zapp-db-local env.`,
    );
  }
  return host;
}

function resumoDoPlano(plano) {
  const linhas = [
    `IA-010 / SL-059 — plano do ambiente de ensaio`,
    `  prefixo .............. ${plano.prefixo}`,
    `  domínio de e-mail .... @${plano.dominio}`,
    `  telefones ............ ${PREFIXO_TELEFONE_ENSAIO}***** (fora de faixa real)`,
    `  departamentos ........ ${plano.tot.departamentos} (${DEPARTAMENTOS_ENSAIO.join(', ')})`,
    `  filas ................ ${plano.tot.filas}`,
    `  contatos ............. ${plano.tot.contatos}`,
    `  conversas de texto ... ${plano.tot.conversasDeTexto}`,
    `  conversas longas ..... ${plano.tot.conversasLongas} (> ${MINIMO_CONVERSA_LONGA} mensagens cada)`,
    `  mensagens ............ ${plano.tot.mensagens}`,
    `  perfis (§2) .......... ${plano.tot.perfis} especificados — nenhum provisionado pelo DML`,
    `                         (${plano.tot.perfisProvisionaveis} com papel no enum app_role; identidade exige escrita em auth — fora do escopo)`,
  ];
  for (const p of plano.perfis) {
    linhas.push(
      `    - ${p.chave.padEnd(15)} ${p.papel ? `role=${p.papel}` : 'PENDENTE'}  ${p.pendencia ?? ''}`.trimEnd(),
    );
  }
  linhas.push('', '  casos de borda:');
  for (const c of plano.casosDeBorda) {
    linhas.push(`    - ${c.chave.padEnd(26)} ${c.situacao.toUpperCase().padEnd(12)} ${c.descricao}`);
  }
  return linhas.join('\n') + '\n';
}

const AJUDA = `uso: bun scripts/ia/ensaio-provisionamento.mjs [--plano|--sql|--remover|--ajuda]

  --plano    (padrão) resumo do ambiente de ensaio; nada é escrito
  --sql      imprime o DML aditivo e idempotente (aplicar só no banco LOCAL)
  --remover  imprime o DML de reversão, por prefixo ENSAIO-
  --ajuda    esta ajuda

Aplicar (banco local da cópia de trabalho, nunca produção):
  bun scripts/ia/ensaio-provisionamento.mjs --sql | zapp-db-local psql <cópia> [nome]
`;

function main(argv) {
  const flag = argv[2] ?? '--plano';
  const plano = planoDeEnsaio();

  if (flag === '--ajuda' || flag === '-h') {
    process.stdout.write(AJUDA);
    return 0;
  }
  if (flag === '--plano') {
    process.stdout.write(resumoDoPlano(plano));
    return 0;
  }
  if (flag === '--sql' || flag === '--remover') {
    const host = conferirAlvoLocal(process.env.DB_URL);
    if (host) process.stderr.write(`ensaio: alvo conferido (${host})\n`);
    else process.stderr.write('ensaio: DB_URL ausente — nada a conferir; a aplicação é por zapp-db-local (local)\n');
    process.stdout.write(flag === '--sql' ? sqlDeProvisionamento(plano) : sqlDeRemocao(plano));
    return 0;
  }
  process.stderr.write(`ensaio: flag desconhecida (${flag})\n${AJUDA}`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('ensaio-provisionamento.mjs')) {
  process.exitCode = main(process.argv);
}
