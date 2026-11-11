import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COLUNAS_USADAS,
  DEPARTAMENTOS_ENSAIO,
  DOMINIO_ENSAIO,
  MINIMO_CONVERSA_LONGA,
  PALETA_FILAS,
  PERFIS_ENSAIO,
  PREFIXO_ENSAIO,
  PREFIXO_TELEFONE_ENSAIO,
  cabecalhoSql,
  conferirAlvoLocal,
  executarCli,
  interpretarArgumentos,
  planoDeEnsaio,
  sqlDeProvisionamento,
  sqlDeRemocao,
  validarInvariantesPlano,
  validarPlanoSeguro,
} from '../../scripts/ia/ensaio-provisionamento.mjs';

/**
 * SL-059 — IA-010 "Provisionar dados sintéticos e 4 perfis de ensaio".
 *
 * O item de inventário está `NAO_IMPLEMENTADA` com o "o que falta" exatamente
 * certo: *"Provisionamento depende de autorização no banco canônico"*. Escrever
 * dado no banco canônico é escrita em PRODUÇÃO — e este cartão proíbe produção,
 * migration e DDL. O que o cartão permite, e o que estes contratos travam, é o
 * artefato de provisionamento: um gerador determinístico que produz o DML do
 * §2 da IA-010 sem tocar em banco nenhum, para ser aplicado no banco LOCAL da
 * cópia (onde os ensaios rodam, regra R1) e, no canônico, só sob autorização.
 *
 * Os contratos aqui não são prosa: eles conferem o plano, o DML e as MARCADORES
 * contra o retrato canônico do schema (`supabase/schema-manifest.json`), contra
 * a migration que define o enum de papéis e contra a paleta real do sistema. O
 * ponto sensível é não deixar o cartão ser lido como concluído: o 4º perfil
 * segue PENDENTE (enum `public.app_role` sem papel de leitura — SL-058) e o caso
 * de borda do mesmo telefone segue BLOQUEADO (índice único `contacts_phone_key`).
 *
 * Limite declarado: o DML NÃO provisiona identidade nenhuma — nem usuário, nem
 * perfil, nem papel. `profiles.user_id` e `user_roles.user_id` são FK NOT NULL
 * para `auth.users` e o login exige `auth.identities`: criar os 4 perfis da §2
 * obrigaria a escrever no schema `auth`, fora do escopo e do permitido neste
 * cartão. Por isso a reversão também não toca nessas tabelas — ela apaga
 * exatamente o que o provisionamento escreve (contrato de paridade abaixo).
 */
const RAIZ = resolve(__dirname, '../..');
const MODULO = resolve(RAIZ, 'scripts/ia/ensaio-provisionamento.mjs');
const MANIFESTO = resolve(RAIZ, 'supabase/schema-manifest.json');
const DOC_IA010 = resolve(RAIZ, 'docs/ia/IA-010-ambiente-de-ensaio.md');
const README_IA = resolve(RAIZ, 'docs/ia/README.md');
const PALETA_REAL_FILAS = resolve(RAIZ, 'src/components/queues/queueColors.ts');
const LOCK_TABELAS_SQL =
  'lock table public.departments, public.queues, public.contacts, public.messages in share row exclusive mode';

const plano = planoDeEnsaio();
const SQL = sqlDeProvisionamento(plano);
const REMOCAO = sqlDeRemocao(plano);
const MANIFESTO_JSON = JSON.parse(readFileSync(MANIFESTO, 'utf8')) as {
  columns: Record<string, unknown>;
  indexes: Record<string, unknown>;
};

/** O texto da migration que cria o enum de papéis, lido do próprio repositório. */
function papeisDoEnumReal(): string[] {
  const dir = resolve(RAIZ, 'supabase/migrations');
  const arquivos = readdirSync(dir).filter((nome) => nome.endsWith('.sql'));
  const linha = arquivos
    .map((nome) => readFileSync(resolve(dir, nome), 'utf8'))
    .flatMap((texto) => texto.split('\n'))
    .find((linha) => /CREATE TYPE public\.app_role AS ENUM/iu.test(linha));
  expect(linha, 'nenhuma migration cria o enum public.app_role').toBeTruthy();
  return (linha ?? '')
    .replace(/.*ENUM\s*\(/iu, '')
    .replace(/\).*/u, '')
    .split(',')
    .map((papel) => papel.trim().replace(/^'|'$/gu, ''))
    .filter(Boolean);
}

function instrucoesSql(dml: string): string[] {
  const semComentarios = dml
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');
  const instrucoes: string[] = [];
  let atual = '';
  let aspas = false;
  let dollar: string | null = null;
  for (let i = 0; i < semComentarios.length; i++) {
    if (dollar && semComentarios.startsWith(dollar, i)) {
      atual += dollar;
      i += dollar.length - 1;
      dollar = null;
      continue;
    }
    const caractere = semComentarios[i]!;
    if (dollar) {
      atual += caractere;
      continue;
    }
    if (caractere === "'") {
      atual += caractere;
      if (aspas && semComentarios[i + 1] === "'") atual += semComentarios[++i]!;
      else aspas = !aspas;
      continue;
    }
    if (!aspas && caractere === '$') {
      const tag = /^\$[a-z_]*\$/iu.exec(semComentarios.slice(i))?.[0];
      if (tag) {
        dollar = tag;
        atual += tag;
        i += tag.length - 1;
        continue;
      }
    }
    if (!aspas && caractere === ';') {
      if (atual.trim()) instrucoes.push(atual.replace(/\s+/gu, ' ').trim());
      atual = '';
    } else atual += caractere;
  }
  if (atual.trim()) instrucoes.push(atual.replace(/\s+/gu, ' ').trim());
  return instrucoes;
}

describe('SL-059 / IA-010 — ambiente de ensaio provisionável sem tocar produção', () => {
  it('o gerador existe no repositório e o plano cobre o §2 da IA-010', () => {
    expect(existsSync(MODULO)).toBe(true);
    expect(plano.departamentos.map((d) => d.nome)).toEqual(DEPARTAMENTOS_ENSAIO);
    expect(plano.tot.departamentos).toBe(6);
    expect(plano.tot.filas).toBe(6);
    expect(plano.tot.contatos).toBe(36);
    expect(plano.tot.conversasDeTexto).toBe(18);
    expect(plano.tot.conversasLongas).toBe(6);
    expect(plano.tot.perfis).toBe(4);

    const longas = plano.departamentos.flatMap((d) => d.contatos.filter((c) => c.conversaLonga));
    expect(longas).toHaveLength(6);
    for (const contato of longas) {
      expect(contato.mensagens.length).toBeGreaterThan(MINIMO_CONVERSA_LONGA);
    }
  });

  it('todo registro nasce marcado: prefixo ENSAIO-, domínio de teste e faixa de telefone própria', () => {
    for (const departamento of plano.departamentos) {
      expect(departamento.fila.nome.startsWith(PREFIXO_ENSAIO)).toBe(true);
      for (const contato of departamento.contatos) {
        expect(contato.nome.startsWith(PREFIXO_ENSAIO)).toBe(true);
        expect(contato.email.endsWith(`@${DOMINIO_ENSAIO}`)).toBe(true);
        expect(contato.telefone.startsWith(PREFIXO_TELEFONE_ENSAIO)).toBe(true);
        for (const mensagem of contato.mensagens) {
          expect(mensagem.content.includes(PREFIXO_ENSAIO)).toBe(true);
        }
      }
    }
  });

  it('nenhum dado pessoal real: sem CPF/CNPJ e sem telefone repetido no plano', () => {
    const telefones = plano.departamentos.flatMap((d) => d.contatos.map((c) => c.telefone));
    expect(new Set(telefones).size).toBe(telefones.length);

    const conteudos = plano.departamentos.flatMap((d) =>
      d.contatos.flatMap((c) => c.mensagens.map((m) => m.content)),
    );
    const CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/u;
    const CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/u;
    for (const conteudo of conteudos) {
      expect(CPF.test(conteudo)).toBe(false);
      expect(CNPJ.test(conteudo)).toBe(false);
    }
  });

  it('o 4º perfil fica PENDENTE e nenhum papel é inventado fora do enum real', () => {
    const papeis = papeisDoEnumReal();
    const doPlano = PERFIS_ENSAIO.map((p) => p.papel).filter((p): p is string => p !== null);
    expect(doPlano.sort()).toEqual([...papeis].sort());

    const leitura = PERFIS_ENSAIO.find((p) => p.chave === 'somente-leitura');
    expect(leitura, 'o plano precisa declarar o 4º perfil').toBeTruthy();
    expect(leitura?.papel).toBeNull();
    expect(leitura?.pendencia).toMatch(/SL-058/u);
    expect(papeis).not.toContain('somente-leitura');
    expect(plano.tot.perfisProvisionaveis).toBe(3);
  });

  it('o DML escreve exatamente nas tabelas e colunas permitidas pelo contrato', () => {
    // Lista real de colunas de cada `insert into public.<tabela> (…)` do SQL gerado.
    const colunasPorInsert = new Map<string, string[]>();
    for (const m of SQL.matchAll(/insert into public\.(\w+)\s*\(([^)]*)\)/giu)) {
      const tabela = m[1]!;
      expect(colunasPorInsert.has(tabela), `insert duplicado em public.${tabela}`).toBe(false);
      colunasPorInsert.set(
        tabela,
        m[2]!.split(',').map((c) => c.trim()),
      );
    }

    expect([...colunasPorInsert.keys()].sort()).toEqual(Object.keys(COLUNAS_USADAS).sort());

    for (const [tabela, colunas] of Object.entries(COLUNAS_USADAS)) {
      const doInsert = colunasPorInsert.get(tabela);
      expect(doInsert, `nenhum insert em public.${tabela}`).toBeDefined();
      // Nenhuma coluna do insert pode faltar no retrato canônico.
      for (const coluna of doInsert ?? []) {
        expect(
          MANIFESTO_JSON.columns[`${tabela}.${coluna}`],
          `coluna ausente no retrato canônico: ${tabela}.${coluna}`,
        ).toBeDefined();
      }
      // Igualdade e ordem exatas impedem ampliar silenciosamente a superfície
      // escrita para campos sensíveis que também existam no schema canônico.
      expect(doInsert, `colunas divergentes em public.${tabela}`).toEqual(colunas);
    }
  });

  it('o provisionamento é transacional, idempotente e falha fechado em qualquer colisão', () => {
    const blocos = SQL.split(/insert into/iu).slice(1);
    expect(blocos.length).toBeGreaterThanOrEqual(4);
    for (const bloco of blocos) {
      const ateOFim = bloco.split(';')[0];
      expect(ateOFim).toMatch(/on conflict \(id\) do nothing/iu);
    }
    for (const dml of [SQL, REMOCAO]) {
      expect(dml.match(/\bbegin;/giu)).toHaveLength(1);
      expect(dml.match(/\bcommit;/giu)).toHaveLength(1);
      expect(dml).toMatch(/begin;[\s\S]+commit;/iu);
    }
    const assinaturas = instrucoesSql(SQL).map((instrucao) => {
      if (instrucao === 'begin' || instrucao === 'commit') return instrucao;
      const insert = /^insert into public\.(\w+)/iu.exec(instrucao);
      return insert ? `insert:${insert[1]}` : `proibida:${instrucao.split(' ')[0]}`;
    });
    expect(assinaturas).toEqual([
      'begin',
      'proibida:select',
      'proibida:do',
      'insert:departments',
      'insert:queues',
      'insert:contacts',
      'insert:messages',
      'proibida:do',
      'commit',
    ]);
    const blocosPorTabela = new Map(
      [...SQL.matchAll(/insert into public\.(\w+)[\s\S]*?;/giu)].map((match) => [match[1]!, match[0]]),
    );
    expect(SQL).not.toMatch(/\bdo update\b/iu);
    expect(SQL.match(/do \$ensaio\$/gu)).toHaveLength(2);
    expect(REMOCAO.match(/do \$ensaio\$/gu)).toHaveLength(1);
    expect(SQL.match(/perform 1 from public\.\w+ where id in \([^;]+::uuid\) for update;/gu)).toHaveLength(8);
    expect(REMOCAO.match(/perform 1 from public\.\w+ where id in \([^;]+::uuid\) for update;/gu)).toHaveLength(4);
    for (const dml of [SQL, REMOCAO]) {
      expect(dml.match(/select pg_advisory_xact_lock\(1162756947, 1229402160\);/gu)).toHaveLength(1);
      const tentativas = dml === SQL ? 2 : 1;
      expect(
        dml.match(
          /lock table public\.departments, public\.queues, public\.contacts, public\.messages in share row exclusive mode;/gu,
        ),
      ).toHaveLength(tentativas);
      expect(dml.match(/exception when deadlock_detected then/gu)).toHaveLength(tentativas);
      expect(dml.match(/if tentativa >= 5 then raise; end if;/gu)).toHaveLength(tentativas);
      expect(dml.match(/perform pg_sleep\(tentativa \* 0\.05\);/gu)).toHaveLength(tentativas);
      for (const tabela of ['departments', 'queues', 'contacts', 'messages']) {
        expect(dml).toContain(`colisão de ID reservado em ${tabela}`);
      }
    }
    const camposProtegidos = [
      'atual.is_active', 'atual.description', 'atual.color', 'atual.priority',
      'atual.phone', 'atual.email', 'atual.conversation_status::text', 'atual.queue_id',
      'atual.consent_status::text', 'atual.notes', 'atual.contact_id', 'atual.sender::text',
      'atual.content', 'atual.message_type::text', 'atual.transcription', 'atual.is_read',
    ];
    for (const campo of camposProtegidos) expect(SQL).toContain(`${campo} is distinct from`);
    expect(SQL).not.toMatch(/is distinct from[^\n]+\n\s+and atual/iu);
    const condicoesExatas: Record<string, string> = {
      departments: 'atual.name is distinct from esperado.nome or atual.is_active is distinct from esperado.is_active',
      queues: 'atual.name is distinct from esperado.nome or atual.description is distinct from esperado.descricao or atual.color is distinct from esperado.cor or atual.is_active is distinct from esperado.is_active or atual.priority is distinct from esperado.prioridade',
      contacts: 'atual.name is distinct from esperado.nome or atual.phone is distinct from esperado.telefone or atual.email is distinct from esperado.email or atual.conversation_status::text is distinct from esperado.conversation_status or atual.queue_id is distinct from esperado.queue_id::uuid or atual.consent_status::text is distinct from esperado.consent_status or atual.notes is distinct from esperado.notes',
      messages: 'atual.contact_id is distinct from esperado.contact_id::uuid or atual.sender::text is distinct from esperado.sender or atual.content is distinct from esperado.content or atual.message_type::text is distinct from esperado.message_type or atual.transcription is distinct from esperado.transcription or atual.is_read is distinct from esperado.is_read',
    };
    const preflightsSql = instrucoesSql(SQL).filter((instrucao) => instrucao.startsWith('do $ensaio$'));
    const preflightsRemocao = instrucoesSql(REMOCAO).filter((instrucao) => instrucao.startsWith('do $ensaio$'));
    for (const preflight of [...preflightsSql, ...preflightsRemocao]) {
      expect(preflight).toContain('tentativa smallint := 0');
      expect(preflight).toContain(LOCK_TABELAS_SQL);
      expect(preflight).toMatch(/loop begin lock table[\s\S]+return; exception when deadlock_detected then/u);
    }
    for (const [tabela, esperada] of Object.entries(condicoesExatas)) {
      const padrao = new RegExp(
        `select 1 from public\\.${tabela} atual[\\s\\S]*?on atual\\.id = esperado\\.id::uuid\\s+where atual\\.id in \\([^)]*::uuid\\)\\s+and \\(([\\s\\S]*?)\\)\\s+\\) then raise exception 'ensaio: colisão de ID reservado em ${tabela}'`,
        'u',
      );
      const normalizar = (valor: string) => valor.replace(/\s+/gu, ' ').trim();
      expect(preflightsSql.map((preflight) => normalizar(padrao.exec(preflight)?.[1] ?? ''))).toEqual([
        esperada,
        esperada,
      ]);
      expect(preflightsRemocao.map((preflight) => normalizar(padrao.exec(preflight)?.[1] ?? ''))).toEqual([
        esperada,
      ]);
      for (const preflight of [...preflightsSql, ...preflightsRemocao]) {
        const valores = new RegExp(
          `select 1 from public\\.${tabela} atual\\s+join \\(values ([\\s\\S]*?)\\) as esperado\\(`,
          'u',
        ).exec(preflight)?.[1] ?? '';
        const idsEsperados = [...valores.matchAll(/\(\s*'([0-9a-f-]{36})'/gu)].map((match) => match[1]);
        const filtro = new RegExp(
          `select 1 from public\\.${tabela} atual[\\s\\S]*?where atual\\.id in \\(([^)]*)\\)\\s+and`,
          'u',
        ).exec(preflight)?.[1] ?? '';
        const lock = new RegExp(
          `perform 1 from public\\.${tabela} where id in \\(([^)]*)\\) for update`,
          'u',
        ).exec(preflight)?.[1] ?? '';
        const extrairIds = (lista: string) => [...lista.matchAll(/'([0-9a-f-]{36})'/gu)].map((match) => match[1]);
        expect(idsEsperados.length, `VALUES vazio em ${tabela}`).toBeGreaterThan(0);
        expect(extrairIds(filtro), `filtro de IDs divergente em ${tabela}`).toEqual(idsEsperados);
        expect(extrairIds(lock), `lock de IDs divergente em ${tabela}`).toEqual(idsEsperados);
      }
    }
    const blocoDepartments = blocosPorTabela.get('departments') ?? '';
    const blocoContacts = blocosPorTabela.get('contacts') ?? '';
    const blocoMessages = blocosPorTabela.get('messages') ?? '';
    expect(blocoDepartments.match(/, true\)/gu)).toHaveLength(6);
    expect(blocoContacts.match(/'open'/gu)).toHaveLength(36);
    expect(blocoMessages.match(/, false\)/gu)).toHaveLength(1374);
    expect(blocoMessages).not.toContain("'null'");
    const idsDasMensagens = [...blocoMessages.matchAll(/\('([0-9a-f-]{36})'/gu)].map((match) => match[1]);
    expect(idsDasMensagens).toHaveLength(1374);
    expect(new Set(idsDasMensagens).size).toBe(1374);
    expect(SQL).toContain("áudio d''ensaio sem transcrição");
  });

  it('valida invariantes independentes do próprio gerador canônico', () => {
    const mutacoes: Array<(valor: ReturnType<typeof planoDeEnsaio>) => void> = [
      (valor) => { valor.departamentos[0]!.fila.descricao = 'PII cliente@example.com'; },
      (valor) => { valor.departamentos[0]!.contatos[0]!.nome = 'ENSAIO-CPF-123.456.789-00'; },
      (valor) => { valor.departamentos[0]!.contatos[0]!.email += '@evil.test'; },
      (valor) => { valor.departamentos[0]!.contatos[0]!.telefone = '+5500DROP'; },
      (valor) => { valor.departamentos[0]!.contatos[0]!.mensagens[0]!.sender = 'system'; },
      (valor) => { valor.departamentos[0]!.contatos[0]!.mensagens[0]!.message_type = 'script'; },
      (valor) => { valor.departamentos[0]!.contatos[0]!.mensagens[0]!.transcription = 'PII'; },
      (valor) => {
        valor.departamentos[0]!.contatos[0]!.id = valor.departamentos[0]!.fila.id;
      },
    ];
    expect(validarInvariantesPlano(plano)).toBe(plano);
    for (const alterar of mutacoes) {
      const alterado = structuredClone(plano);
      alterar(alterado);
      expect(() => validarInvariantesPlano(alterado)).toThrow(/plano canônico inválido/u);
    }
  });

  it('o gerador aceita apenas o plano canônico completo, inclusive IDs e vocabulários', () => {
    const copia = structuredClone(plano);
    const seguro = validarPlanoSeguro(copia);
    expect(seguro).toEqual(plano);
    expect(seguro).not.toBe(copia);
    expect(() => cabecalhoSql(plano, 'auditoria\nTRUNCATE TABLE public.contacts;\n--')).toThrow(
      /rótulo SQL inválido/u,
    );
    expect(() => cabecalhoSql(plano, 'provisionamento-injetado')).toThrow(/rótulo SQL inválido/u);

    const mutacoes: Array<(valor: ReturnType<typeof planoDeEnsaio>) => void> = [
      (valor) => { valor.prefixo = '%'; },
      (valor) => { valor.dominio = 'cliente.com.br'; },
      (valor) => { valor.departamentos[0].fila.id = '11111111-1111-4111-8111-111111111111'; },
      (valor) => { valor.departamentos[0].contatos[0].id = '22222222-2222-4222-8222-222222222222'; },
      (valor) => { valor.departamentos[0].contatos[0].telefone = '+5511999999999'; },
      (valor) => { valor.departamentos[0].contatos[0].email = 'ENSAIO-invalido@ensaio.invalid'; },
      (valor) => { valor.departamentos[0].contatos[0].consent_status = 'intruso'; },
      (valor) => { valor.departamentos[0].contatos[0].mensagens[0].sender = 'intruso'; },
      (valor) => { valor.departamentos[0].contatos[0].mensagens[0].message_type = 'intruso'; },
      (valor) => { valor.departamentos[0].contatos[0].mensagens[0].content += ' CPF 123.456.789-00'; },
      (valor) => { valor.tot.contatos = 999; },
      (valor) => { valor.casosDeBorda.pop(); },
    ];

    for (const adulterar of mutacoes) {
      const adulterado = structuredClone(plano);
      adulterar(adulterado);
      expect(() => sqlDeProvisionamento(adulterado)).toThrow(/contrato canônico/u);
      expect(() => sqlDeRemocao(adulterado)).toThrow(/contrato canônico/u);
    }
  });

  it('templates e plano canônico são profundamente imutáveis', () => {
    expect(Object.isFrozen(DEPARTAMENTOS_ENSAIO)).toBe(true);
    expect(Object.isFrozen(PALETA_FILAS)).toBe(true);
    expect(Object.isFrozen(PERFIS_ENSAIO)).toBe(true);
    expect(Object.isFrozen(PERFIS_ENSAIO[0])).toBe(true);
    expect(Object.isFrozen(plano)).toBe(true);
    expect(Object.isFrozen(plano.departamentos[0]!.fila)).toBe(true);
    expect(Object.isFrozen(plano.departamentos[0]!.contatos[0]!.mensagens[0])).toBe(true);
    expect(() => (PALETA_FILAS as unknown as string[]).push('cor-externa')).toThrow();
  });

  it('a reversão exige IDs e marcadores: nenhum delete alcança dado apenas parecido', () => {
    const instrucoes = instrucoesSql(REMOCAO);
    expect(instrucoes).toHaveLength(8);
    expect(instrucoes[0]).toBe('begin');
    expect(instrucoes[1]).toBe('select pg_advisory_xact_lock(1162756947, 1229402160)');
    expect(instrucoes[2]).toMatch(/^do \$ensaio\$ .*colisão de ID reservado.* \$ensaio\$$/u);
    expect(instrucoes.slice(3, 7).map((instrucao) => /^delete from public\.(\w+)/u.exec(instrucao)?.[1])).toEqual([
      'messages',
      'contacts',
      'queues',
      'departments',
    ]);
    for (const instrucao of instrucoes.slice(3, 7)) {
      expect(instrucao).toMatch(/\busing \(values\b/u);
      expect(instrucao).toMatch(/\bid in \(/u);
      expect(instrucao).toMatch(/like 'ENSAIO-%'/u);
      expect(instrucao).toMatch(/\bis not distinct from\b/u);
      expect(instrucao).not.toMatch(/\bor\s+true\b/iu);
      expect(instrucao).not.toMatch(/\bilike\b/iu);
    }
    expect(instrucoes[3]).toMatch(/atual\.contact_id is not distinct from esperado\.contact_id::uuid/u);
    expect(instrucoes[7]).toBe('commit');

    const condicoesExatasPorTabela: Record<string, string[]> = {
      departments: ['name', 'is_active'],
      queues: ['name', 'description', 'color', 'is_active', 'priority'],
      contacts: ['name', 'phone', 'email', 'conversation_status::text', 'queue_id', 'consent_status::text', 'notes'],
      messages: ['contact_id', 'sender::text', 'content', 'message_type::text', 'transcription', 'is_read'],
    };
    for (const [tabela, campos] of Object.entries(condicoesExatasPorTabela)) {
      const deleteDaTabela = new RegExp(`delete from public\\.${tabela}([\\s\\S]*?);`, 'iu').exec(REMOCAO)?.[1] ?? '';
      for (const campo of campos) {
        expect(deleteDaTabela, `remoção de ${tabela} não compara ${campo}`).toContain(
          `atual.${campo} is not distinct from`,
        );
      }
    }

    for (const tabela of ['departments', 'queues', 'contacts', 'messages']) {
      const blocoInsert = new RegExp(
        `insert into public\\.${tabela}[^;]+?values([\\s\\S]*?)on conflict`,
        'iu',
      ).exec(SQL)?.[1] ?? '';
      const idsProvisionados = [...blocoInsert.matchAll(/\('([0-9a-f-]{36})'/gu)].map((match) => match[1]);
      const deleteDaTabela = new RegExp(`delete from public\\.${tabela}([\\s\\S]*?);`, 'iu').exec(REMOCAO)?.[1] ?? '';
      const primeiraLista = /\bid in \(([^)]*)\)/iu.exec(deleteDaTabela)?.[1] ?? '';
      const idsRemovidos = [...primeiraLista.matchAll(/'([0-9a-f-]{36})'/gu)].map((match) => match[1]);
      expect(idsRemovidos, `IDs de remoção divergentes em ${tabela}`).toEqual(idsProvisionados);
    }
  });

  it('a reversão apaga só tabelas que o provisionamento escreve', () => {
    const escritas = new Set(
      [...SQL.matchAll(/insert into\s+(public\.\w+)/giu)].map((m) => m[1]!),
    );
    const apagadas = [...REMOCAO.matchAll(/delete from\s+([\w.]+)/giu)].map((m) => m[1]!);
    expect(apagadas.length).toBeGreaterThan(0);

    // Exceções deliberadas: tabelas que a reversão apaga sem o provisionamento
    // escrever. Fica VAZIA de propósito — antes desta correção ela precisaria
    // listar auth.users, auth.identities, public.profiles e public.user_roles,
    // tabelas que o DML não escreve (identidade de ensaio exigiria escrita no
    // schema auth — fora do escopo; ver IA-010 §6).
    const EXCECOES_DELIBERADAS: string[] = [];

    for (const tabela of apagadas) {
      if (EXCECOES_DELIBERADAS.includes(tabela)) continue;
      expect(
        escritas.has(tabela),
        `a reversão apaga ${tabela}, que o provisionamento não escreve`,
      ).toBe(true);
    }
  });

  it('conversa-sem-analise e contato-sem-memoria são garantidos por omissão no DML', () => {
    // O caso de borda só vale se nenhuma análise/memória for gravada: o SQL
    // gerado (--sql) não pode mencionar as tabelas que os representariam.
    // Ambas existem no retrato canônico, então a omissão é verificável.
    expect(MANIFESTO_JSON.columns['conversation_analyses.id']).toBeDefined();
    expect(MANIFESTO_JSON.columns['conversation_memory.id']).toBeDefined();
    expect(SQL).not.toMatch(/conversation_analyses/iu);
    expect(SQL).not.toMatch(/conversation_memory/iu);
  });

  it('as filas usam só cores que o sistema já tem', () => {
    const paleta = readFileSync(PALETA_REAL_FILAS, 'utf8');
    for (const cor of PALETA_FILAS) {
      expect(paleta).toContain(cor);
    }
    const usadas = plano.departamentos.map((d) => d.fila.cor);
    expect(usadas).toHaveLength(6);
    for (const cor of usadas) {
      expect(PALETA_FILAS).toContain(cor);
    }
  });

  it('o gerador não guarda alvo de rede e recusa host que não seja local', () => {
    expect(SQL).not.toMatch(/postgres(?:ql)?:\/\//iu);
    expect(SQL).not.toMatch(/supabase\.co/iu);
    expect(SQL).not.toMatch(/(?:^|\s)host=/imu);
    expect(SQL).not.toMatch(/https?:\/\//iu);

    expect(conferirAlvoLocal('postgres://127.0.0.1:54321/postgres')).toBe('127.0.0.1');
    expect(conferirAlvoLocal('postgresql://postgres:senha@localhost:54322/postgres')).toBe('localhost');
    expect(conferirAlvoLocal('postgresql://postgres:senha@[::1]:54322/postgres')).toMatch(/::1/u);
    // postgres:/postgresql: não é esquema "especial" para o parser de URL: sem
    // lowercase explícito no host, "LOCALHOST" (alvo local de verdade, só com caixa
    // diferente) cairia no mesmo throw de host remoto que db.exemplo-do-cliente.com.
    expect(conferirAlvoLocal('postgres://LOCALHOST:54322/postgres')).toBe('localhost');
    expect(conferirAlvoLocal(undefined)).toBeNull();
    expect(conferirAlvoLocal('')).toBeNull();
    expect(() => conferirAlvoLocal('https://localhost:5432/postgres')).toThrow(/protocolo não-PostgreSQL/u);
    expect(() => conferirAlvoLocal('postgresql://u:p@localhost.evil/postgres')).toThrow(/não-local/u);
    expect(() => conferirAlvoLocal('postgresql://u:p@db.exemplo-do-cliente.com:5432/postgres')).toThrow(
      /não-local/u,
    );
    expect(() => conferirAlvoLocal('isso-nao-e-url')).toThrow(/não é uma URL válida/u);
  });

  it('a CLI rejeita ambiguidade, opção desconhecida e alvo inseguro sem emitir DML', () => {
    expect(interpretarArgumentos([])).toBe('--plano');
    expect(interpretarArgumentos(['--sql'])).toBe('--sql');
    expect(() => interpretarArgumentos(['--sql', '--remover'])).toThrow(/exatamente uma/u);
    expect(() => interpretarArgumentos(['--sql=agora'])).toThrow(/desconhecida/u);

    const executar = (argv: string[], DB_URL?: string) => {
      let out = '';
      let err = '';
      const status = executarCli(argv, {
        env: DB_URL === undefined ? {} : { DB_URL },
        stdout: { write: (valor: string) => { out += valor; return true; } } as NodeJS.WriteStream,
        stderr: { write: (valor: string) => { err += valor; return true; } } as NodeJS.WriteStream,
      });
      return { status, out, err };
    };

    expect(executar(['--sql', '--remover'])).toMatchObject({ status: 1, out: '' });
    expect(executar(['arquivo.sql'])).toMatchObject({ status: 1, out: '' });
    expect(executar(['--sql'], 'https://localhost/postgres')).toMatchObject({ status: 1, out: '' });
    expect(executar(['--sql'], 'postgresql://u:p@db.exemplo.com/postgres')).toMatchObject({ status: 1, out: '' });
    expect(executar(['--remover'], 'postgresql://u:p@db.exemplo.com/postgres')).toMatchObject({ status: 1, out: '' });
    expect(executar(['--sql'], 'postgresql://u:p@localhost:5432/postgres')).toMatchObject({ status: 0 });
    const remocao = executar(['--remover'], 'postgresql://u:p@localhost:5432/postgres');
    expect(remocao).toMatchObject({ status: 0 });
    expect(remocao.out).toContain('delete from public.contacts');
    expect(remocao.out).not.toContain('insert into public.contacts');
    expect(executar(['--plano'])).toMatchObject({ status: 0, err: '' });
    expect(executar(['--plano']).out).toContain('plano do ambiente de ensaio');
    expect(executar(['--ajuda']).out).toContain('uso: bun scripts/ia/ensaio-provisionamento.mjs');

    const segredo = 'SENHA_SUPER_SECRETA_2750';
    const invalida = executar(['--sql'], `postgresql://usuario:${segredo}@[`);
    expect(invalida).toMatchObject({ status: 1, out: '' });
    expect(invalida.err).not.toContain(segredo);
  });

  it('importar o módulo por um programa homônimo não executa a CLI', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'ensaio-import-'));
    const chamador = join(pasta, 'ensaio-provisionamento.mjs');
    const atalho = join(pasta, 'ensaio-link.mjs');
    try {
      writeFileSync(chamador, `import ${JSON.stringify(pathToFileURL(MODULO).href)};\nconsole.log('import-ok');\n`);
      const resultado = spawnSync(process.execPath, [chamador, '--sql'], { encoding: 'utf8' });
      expect(resultado.status).toBe(0);
      expect(resultado.stderr).toBe('');
      expect(resultado.stdout.trim()).toBe('import-ok');

      symlinkSync(MODULO, atalho);
      const porAtalho = spawnSync(process.execPath, [atalho, '--ajuda'], { encoding: 'utf8' });
      expect(porAtalho.status).toBe(0);
      expect(porAtalho.stderr).toBe('');
      expect(porAtalho.stdout).toContain('uso: bun scripts/ia/ensaio-provisionamento.mjs');
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('cada caso de borda do §2 tem estado declarado — e o do mesmo telefone tem prova do bloqueio', () => {
    const porChave = new Map(plano.casosDeBorda.map((c) => [c.chave, c]));
    expect([...porChave.keys()].sort()).toEqual(
      [
        'audio-autorizacao-negada',
        'audio-sem-transcricao',
        'contato-sem-memoria',
        'conversa-sem-analise',
        'mesmo-telefone',
      ].sort(),
    );

    const bloqueado = porChave.get('mesmo-telefone');
    expect(bloqueado?.situacao).toBe('bloqueado');
    expect(bloqueado?.evidencia).toContain('contacts_phone_key');
    expect(MANIFESTO_JSON.indexes['contacts.contacts_phone_key']).toBeDefined();

    for (const chave of ['conversa-sem-analise', 'contato-sem-memoria', 'audio-sem-transcricao', 'audio-autorizacao-negada']) {
      expect(porChave.get(chave)?.situacao).toBe('provisionado');
    }

    const negado = plano.departamentos.flatMap((d) => d.contatos).find((c) => c.consent_status === 'opt_out');
    expect(negado, 'o caso de autorização negada precisa de um contato com consent_status opt_out').toBeTruthy();
    const semTranscricao = plano.departamentos
      .flatMap((d) => d.contatos)
      .flatMap((c) => c.mensagens)
      .filter((m) => m.message_type === 'audio');
    expect(semTranscricao.length).toBeGreaterThan(0);
    for (const audio of semTranscricao) {
      expect(audio.transcription).toBeNull();
    }
  });

  it('a IA-010 e o índice registram o estado real do provisionamento', () => {
    const doc = readFileSync(DOC_IA010, 'utf8');
    expect(doc).toContain('scripts/ia/ensaio-provisionamento.mjs');
    expect(doc).toContain('contacts_phone_key');
    expect(doc).toContain('SL-058');
    expect(doc).toContain('zapp-db-local');
    expect(doc).not.toMatch(/- \[ \] Provisionamento/u);

    const index = readFileSync(README_IA, 'utf8');
    expect(index).toContain('ensaio-provisionamento.mjs');
  });
});
