import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
  conferirAlvoLocal,
  planoDeEnsaio,
  sqlDeProvisionamento,
  sqlDeRemocao,
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
const CRIAR_FILA = resolve(RAIZ, 'src/components/queues/CreateQueueDialog.tsx');

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

  it('o DML só escreve em colunas que existem no retrato canônico do schema', () => {
    // Lista real de colunas de cada `insert into public.<tabela> (…)` do SQL gerado.
    const colunasPorInsert = new Map<string, string[]>();
    for (const m of SQL.matchAll(/insert into public\.(\w+)\s*\(([^)]*)\)/giu)) {
      colunasPorInsert.set(m[1]!, m[2]!.split(',').map((c) => c.trim()));
    }

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
      // Toda coluna declarada em COLUNAS_USADAS precisa estar no insert real.
      for (const coluna of colunas) {
        expect(doInsert, `COLUNAS_USADAS.${tabela} cita coluna fora do insert: ${coluna}`).toContain(
          coluna,
        );
      }
    }
  });

  it('o provisionamento é idempotente: todo insert traz on conflict', () => {
    const blocos = SQL.split(/insert into/iu).slice(1);
    expect(blocos.length).toBeGreaterThanOrEqual(4);
    for (const bloco of blocos) {
      const ateOFim = bloco.split(';')[0];
      expect(ateOFim).toMatch(/on conflict/iu);
    }
  });

  it('a reversão é só por prefixo: nenhum delete alcança dado que não seja de ensaio', () => {
    const semComentario = REMOCAO.split('\n')
      .filter((linha) => !linha.trim().startsWith('--'))
      .join('\n');
    const instrucoes = semComentario
      .split(';')
      .map((i) => i.trim())
      .filter((i) => /^delete from/iu.test(i));
    expect(instrucoes).toHaveLength(4);
    for (const instrucao of instrucoes) {
      expect(instrucao).toMatch(/like 'ENSAIO-%'/u);
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
    const paleta = readFileSync(CRIAR_FILA, 'utf8');
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

    expect(conferirAlvoLocal('http://127.0.0.1:54321')).toBe('127.0.0.1');
    expect(conferirAlvoLocal('postgresql://postgres:senha@localhost:54322/postgres')).toBe('localhost');
    expect(conferirAlvoLocal(undefined)).toBeNull();
    expect(conferirAlvoLocal('')).toBeNull();
    expect(() => conferirAlvoLocal('postgresql://u:p@db.exemplo-do-cliente.com:5432/postgres')).toThrow(
      /não-local/u,
    );
    expect(() => conferirAlvoLocal('isso-nao-e-url')).toThrow(/não é uma URL válida/u);
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
