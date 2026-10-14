/**
 * Teste de integracao da RPC public.save_talkx_template (Talk X).
 *
 * Prova o caminho canonico de gravacao de template: a versao ANTERIOR vai para
 * public.talkx_template_versions (imutavel, com a nota do usuario), a linha viva
 * de public.talkx_templates recebe o conteudo salvo, o guard canonico
 * (public.guard_talkx_template_update) autoriza a mudanca, o optimistic locking
 * recusa um expected_updated_at velho e quem nao tem sessao/perfil e negado.
 *
 * Fala com o banco pelo mesmo caminho dos outros testes de banco do produto
 * (scripts/db-audit/README.md): o psql do conjunto local da copia, com
 * SET LOCAL ROLE + request.jwt.claims, no papel de um cliente autenticado.
 * Nao usa service_role, nao usa dado real e nao toca producao. Cada caso roda
 * numa transacao propria que termina em ROLLBACK: nao sobra nada no banco.
 *
 * Como rodar (a partir da raiz da copia):
 *   ZAPP_DB_LOCAL=v2-<id> node --test tests/talkx/save_talkx_template.test.ts
 * (o nome do conjunto tambem e lido de .hermes-tarefa quando a variavel falta;
 *  ver scripts/db-audit/README.md para subir o conjunto local, `zapp-db-local up .`)
 *
 * Vermelho/verde: sem a migration 20261011000012_talkx_template_save_rpc.sql a
 * RPC e a coluna note NAO existem e todos os casos falham; com ela, passam.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Raiz da copia do repositorio (onde ficam supabase/migrations). O caminho e o
 * diretorio de onde o teste e rodado, como em qualquer chamada de
 * `zapp-db-local psql . <conjunto>`; ZAPP_DB_LOCAL_ROOT permite fixar.
 */
function raizDaCopia(): string {
  const doAmbiente = (process.env.ZAPP_DB_LOCAL_ROOT ?? '').trim();
  const candidata = resolve(doAmbiente || process.cwd());
  const pareceCopia =
    existsSync(resolve(candidata, 'package.json')) && existsSync(resolve(candidata, 'supabase/migrations'));
  if (!pareceCopia) {
    throw new Error(
      `rode o teste a partir da raiz da copia do Zapp Web V2 (diretorio atual: ${candidata}); ou defina ZAPP_DB_LOCAL_ROOT`,
    );
  }
  return candidata;
}

const RAIZ = raizDaCopia();

/**
 * Nome do conjunto local (v2-<id>). Vem de ZAPP_DB_LOCAL ou, sem ele, do ID da
 * propria tarefa em .hermes-tarefa — o mesmo `v2-<id>` com que o
 * `zapp-db-local up` subiu o banco da copia.
 */
function conjunto(): string {
  const doAmbiente = (process.env.ZAPP_DB_LOCAL ?? '').trim();
  if (doAmbiente) return doAmbiente;
  const arquivo = resolve(RAIZ, '.hermes-tarefa');
  if (existsSync(arquivo)) {
    const achado = /^ID=(\S+)$/m.exec(readFileSync(arquivo, 'utf8'));
    if (achado) return `v2-${achado[1]}`;
  }
  throw new Error(
    'conjunto do banco local desconhecido: rode com ZAPP_DB_LOCAL=v2-<id> (ver scripts/db-audit/README.md)',
  );
}

function binario(): string {
  const doAmbiente = (process.env.ZAPP_DB_LOCAL_BIN ?? '').trim();
  if (doAmbiente) return doAmbiente;
  const padrao = resolve(homedir(), '.local/bin/zapp-db-local');
  return existsSync(padrao) ? padrao : 'zapp-db-local';
}

const CONJUNTO = conjunto();
const BINARIO = binario();

type Saida = { rc: number; stdout: string; stderr: string };
type Dados = { [chave: string]: unknown };

/** Roda um script no psql do conjunto local. Nada sai da maquina. */
function psql(script: string): Saida {
  const r = spawnSync(BINARIO, ['psql', RAIZ, CONJUNTO, '-At', '-v', 'ON_ERROR_STOP=1'], {
    input: script,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });
  if (r.error) throw r.error;
  return { rc: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const MARCA = '@@EV@@';

/** As evidencias que o script acumula na tabela ev voltam numa linha marcada. */
function evidencias(saida: Saida, contexto: string): Dados {
  const linha = saida.stdout.split('\n').find((l) => l.startsWith(MARCA));
  if (!linha) {
    throw new Error(
      `${contexto}: sem evidencia do banco (rc=${saida.rc})\n-- stdout\n${saida.stdout}\n-- stderr\n${saida.stderr}`,
    );
  }
  const bruto: unknown = JSON.parse(linha.slice(MARCA.length));
  if (typeof bruto !== 'object' || bruto === null) throw new Error(`${contexto}: evidencia nao e objeto`);
  return bruto as Dados;
}

/** Roda o script, exige rc=0 (nenhuma assercao do SQL falhou) e devolve as evidencias. */
function rodar(script: string, contexto: string): Dados {
  const saida = psql(script);
  assert.equal(saida.rc, 0, `${contexto}: o script do banco falhou\n-- stderr\n${saida.stderr}`);
  return evidencias(saida, contexto);
}

function objeto(dados: Dados, chave: string): Dados {
  const valor = dados[chave];
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`evidencia "${chave}" nao e objeto: ${JSON.stringify(valor)}`);
  }
  return valor as Dados;
}

function texto(dados: Dados, chave: string): string {
  const valor = dados[chave];
  if (typeof valor !== 'string') throw new Error(`evidencia "${chave}" nao e texto: ${JSON.stringify(valor)}`);
  return valor;
}

function numero(dados: Dados, chave: string): number {
  const valor = dados[chave];
  if (typeof valor !== 'number') throw new Error(`evidencia "${chave}" nao e numero: ${JSON.stringify(valor)}`);
  return valor;
}

function booleano(dados: Dados, chave: string): boolean {
  const valor = dados[chave];
  if (typeof valor !== 'boolean') throw new Error(`evidencia "${chave}" nao e booleano: ${JSON.stringify(valor)}`);
  return valor;
}

// ---------------------------------------------------------------------------
// Blocos de SQL reusados pelos casos
// ---------------------------------------------------------------------------

const ASSINATURA_RPC =
  'public.save_talkx_template(uuid,timestamptz,text,text,text,text,text,text,text[],text[],text)';

function transacao(comandos: string[]): string {
  return [
    'begin;',
    'create temp table ev (k text primary key, v jsonb);',
    'grant all on table ev to authenticated;',
    ...comandos,
    `select '${MARCA}' || coalesce(jsonb_object_agg(k, v), '{}'::jsonb)::text from ev;`,
    'rollback;',
  ].join('\n');
}

/** Escolhe um perfil real do banco local e guarda uid/perfil nas evidencias. */
const PERFIL = `
do $perfil$
declare
  v_uid uuid;
  v_pid uuid;
begin
  select p.user_id, p.id into v_uid, v_pid
  from public.profiles p
  where p.user_id is not null
  order by p.created_at nulls last, p.id
  limit 1;
  if v_uid is null or v_pid is null then
    raise exception 'ASSERT_FAILED: banco local sem public.profiles para montar a fixture';
  end if;
  insert into ev values ('uid', to_jsonb(v_uid)), ('perfil', to_jsonb(v_pid));
end
$perfil$;
`.trim();

/** Cria o template "antigo" (a fixture) e prova que ele existe de verdade. */
function fixtureTemplate(templateId: string, nomeAntigo: string): string {
  return `
do $fixture$
declare
  v_pid uuid := (select (v #>> '{}')::uuid from ev where k = 'perfil');
begin
  insert into public.talkx_templates
    (id, name, description, category, content, status, tags, custom_variables,
     created_by, created_at, updated_at, use_count)
  values
    ('${templateId}'::uuid, '${nomeAntigo}', 'descricao antiga', 'geral', 'conteudo antigo', 'draft',
     array['tag-antiga'], array['nome_cliente'], v_pid,
     now() - interval '2 hours', now() - interval '2 hours', 7);
  insert into ev values ('fixture', jsonb_build_object(
    'linhas', (select count(*) from public.talkx_templates where id = '${templateId}'::uuid),
    'nome', (select name from public.talkx_templates where id = '${templateId}'::uuid),
    'conteudo', (select content from public.talkx_templates where id = '${templateId}'::uuid),
    'updated_at', (select updated_at from public.talkx_templates where id = '${templateId}'::uuid),
    'created_at', (select created_at from public.talkx_templates where id = '${templateId}'::uuid)
  ));
end
$fixture$;
`.trim();
}

/**
 * Sessao de cliente autenticado: claims do JWT + papel authenticated.
 * auth.uid() sai de request.jwt.claims->>'sub' (o mesmo caminho da sessao real).
 */
const SESSOES = [
  "select set_config('request.jwt.claims', jsonb_build_object('sub', (select v #>> '{}' from ev where k = 'uid'), 'role', 'authenticated')::text, true);",
  'set local role authenticated;',
].join('\n');

/** Le a linha viva e as versoes como postgres (sem RLS no meio). */
function leitura(templateId: string, rotuloVivo: string, rotulosVersao: string[]): string {
  const blocos = rotulosVersao.map(
    (rotulo, indice) => `
  select * into v_h from public.talkx_template_versions
  where template_id = '${templateId}'::uuid and version_number = ${indice + 1};
  insert into ev values ('${rotulo}', jsonb_build_object(
    'id', v_h.id, 'version_number', v_h.version_number, 'name', v_h.name,
    'description', v_h.description, 'content', v_h.content, 'category', v_h.category,
    'status', v_h.status, 'media_url', v_h.media_url, 'media_type', v_h.media_type,
    'tags', v_h.tags, 'custom_variables', v_h.custom_variables,
    'saved_by', v_h.saved_by, 'note', v_h.note,
    'created_at_no_passado', v_h.created_at > statement_timestamp() - interval '10 minutes'
  ));`,
  );
  return `
do $coleta$
declare
  v_vivo public.talkx_templates%ROWTYPE;
  v_h public.talkx_template_versions%ROWTYPE;
  v_exp timestamptz := (select ((v -> 'updated_at') #>> '{}')::timestamptz from ev where k = 'fixture');
  v_criado timestamptz := (select ((v -> 'created_at') #>> '{}')::timestamptz from ev where k = 'fixture');
  v_pid uuid := (select (v #>> '{}')::uuid from ev where k = 'perfil');
begin
  select * into v_vivo from public.talkx_templates where id = '${templateId}'::uuid;
  insert into ev values ('${rotuloVivo}', jsonb_build_object(
    'name', v_vivo.name, 'content', v_vivo.content, 'description', v_vivo.description,
    'category', v_vivo.category, 'status', v_vivo.status,
    'media_url', v_vivo.media_url, 'media_type', v_vivo.media_type,
    'tags', v_vivo.tags, 'custom_variables', v_vivo.custom_variables,
    'use_count', v_vivo.use_count,
    'updated_at_mudou', v_vivo.updated_at > v_exp,
    'created_by_intacto', v_vivo.created_by = v_pid,
    'created_at_intacto', v_vivo.created_at = v_criado
  ));
  insert into ev values ('total_versoes', to_jsonb(
    (select count(*) from public.talkx_template_versions where template_id = '${templateId}'::uuid)
  ));${blocos.join('')}
end
$coleta$;
`.trim();
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

test('a RPC existe e e negada a quem nao tem sessao autenticada ou perfil', () => {
  const template = 'c0ffee00-0001-4000-8000-000000000001';
  const dados = rodar(
    transacao([
      `insert into ev values ('rpc_existe', to_jsonb(to_regprocedure('${ASSINATURA_RPC}') is not null));`,
      PERFIL,
      fixtureTemplate(template, 'Antigo do caso 1'),
      SESSOES,
      `
do $anon$
declare
  v_estado text := null;
  v_erro text := null;
  v_exp timestamptz := (select ((v -> 'updated_at') #>> '{}')::timestamptz from ev where k = 'fixture');
begin
  set local role anon;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  begin
    perform public.save_talkx_template('${template}'::uuid, v_exp, 'adulterado', 'conteudo adulterado',
      'geral', 'draft', null, null, array[]::text[], array[]::text[], 'nota do anon');
  exception when others then
    v_estado := sqlstate;
    v_erro := sqlerrm;
  end;
  reset role;
  insert into ev values ('anon', jsonb_build_object('sqlstate', v_estado, 'mensagem', v_erro));
end
$anon$;
`.trim(),
      `
do $sem_perfil$
declare
  v_estado text := null;
  v_erro text := null;
  v_exp timestamptz := (select ((v -> 'updated_at') #>> '{}')::timestamptz from ev where k = 'fixture');
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  begin
    perform public.save_talkx_template('${template}'::uuid, v_exp, 'adulterado', 'conteudo adulterado',
      'geral', 'draft', null, null, array[]::text[], array[]::text[], 'nota sem perfil');
  exception when others then
    v_estado := sqlstate;
    v_erro := sqlerrm;
  end;
  reset role;
  insert into ev values ('sem_perfil', jsonb_build_object('sqlstate', v_estado, 'mensagem', v_erro));
  insert into ev values ('depois', jsonb_build_object(
    'conteudo', (select content from public.talkx_templates where id = '${template}'::uuid),
    'nome', (select name from public.talkx_templates where id = '${template}'::uuid)
  ));
end
$sem_perfil$;
`.trim(),
    ]),
    'caso 1',
  );

  // O objeto sob teste existe: a negacao abaixo e de PERMISSAO, nao de ausencia.
  assert.equal(booleano(dados, 'rpc_existe'), true, 'a RPC save_talkx_template nao existe no banco');
  // E o objeto protegido (o template) tambem existe.
  assert.equal(numero(objeto(dados, 'fixture'), 'linhas'), 1, 'a fixture do template nao foi criada');

  const anon = objeto(dados, 'anon');
  assert.equal(texto(anon, 'sqlstate'), '42501', `sem sessao deveria dar 42501, deu ${JSON.stringify(anon)}`);
  assert.match(texto(anon, 'mensagem'), /permission denied|authentication_required/i);

  const semPerfil = objeto(dados, 'sem_perfil');
  assert.equal(texto(semPerfil, 'sqlstate'), '42501');
  assert.equal(texto(semPerfil, 'mensagem'), 'authenticated_profile_not_found');

  // Nenhuma das duas tentativas mudou nada.
  const depois = objeto(dados, 'depois');
  assert.equal(texto(depois, 'conteudo'), 'conteudo antigo');
  assert.equal(texto(depois, 'nome'), 'Antigo do caso 1');
});

test('grava a versao anterior com a nota e atualiza a linha viva', () => {
  const template = 'c0ffee00-0002-4000-8000-000000000002';
  const dados = rodar(
    transacao([
      PERFIL,
      fixtureTemplate(template, 'Titulo antigo'),
      SESSOES,
      `
do $salva$
declare
  v_exp timestamptz := (select ((v -> 'updated_at') #>> '{}')::timestamptz from ev where k = 'fixture');
  v_1 uuid;
  v_2 uuid;
  v_exp2 timestamptz;
begin
  select public.save_talkx_template('${template}'::uuid, v_exp, 'Titulo novo', 'conteudo novo',
    'campanha', 'review', 'https://exemplo.invalido/media.png', 'image',
    array['tag-nova'], array['zap'], 'nota do usuario') into v_1;
  select updated_at into v_exp2 from public.talkx_templates where id = '${template}'::uuid;
  select public.save_talkx_template('${template}'::uuid, v_exp2, 'Titulo final', 'conteudo final',
    'campanha', 'approved', null, null, array['tag-final'], array['zap'], 'nota final') into v_2;
  insert into ev values ('retornos', jsonb_build_object(
    'v1_nulo', v_1 is null, 'v2_nulo', v_2 is null, 'diferentes', v_1 is distinct from v_2
  ));
end
$salva$;
`.trim(),
      leitura(template, 'vivo', ['versao1', 'versao2']),
    ]),
    'caso 2',
  );

  const retornos = objeto(dados, 'retornos');
  assert.equal(booleano(retornos, 'v1_nulo'), false, 'a primeira gravacao nao devolveu id da versao');
  assert.equal(booleano(retornos, 'v2_nulo'), false, 'a segunda gravacao nao devolveu id da versao');
  assert.equal(booleano(retornos, 'diferentes'), true, 'as duas gravacoes devolveram a mesma versao');

  // Historico guarda o estado ANTERIOR (exigencia do guard canonico) + a nota.
  const versao1 = objeto(dados, 'versao1');
  assert.equal(numero(versao1, 'version_number'), 1);
  assert.equal(texto(versao1, 'name'), 'Titulo antigo');
  assert.equal(texto(versao1, 'description'), 'descricao antiga');
  assert.equal(texto(versao1, 'content'), 'conteudo antigo');
  assert.equal(texto(versao1, 'note'), 'nota do usuario');
  assert.equal(texto(versao1, 'saved_by'), texto(dados, 'perfil'));
  assert.equal(booleano(versao1, 'created_at_no_passado'), true, 'a versao foi gravada fora da instrucao de update');

  const versao2 = objeto(dados, 'versao2');
  assert.equal(numero(versao2, 'version_number'), 2, 'version_number nao incrementou');
  assert.equal(texto(versao2, 'name'), 'Titulo novo');
  assert.equal(texto(versao2, 'content'), 'conteudo novo');
  assert.equal(texto(versao2, 'note'), 'nota final');
  assert.equal(texto(versao2, 'saved_by'), texto(dados, 'perfil'));
  assert.equal(numero(dados, 'total_versoes'), 2);

  // Linha viva recebe o conteudo salvo; identidade e contagem ficam intactas.
  const vivo = objeto(dados, 'vivo');
  assert.equal(texto(vivo, 'name'), 'Titulo final');
  assert.equal(texto(vivo, 'content'), 'conteudo final');
  assert.equal(texto(vivo, 'category'), 'campanha');
  assert.equal(texto(vivo, 'status'), 'approved');
  assert.equal(vivo.media_url, null);
  assert.equal(vivo.media_type, null);
  assert.deepEqual(vivo.tags, ['tag-final']);
  assert.deepEqual(vivo.custom_variables, ['zap']);
  assert.equal(numero(vivo, 'use_count'), 7, 'a contagem de uso nao deveria mudar ao salvar');
  assert.equal(booleano(vivo, 'updated_at_mudou'), true, 'updated_at nao avancou');
  assert.equal(booleano(vivo, 'created_by_intacto'), true);
  assert.equal(booleano(vivo, 'created_at_intacto'), true);
});

test('expected_updated_at velho falha com optimistic_lock_failed e nao grava nada', () => {
  const template = 'c0ffee00-0003-4000-8000-000000000003';
  const dados = rodar(
    transacao([
      PERFIL,
      fixtureTemplate(template, 'Intocado'),
      SESSOES,
      `
do $corrida$
declare
  v_estado text := null;
  v_erro text := null;
begin
  begin
    perform public.save_talkx_template('${template}'::uuid,
      (select ((v -> 'updated_at') #>> '{}')::timestamptz from ev where k = 'fixture') - interval '1 second',
      'nao deveria entrar', 'nao deveria entrar', 'geral', 'draft', null, null,
      array[]::text[], array[]::text[], 'nota atrasada');
  exception when others then
    v_estado := sqlstate;
    v_erro := sqlerrm;
  end;
  reset role;
  insert into ev values ('corrida', jsonb_build_object('sqlstate', v_estado, 'mensagem', v_erro));
end
$corrida$;
`.trim(),
      leitura(template, 'vivo', []),
    ]),
    'caso 3',
  );

  const corrida = objeto(dados, 'corrida');
  assert.equal(texto(corrida, 'sqlstate'), '40001', `esperava 40001, veio ${JSON.stringify(corrida)}`);
  assert.equal(texto(corrida, 'mensagem'), 'optimistic_lock_failed');
  assert.equal(numero(dados, 'total_versoes'), 0, 'gravou versao mesmo com expected_updated_at velho');
  const vivo = objeto(dados, 'vivo');
  assert.equal(texto(vivo, 'name'), 'Intocado');
  assert.equal(texto(vivo, 'content'), 'conteudo antigo');
  assert.equal(booleano(vivo, 'updated_at_mudou'), false, 'a linha viva mudou apesar da recusa');
});

test('template inexistente falha com talkx_template_not_found', () => {
  const template = 'c0ffee00-0004-4000-8000-000000000004';
  const dados = rodar(
    transacao([
      PERFIL,
      SESSOES,
      `
do $ausente$
declare
  v_estado text := null;
  v_erro text := null;
begin
  begin
    perform public.save_talkx_template('${template}'::uuid, now(), 'x', 'y', 'geral', 'draft',
      null, null, array[]::text[], array[]::text[], 'nota');
  exception when others then
    v_estado := sqlstate;
    v_erro := sqlerrm;
  end;
  reset role;
  insert into ev values ('ausente', jsonb_build_object('sqlstate', v_estado, 'mensagem', v_erro));
end
$ausente$;
`.trim(),
    ]),
    'caso 4',
  );

  const ausente = objeto(dados, 'ausente');
  assert.equal(texto(ausente, 'sqlstate'), 'P0002', `esperava P0002, veio ${JSON.stringify(ausente)}`);
  assert.equal(texto(ausente, 'mensagem'), 'talkx_template_not_found');
});

test('o guard canonico recusa mudanca de conteudo fora da RPC autorizada', () => {
  const template = 'c0ffee00-0005-4000-8000-000000000005';
  const dados = rodar(
    transacao([
      `insert into ev values ('rpc_existe', to_jsonb(to_regprocedure('${ASSINATURA_RPC}') is not null));`,
      PERFIL,
      fixtureTemplate(template, 'Antigo do caso 5'),
      SESSOES,
      `
do $direto$
declare
  v_estado text := null;
  v_erro text := null;
begin
  begin
    update public.talkx_templates
    set content = 'conteudo adulterado'
    where id = '${template}'::uuid;
  exception when others then
    v_estado := sqlstate;
    v_erro := sqlerrm;
  end;
  reset role;
  insert into ev values ('direto', jsonb_build_object('sqlstate', v_estado, 'mensagem', v_erro));
  insert into ev values ('depois', jsonb_build_object(
    'conteudo', (select content from public.talkx_templates where id = '${template}'::uuid),
    'versoes', (select count(*) from public.talkx_template_versions where template_id = '${template}'::uuid)
  ));
end
$direto$;
`.trim(),
    ]),
    'caso 5',
  );

  assert.equal(booleano(dados, 'rpc_existe'), true);
  const direto = objeto(dados, 'direto');
  assert.equal(texto(direto, 'sqlstate'), '42501', `esperava 42501, veio ${JSON.stringify(direto)}`);
  assert.equal(texto(direto, 'mensagem'), 'talkx_template_update_requires_authorized_rpc');
  const depois = objeto(dados, 'depois');
  assert.equal(texto(depois, 'conteudo'), 'conteudo antigo');
  assert.equal(numero(depois, 'versoes'), 0);
});
