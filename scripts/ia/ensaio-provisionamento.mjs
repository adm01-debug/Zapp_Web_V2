import { isDeepStrictEqual } from 'node:util';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
 *   bun scripts/ia/ensaio-provisionamento.mjs --remover      # reversão por IDs + marcadores
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

function congelarProfundo(valor) {
  if (valor === null || typeof valor !== 'object' || Object.isFrozen(valor)) return valor;
  for (const filho of Object.values(valor)) congelarProfundo(filho);
  return Object.freeze(valor);
}

/** Paleta já existente no sistema (src/components/queues/queueColors.ts). */
export const PALETA_FILAS = Object.freeze([
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--violeta))',
  'hsl(var(--dash-red))',
  'hsl(var(--info))',
  'hsl(var(--dash-green))',
]);

/** Departamentos do ensaio (IA-010 §2). */
export const DEPARTAMENTOS_ENSAIO = Object.freeze([
  'Vendas',
  'Compras',
  'Logística',
  'Financeiro',
  'SAC',
  'RH',
]);

/** Contatos por departamento (IA-010 §2). */
export const CONTATOS_POR_DEPARTAMENTO = 6;

/**
 * Os 4 perfis de ensaio. O 4º não tem papel no modelo atual: o enum
 * `public.app_role` (supabase/migrations/20251215025014_*.sql) tem só
 * `admin`, `supervisor` e `agent`.
 */
export const PERFIS_ENSAIO = congelarProfundo([
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
]);

/** Colunas que este gerador escreve, por tabela (conferidas contra o retrato canônico). */
export const COLUNAS_USADAS = congelarProfundo({
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
});

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
          content: `${PREFIXO_ENSAIO}${nomeDepartamento} áudio d'ensaio sem transcrição`,
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

  return congelarProfundo({
    prefixo: PREFIXO_ENSAIO,
    dominio: DOMINIO_ENSAIO,
    perfis: PERFIS_ENSAIO,
    departamentos,
    casosDeBorda,
    tot,
  });
}

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(`ensaio: plano canônico inválido (${mensagem})`);
}

/**
 * Invariantes independentes do gerador. Elas impedem que uma regressão em
 * `planoDeEnsaio` passe despercebida só porque o plano recebido e a nova saída
 * defeituosa continuam iguais entre si.
 */
export function validarInvariantesPlano(plano) {
  exigir(plano?.prefixo === PREFIXO_ENSAIO, 'prefixo');
  exigir(plano?.dominio === DOMINIO_ENSAIO, 'domínio');
  exigir(Array.isArray(plano.departamentos), 'departamentos ausentes');
  exigir(plano.departamentos.length === DEPARTAMENTOS_ENSAIO.length, 'quantidade de departamentos');

  const ids = [];
  let mensagens = 0;
  plano.departamentos.forEach((departamento, indiceDepartamento) => {
    const nome = DEPARTAMENTOS_ENSAIO[indiceDepartamento];
    const nomeSlug = slug(nome);
    exigir(departamento.nome === nome && departamento.nomeSlug === nomeSlug, `departamento ${indiceDepartamento}`);
    exigir(departamento.fila?.nome === `${PREFIXO_ENSAIO}${nome}-Fila`, `nome da fila ${nome}`);
    exigir(
      departamento.fila?.descricao === `Fila sintética de ensaio do departamento ${nome} (IA-010)`,
      `descrição da fila ${nome}`,
    );
    exigir(PALETA_FILAS.includes(departamento.fila?.cor), `cor da fila ${nome}`);
    exigir(departamento.fila?.prioridade === indiceDepartamento + 1, `prioridade da fila ${nome}`);
    ids.push(departamento.fila.id);

    exigir(departamento.contatos?.length === CONTATOS_POR_DEPARTAMENTO, `contatos de ${nome}`);
    departamento.contatos.forEach((contato, indiceContato) => {
      const numero = String(indiceContato + 1).padStart(2, '0');
      exigir(contato.nome === `${PREFIXO_ENSAIO}${nome}-C${numero}`, `nome do contato ${nome}/${numero}`);
      exigir(/^\+5500\d{9}$/u.test(contato.telefone), `telefone do contato ${nome}/${numero}`);
      exigir(
        contato.email === `ensaio.${nomeSlug}-c${numero}@${DOMINIO_ENSAIO}`,
        `e-mail do contato ${nome}/${numero}`,
      );
      exigir(['unknown', 'opt_out'].includes(contato.consent_status), `consentimento ${nome}/${numero}`);
      ids.push(contato.id);

      exigir(Array.isArray(contato.mensagens), `mensagens de ${nome}/${numero}`);
      contato.mensagens.forEach((mensagem, indiceMensagem) => {
        exigir(['contact', 'agent'].includes(mensagem.sender), `sender ${nome}/${numero}/${indiceMensagem}`);
        exigir(['text', 'audio'].includes(mensagem.message_type), `tipo ${nome}/${numero}/${indiceMensagem}`);
        exigir(mensagem.transcription === null, `transcrição ${nome}/${numero}/${indiceMensagem}`);
        exigir(
          typeof mensagem.content === 'string' && mensagem.content.startsWith(`${PREFIXO_ENSAIO}${nome} `),
          `conteúdo ${nome}/${numero}/${indiceMensagem}`,
        );
      });
      mensagens += contato.mensagens.length;
    });
  });

  exigir(ids.every((id) => /^e0510000-0000-4000-8000-[0-9a-f]{12}$/u.test(id)), 'formato de UUID');
  exigir(new Set(ids).size === ids.length, 'UUIDs repetidos');
  exigir(mensagens === 1374, 'quantidade de mensagens');
  exigir(
    plano.tot?.departamentos === 6 &&
      plano.tot?.filas === 6 &&
      plano.tot?.contatos === 36 &&
      plano.tot?.conversasDeTexto === 18 &&
      plano.tot?.conversasLongas === 6 &&
      plano.tot?.mensagens === 1374 &&
      plano.tot?.perfis === 4 &&
      plano.tot?.perfisProvisionaveis === 3,
    'totais',
  );
  return plano;
}

function literais(valores) {
  return valores.map((valor) => {
    if (valor === null) return 'null';
    if (valor === true || valor === false) return String(valor);
    if (typeof valor === 'number') return String(valor);
    return `'${String(valor).replace(/'/gu, "''")}'`;
  });
}

/** Recusa planos alterados que poderiam misturar dados reais ao DML ou ampliar a reversão. */
export function validarPlanoSeguro(plano) {
  const canonico = planoDeEnsaio();
  validarInvariantesPlano(canonico);
  if (!isDeepStrictEqual(plano, canonico)) {
    throw new Error('ensaio: plano diverge do contrato canônico determinístico');
  }
  return canonico;
}

const LOCK_ENSAIO = 'select pg_advisory_xact_lock(1162756947, 1229402160);';

function idsSql(registros) {
  return registros.map(({ id }) => literais([id])[0]).join(', ');
}

function idsUuidSql(registros) {
  return registros.map(({ id }) => `${literais([id])[0]}::uuid`).join(', ');
}

function marcadoresDoPlano(plano) {
  let mensagem = 0x1000000;
  return {
    departamentos: plano.departamentos.map((departamento, indice) => ({
      id: uuidEnsaio(1000 + indice),
      nome: `${plano.prefixo}${departamento.nome}`,
      is_active: true,
    })),
    filas: plano.departamentos.map(({ fila }) => ({
      id: fila.id,
      nome: fila.nome,
      descricao: fila.descricao,
      cor: fila.cor,
      is_active: true,
      prioridade: fila.prioridade,
    })),
    contatos: plano.departamentos.flatMap((departamento) =>
      departamento.contatos.map((contato) => ({
        id: contato.id,
        nome: contato.nome,
        telefone: contato.telefone,
        email: contato.email,
        conversation_status: 'open',
        queue_id: departamento.fila.id,
        consent_status: contato.consent_status,
        notes: `${plano.prefixo}contato de ensaio`,
      })),
    ),
    mensagens: plano.departamentos.flatMap((departamento) =>
      departamento.contatos.flatMap((contato) =>
        contato.mensagens.map((item) => ({
          id: uuidEnsaio(mensagem++),
          contact_id: contato.id,
          sender: item.sender,
          content: item.content,
          message_type: item.message_type,
          transcription: item.transcription,
          is_read: false,
        })),
      ),
    ),
  };
}

function preflightColisoes({ departamentos, filas, contatos, mensagens }) {
  const valores = (registros, campos) =>
    registros.map((registro) => `      (${literais(campos.map((campo) => registro[campo])).join(', ')})`).join(',\n');
  return [
    'do $ensaio$',
    'begin',
    `  perform 1 from public.departments where id in (${idsUuidSql(departamentos)}) for update;`,
    `  perform 1 from public.queues where id in (${idsUuidSql(filas)}) for update;`,
    `  perform 1 from public.contacts where id in (${idsUuidSql(contatos)}) for update;`,
    `  perform 1 from public.messages where id in (${idsUuidSql(mensagens)}) for update;`,
    '  if exists (',
    '    select 1 from public.departments atual',
    `    join (values\n${valores(departamentos, ['id', 'nome', 'is_active'])}`,
    '    ) as esperado(id, nome, is_active) on atual.id = esperado.id::uuid',
    `    where atual.id in (${idsUuidSql(departamentos)})`,
    '      and (atual.name is distinct from esperado.nome',
    '        or atual.is_active is distinct from esperado.is_active)',
    "  ) then raise exception 'ensaio: colisão de ID reservado em departments' using errcode = '23505'; end if;",
    '  if exists (',
    '    select 1 from public.queues atual',
    `    join (values\n${valores(filas, ['id', 'nome', 'descricao', 'cor', 'is_active', 'prioridade'])}`,
    '    ) as esperado(id, nome, descricao, cor, is_active, prioridade) on atual.id = esperado.id::uuid',
    `    where atual.id in (${idsUuidSql(filas)})`,
    '      and (atual.name is distinct from esperado.nome',
    '        or atual.description is distinct from esperado.descricao',
    '        or atual.color is distinct from esperado.cor',
    '        or atual.is_active is distinct from esperado.is_active',
    '        or atual.priority is distinct from esperado.prioridade)',
    "  ) then raise exception 'ensaio: colisão de ID reservado em queues' using errcode = '23505'; end if;",
    '  if exists (',
    '    select 1 from public.contacts atual',
    `    join (values\n${valores(contatos, ['id', 'nome', 'telefone', 'email', 'conversation_status', 'queue_id', 'consent_status', 'notes'])}`,
    '    ) as esperado(id, nome, telefone, email, conversation_status, queue_id, consent_status, notes)',
    '      on atual.id = esperado.id::uuid',
    `    where atual.id in (${idsUuidSql(contatos)})`,
    '      and (atual.name is distinct from esperado.nome',
    '        or atual.phone is distinct from esperado.telefone',
    '        or atual.email is distinct from esperado.email',
    '        or atual.conversation_status::text is distinct from esperado.conversation_status',
    '        or atual.queue_id is distinct from esperado.queue_id::uuid',
    '        or atual.consent_status::text is distinct from esperado.consent_status',
    '        or atual.notes is distinct from esperado.notes)',
    "  ) then raise exception 'ensaio: colisão de ID reservado em contacts' using errcode = '23505'; end if;",
    '  if exists (',
    '    select 1 from public.messages atual',
    `    join (values\n${valores(mensagens, ['id', 'contact_id', 'sender', 'content', 'message_type', 'transcription', 'is_read'])}`,
    '    ) as esperado(id, contact_id, sender, content, message_type, transcription, is_read)',
    '      on atual.id = esperado.id::uuid',
    `    where atual.id in (${idsUuidSql(mensagens)})`,
    '      and (atual.contact_id is distinct from esperado.contact_id::uuid',
    '        or atual.sender::text is distinct from esperado.sender',
    '        or atual.content is distinct from esperado.content',
    '        or atual.message_type::text is distinct from esperado.message_type',
    '        or atual.transcription is distinct from esperado.transcription',
    '        or atual.is_read is distinct from esperado.is_read)',
    "  ) then raise exception 'ensaio: colisão de ID reservado em messages' using errcode = '23505'; end if;",
    'end',
    '$ensaio$;',
  ].join('\n');
}

/** Cabeçalho comum aos dois DML (provisionamento e remoção). */
export function cabecalhoSql(plano, rotulo) {
  const planoSeguro = validarPlanoSeguro(plano);
  if (!['provisionamento', 'reversão'].includes(rotulo)) {
    throw new Error('ensaio: rótulo SQL inválido');
  }
  return [
    `-- IA-010 / SL-059 — ${rotulo} do ambiente de ensaio`,
    `-- Fonte: docs/ia/IA-010-ambiente-de-ensaio.md §2`,
    `-- Marcadores: nomes com "${planoSeguro.prefixo}", e-mails em @${planoSeguro.dominio},`,
    `--             telefones em ${PREFIXO_TELEFONE_ENSAIO}***** (fora de faixa real).`,
    '-- Proibido: destinatário real, banco-fonte/CRM externo, contato de produção como fixture.',
    '-- Aplicar SÓ no banco local da cópia: zapp-db-local psql <cópia> [nome].',
  ];
}

/** DML aditivo e idempotente do ensaio (departamentos, filas, contatos e mensagens). */
export function sqlDeProvisionamento(planoRecebido = planoDeEnsaio()) {
  const plano = validarPlanoSeguro(planoRecebido);
  const departamentos = plano.departamentos.map((d) => [
    uuidEnsaio(1000 + DEPARTAMENTOS_ENSAIO.indexOf(d.nome)),
    `${plano.prefixo}${d.nome}`,
    true,
  ]);
  const filas = plano.departamentos.map((d) => [
    d.fila.id,
    d.fila.nome,
    d.fila.descricao,
    d.fila.cor,
    true,
    d.fila.prioridade,
  ]);
  const contatos = [];
  plano.departamentos.forEach((d) => {
    d.contatos.forEach((c) => {
      contatos.push([c.id, c.nome, c.telefone, c.email, 'open', d.fila.id, c.consent_status, `${plano.prefixo}contato de ensaio`]);
    });
  });
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

  const idsGerados = [...departamentos, ...filas, ...contatos, ...mensagens].map(([id]) => id);
  exigir(new Set(idsGerados).size === idsGerados.length, 'IDs SQL repetidos');

  const marcadores = marcadoresDoPlano(plano);
  const linhas = [
    ...cabecalhoSql(plano, 'provisionamento'),
    'begin;',
    LOCK_ENSAIO,
    preflightColisoes(marcadores),
  ];

  linhas.push(
    `insert into public.departments (id, name, is_active) values`,
    departamentos.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do nothing;',
    '',
    `insert into public.queues (id, name, description, color, is_active, priority) values`,
    filas.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do nothing;',
    '',
    `insert into public.contacts (id, name, phone, email, conversation_status, queue_id, consent_status, notes) values`,
    contatos.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do nothing;',
    '',
  );
  linhas.push(
    `insert into public.messages (id, contact_id, sender, content, message_type, transcription, is_read) values`,
    mensagens.map((valor) => `  (${literais(valor).join(', ')})`).join(',\n'),
    'on conflict (id) do nothing;',
    '',
    preflightColisoes(marcadores),
    'commit;',
  );

  return linhas.join('\n') + '\n';
}

/** DML de reversão: exige simultaneamente IDs reservados e marcadores canônicos. */
export function sqlDeRemocao(planoRecebido = planoDeEnsaio()) {
  const plano = validarPlanoSeguro(planoRecebido);
  const rotulo = `${plano.prefixo}`;
  const marcadores = marcadoresDoPlano(plano);
  return (
    [
      ...cabecalhoSql(plano, 'reversão'),
      'begin;',
      LOCK_ENSAIO,
      preflightColisoes(marcadores),
      '',
      `-- mensagens dos contatos de ensaio`,
      `delete from public.messages`,
      ` where id in (${idsSql(marcadores.mensagens)})`,
      `   and contact_id in (${idsSql(marcadores.contatos)})`,
      `   and content like '${rotulo}%';`,
      '',
      `-- contatos de ensaio`,
      `delete from public.contacts`,
      ` where id in (${idsSql(marcadores.contatos)}) and name like '${rotulo}%';`,
      '',
      `-- filas de ensaio`,
      `delete from public.queues`,
      ` where id in (${idsSql(marcadores.filas)}) and name like '${rotulo}%';`,
      '',
      `-- departamentos de ensaio`,
      `delete from public.departments`,
      ` where id in (${idsSql(marcadores.departamentos)}) and name like '${rotulo}%';`,
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
  let alvo;
  try {
    alvo = new URL(url);
  } catch {
    throw new Error('ensaio: DB_URL não é uma URL válida. Proibido seguir sem saber o alvo.');
  }
  if (!['postgres:', 'postgresql:'].includes(alvo.protocol)) {
    throw new Error('ensaio: DB_URL usa protocolo não-PostgreSQL.');
  }
  const host = alvo.hostname;
  const locais = ['127.0.0.1', 'localhost', '::1', '[::1]'];
  if (!locais.includes(host)) {
    throw new Error(
      'ensaio: DB_URL aponta para host não-local. Este provisionamento é LOCAL (regra R1): use zapp-db-local env.',
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
  --remover  imprime a reversão limitada aos IDs e marcadores canônicos
  --ajuda    esta ajuda

Aplicar (banco local da cópia de trabalho, nunca produção):
  bun scripts/ia/ensaio-provisionamento.mjs --sql | zapp-db-local psql <cópia> [nome]
`;

const FLAGS = new Set(['--plano', '--sql', '--remover', '--ajuda', '-h']);

export function interpretarArgumentos(argv = []) {
  if (!Array.isArray(argv) || argv.length > 1) {
    throw new Error('informe exatamente uma opção');
  }
  const flag = argv[0] ?? '--plano';
  if (!FLAGS.has(flag)) throw new Error(`flag desconhecida (${flag})`);
  return flag;
}

export function executarCli(
  argv = [],
  { env = process.env, stdout = process.stdout, stderr = process.stderr } = {},
) {
  let flag;
  try {
    flag = interpretarArgumentos(argv);
  } catch (error) {
    stderr.write(`ensaio: ${error.message}\n${AJUDA}`);
    return 1;
  }
  const plano = planoDeEnsaio();

  if (flag === '--ajuda' || flag === '-h') {
    stdout.write(AJUDA);
    return 0;
  }
  if (flag === '--plano') {
    stdout.write(resumoDoPlano(plano));
    return 0;
  }
  if (flag === '--sql' || flag === '--remover') {
    let host;
    try {
      host = conferirAlvoLocal(env.DB_URL);
    } catch (error) {
      stderr.write(`${error.message}\n`);
      return 1;
    }
    if (host) stderr.write(`ensaio: alvo conferido (${host})\n`);
    else stderr.write('ensaio: DB_URL ausente — nada a conferir; a aplicação é por zapp-db-local (local)\n');
    stdout.write(flag === '--sql' ? sqlDeProvisionamento(plano) : sqlDeRemocao(plano));
    return 0;
  }
  throw new Error(`ensaio: estado de CLI não tratado (${flag})`);
}

function chamadoComoEntrypoint(caminho = process.argv[1]) {
  if (!caminho) return false;
  try {
    return realpathSync(caminho) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (chamadoComoEntrypoint()) {
  process.exitCode = executarCli(process.argv.slice(2));
}
