import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { publicationChanges } from './publication.mjs';

// Projecao lexical e fixtures CLI: nenhum destes casos executa PostgreSQL.
const add='ALTER PUBLICATION supabase_realtime ADD TABLE public.visible_table';
const drop='ALTER PUBLICATION supabase_realtime DROP TABLE public.visible_table';
const A=[{action:'ADD',table:'visible_table'}], D=[{action:'DROP',table:'visible_table'}];
const cases=[];
const ok=(name,sql,expected=[])=>cases.push({name,sql,expected});
const bad=(name,sql)=>cases.push({name,sql,unsupported:true});
ok('ADD estático',add+';',A);ok('DROP estático',drop+';',D);
ok('publication citada exata','ALTER PUBLICATION "supabase_realtime" ADD TABLE public.visible_table;',A);
ok('publication citada maiúscula é outra','ALTER PUBLICATION "SUPABASE_REALTIME" ADD TABLE public.visible_table;');
ok('word publication dobra case',add.toUpperCase()+';',A);
ok('schema citado minúsculo','ALTER PUBLICATION supabase_realtime ADD TABLE "public"."visible_table";',A);
ok('schema citado maiúsculo é outro','ALTER PUBLICATION supabase_realtime ADD TABLE "PUBLIC".visible_table;');
ok('outra publication','ALTER PUBLICATION outra ADD TABLE public.visible_table;');
ok('outro schema','ALTER PUBLICATION supabase_realtime ADD TABLE externo.visible_table;');
ok('sem schema mantém public','ALTER PUBLICATION supabase_realtime ADD TABLE visible_table;',A);
ok('tabela citada preserva case','ALTER PUBLICATION supabase_realtime ADD TABLE public."VISIBLE_TABLE";',[{action:'ADD',table:'VISIBLE_TABLE'}]);
ok('lista com outro schema','ALTER PUBLICATION supabase_realtime ADD TABLE public.visible_table, externo.outro, public.segunda;',[...A,{action:'ADD',table:'segunda'}]);
ok('lista de colunas',add+' (id, "created_at");',A);
ok('DO ALTER direto',`DO $$BEGIN ${add}; END $$;`,A);
ok('IF false é projeção declarativa, não execução',`DO $$BEGIN IF false THEN ${add}; END IF; END $$;`,A);
ok('EXCEPTION é projeção declarativa, não execução',`DO $$BEGIN ${add}; EXCEPTION WHEN others THEN ${drop}; END $$;`,[...A,...D]);
ok('EXECUTE string constante',`DO $$BEGIN EXECUTE '${add}'; END $$;`,A);
ok('EXECUTE dollar constante',`DO $body$BEGIN EXECUTE $sql$${add}$sql$; END $body$;`,A);
ok('DO corpo string simples',`DO 'BEGIN EXECUTE ''${add}''; END';`,A);
ok('LANGUAGE antes','DO LANGUAGE plpgsql $$BEGIN '+add+'; END$$;',A);
ok('LANGUAGE depois','DO $$BEGIN '+add+'; END$$ LANGUAGE plpgsql;',A);
ok('GRANT EXECUTE não é comando PLpgSQL',`DO $$BEGIN GRANT EXECUTE ON FUNCTION f(text) TO authenticated; RAISE NOTICE 'supabase_realtime'; END$$;`);
ok('SELECT literal é opaco',`SELECT '${add}';`);
ok('IF com literal é opaco',`DO $$BEGIN IF '${add}' <> '' THEN NULL; END IF; END$$;`);
ok('EXCEPTION RAISE é opaco',`DO $$BEGIN NULL; EXCEPTION WHEN others THEN RAISE NOTICE '${add}'; END$$;`);
ok('CREATE FUNCTION dollar é opaco',`CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$BEGIN ${add}; END$$;`);
ok('CREATE PROCEDURE dollar é opaco',`CREATE PROCEDURE f() LANGUAGE plpgsql AS $$BEGIN ${add}; END$$;`);
ok('CREATE FUNCTION string é opaco',`CREATE FUNCTION f() RETURNS void LANGUAGE sql AS '${add};';`);
ok('CREATE vazio é neutro','CREATE PUBLICATION supabase_realtime;');
const path = new URL('../../supabase/migrations/20261003212707_talkx_receipts_replies.sql', import.meta.url);
const real=readFileSync(path,'utf8').split('\n').slice(490,508).join('\n');
ok('CREATE vazio guardado real seguido DROP/ADD',real,[{action:'DROP',table:'talkx_recipients'},{action:'ADD',table:'talkx_recipients'}]);
for(const [name,sql] of [
 ['SET TABLE','ALTER PUBLICATION supabase_realtime SET TABLE public.visible_table;'],
 ['ADD TABLES IN SCHEMA','ALTER PUBLICATION supabase_realtime ADD TABLES IN SCHEMA public;'],
 ['RENAME target','ALTER PUBLICATION supabase_realtime RENAME TO outra;'],
 ['RENAME para target','ALTER PUBLICATION outra RENAME TO supabase_realtime;'],
 ['DROP target','DROP PUBLICATION IF EXISTS supabase_realtime;'],
 ['CREATE FOR TABLE','CREATE PUBLICATION supabase_realtime FOR TABLE public.visible_table;'],
 ['CREATE FOR ALL TABLES','CREATE PUBLICATION supabase_realtime FOR ALL TABLES;'],
 ['lista vazia','ALTER PUBLICATION supabase_realtime ADD TABLE;'],
 ['vírgula final',add+',;'],['duas vírgulas',add+',, public.segunda;'],
 ['qualificado incompleto','ALTER PUBLICATION supabase_realtime ADD TABLE public.;'],
 ['colunas vazias',add+' ();'],['colunas vírgula final',add+' (id,);'],
 ['colunas sem fechamento',add+' (id;'],['colunas expressão',add+' (lower(id));'],
 ['DROP com colunas',drop+' (id);'],['lixo após tabela',add+' garbage;'],
 ['WHERE fora da gramática',add+' WHERE (id=1);'],
 ['EXECUTE concat completo',`DO $$BEGIN EXECUTE '${add}' || ''; END$$;`],
 ['EXECUTE concat prefixo',`DO $$BEGIN EXECUTE 'ALTER ' || 'PUBLICATION supabase_realtime ADD TABLE public.visible_table'; END$$;`],
 ['EXECUTE format',`DO $$BEGIN EXECUTE format('ALTER PUBLICATION %I ADD TABLE public.visible_table','supabase_realtime'); END$$;`],
 ['EXECUTE USING',`DO $$BEGIN EXECUTE '${add}' USING 1; END$$;`],
 ['EXECUTE variável incerta',`DO $$DECLARE query text := '${add}'; BEGIN EXECUTE query; END$$;`],
 ['EXECUTE E-string',`DO $$BEGIN EXECUTE E'${add}'; END$$;`],
 ['EXECUTE escape desconhecido',`DO $$BEGIN EXECUTE '${add} /*\\*/'; END$$;`],
 ['DO string não fechada',`DO 'BEGIN ${add}; END`],
 ['DO dollar não fechado',`DO $$BEGIN ${add}; END`],
 ['EXECUTE string não fechada',`DO $$BEGIN EXECUTE '${add}; END$$;`],
 ['FUNCTION BEGIN ATOMIC opaco/unsupported',`CREATE FUNCTION f() RETURNS void LANGUAGE SQL BEGIN ATOMIC ${add}; ${drop}; END;`],
 ['PROCEDURE BEGIN ATOMIC opaco/unsupported',`CREATE PROCEDURE f() LANGUAGE SQL BEGIN ATOMIC ${add}; ${drop}; END;`],
 ['FUNCTION BEGIN ATOMIC dentro DO',`DO $$BEGIN CREATE FUNCTION f() RETURNS void LANGUAGE SQL BEGIN ATOMIC ${add}; ${drop}; END; END$$;`],
 ['DO outra linguagem','DO LANGUAGE plpythonu $$ '+add+' $$;'],
 ['atomicidade sem evento parcial',add+'; ALTER PUBLICATION supabase_realtime SET TABLE public.segunda;'],
 ['tabela duplicada',add+', public.visible_table;'],['coluna duplicada',add+' (id,id);'],
])bad(name,sql);
let nested=add+';';for(let i=0;i<4;i++)nested=`DO $d${i}$BEGIN EXECUTE $e${i}$${nested}$e${i}$; END $d${i}$;`;
ok('limite8 expansões aceita',nested,A);
bad('limite10 expansões recusa',`DO $d4$BEGIN EXECUTE $e4$${nested}$e4$; END $d4$;`);
ok('RENAME para quoted uppercase não muda target','ALTER PUBLICATION outra RENAME TO "SUPABASE_REALTIME";');
bad('DO LANGUAGE duplicado',`DO LANGUAGE plpgsql $$BEGIN ${add}; END$$ LANGUAGE plpgsql;`);
ok('dollar tag unicode',`DO $😀$BEGIN EXECUTE $é$${add}$é$; END $😀$;`,A);
ok('identificador com aspa escapada','ALTER PUBLICATION supabase_realtime ADD TABLE public."odd""name";',[{action:'ADD',table:'odd"name'}]);
ok('comentários como texto de RAISE são opacos',`DO $$BEGIN RAISE NOTICE '/* ${add} */ -- ${drop}'; END$$;`);
bad('revisão: concat keyword e target fragmentados',`DO $$BEGIN EXECUTE 'ALTER PUB' || 'LICATION supabase_' || 'realtime ADD TABLE public.visible_table'; END$$;`);
bad('revisão: DECLARE query com fragmentos',`DO $$DECLARE query text := 'ALTER PUB' || 'LICATION supabase_' || 'realtime ADD TABLE public.visible_table'; BEGIN EXECUTE query; END$$;`);
ok('revisão: SELECT USING conhecido e RAISE inerte',`DO $$BEGIN EXECUTE 'SELECT $1' USING 1; RAISE NOTICE '${add}'; END$$;`);
ok('variável SELECT sem evidência de DDL e RAISE inerte',`DO $$DECLARE query text := 'SELECT 1'; BEGIN EXECUTE query; RAISE NOTICE '${add}'; END$$;`);
ok('concat inerte não contaminada por RAISE',`DO $$BEGIN EXECUTE 'SELECT 1' || ' '; RAISE NOTICE '${add}'; END$$;`);
bad('concat dollar com fragmentos',`DO $body$BEGIN EXECUTE $a$ALTER PUB$a$ || $b$LICATION supabase_$b$ || $c$realtime ADD TABLE public.visible_table$c$; END$body$;`);
bad('DECLARE DEFAULT com fragmentos',`DO $$DECLARE query text DEFAULT 'ALTER PUB' || 'LICATION supabase_' || 'realtime ADD TABLE public.visible_table'; BEGIN EXECUTE query; END$$;`);

for (const caso of cases) {
  test(`projecao publication: ${caso.name}`, () => {
    if (caso.unsupported) {
      assert.throws(() => publicationChanges(caso.sql, caso.name),
        (erro) => erro.code === 'PUBLICATION_UNSUPPORTED');
    } else {
      assert.deepEqual(publicationChanges(caso.sql, caso.name), caso.expected);
    }
  });
}

function executarGuard(sql, table = 'visible_table') {
  const raiz = mkdtempSync(join(tmpdir(), 'docs-publication-cli-'));
  try {
    for (const dir of ['scripts/docs', 'scripts/db-audit', 'src', 'supabase/migrations', 'docs/adr']) {
      mkdirSync(join(raiz, dir), { recursive: true });
    }
    for (const file of ['verificar-docs-realtime.mjs', 'publication.mjs']) {
      copyFileSync(new URL(file, import.meta.url), join(raiz, 'scripts/docs', file));
    }
    copyFileSync(new URL('../db-audit/sql-lexer.mjs', import.meta.url), join(raiz, 'scripts/db-audit/sql-lexer.mjs'));
    writeFileSync(join(raiz, 'src/hook.ts'), `// channel-one\nconst a='hidden_table'; const b='${table}';\n`);
    writeFileSync(join(raiz, 'docs/REALTIME-CHANNELS-INVENTORY.md'),
      'Fora da publication hoje: `hidden_table`\n' +
      '| `channel-one` | `hidden_table` | `src/hook.ts:1` |\n' +
      `| \`channel-one\` | \`${table}\` | \`src/hook.ts:1\` |\n` +
      `| \`${table}\` | \`20260101000000_publish.sql\` |\n`);
    for (const file of ['docs/adr/ADR-009-inbox-fonte-unica-de-mensagens.md', 'docs/JORNADA_MENSAGEM_WHATSAPP.md']) {
      writeFileSync(join(raiz, file), 'Sem citações extras.\n');
    }
    writeFileSync(join(raiz, 'supabase/migrations/20260101000000_publish.sql'), sql);
    return spawnSync(process.execPath, [join(raiz, 'scripts/docs/verificar-docs-realtime.mjs')],
      { encoding: 'utf8', timeout: 10_000 });
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

function conferirCLI(resultado, publicado) {
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.equal(resultado.status, publicado ? 0 : 1, resultado.stderr || resultado.stdout);
  if (publicado) assert.match(resultado.stdout, /^OK: 3 documentos/);
  else assert.match(resultado.stderr, /^FALHOU/);
}

const statement='ALTER PUBLICATION supabase_realtime ADD TABLE public.visible_table;';
const publicationForms=[
 {name:'live',text:statement,publishes:true},
 {name:'line-comment',text:'-- '+statement,publishes:false},
 {name:'block-comment',text:'/* '+statement+' */',publishes:false},
 {name:'block-multiline',text:'/*\n'+statement+'\n*/',publishes:false},
 {name:'nested-block',text:'/* outer /* inner */ '+statement+' */',publishes:false},
 {name:'literal-only',text:"SELECT '"+statement+"';",publishes:false},
 {name:'quoted-publication',text:'ALTER PUBLICATION "supabase_realtime" ADD TABLE public.visible_table;',publishes:true},
 {name:'quoted-schema',text:'ALTER PUBLICATION supabase_realtime ADD TABLE "public"."visible_table";',publishes:true},
 {name:'quoted-table',text:'ALTER PUBLICATION supabase_realtime ADD TABLE public."visible_table";',publishes:true},
 {name:'folded-upper-table',text:'ALTER PUBLICATION supabase_realtime ADD TABLE PUBLIC.VISIBLE_TABLE;',publishes:true},
 {name:'folded-upper-statement',text:statement.toLowerCase(),publishes:true},
 {name:'comment-tokens',text:'ALTER /* why */ PUBLICATION supabase_realtime ADD TABLE public.visible_table;',publishes:true},
];

const realContextForms = [
  {
    "name": "real-f30-drop-dispatches",
    "table": "multiplix_dispatches",
    "sql": "ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_dispatches;\nDO $pub$\nBEGIN\n  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_dispatches';\n  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_recipients';\nEND\n$pub$;",
    "publishes": false,
    "origin": "20261001201230:55-60"
  },
  {
    "name": "real-f30-drop-recipients",
    "table": "multiplix_recipients",
    "sql": "ALTER PUBLICATION supabase_realtime ADD TABLE public.multiplix_recipients;\nDO $pub$\nBEGIN\n  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_dispatches';\n  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.multiplix_recipients';\nEND\n$pub$;",
    "publishes": false,
    "origin": "20261001201230:55-60"
  },
  {
    "name": "real-f30-quoted-add-dispatches",
    "table": "multiplix_dispatches",
    "sql": "ALTER PUBLICATION supabase_realtime ADD TABLE \"public\".\"multiplix_dispatches\" (\n  id, name, status, total_recipients, sent_count, failed_count, delivered_count,\n  outcome_unknown_count, started_at, paused_at, pause_reason, completed_at,\n  scheduled_at, whatsapp_connection_id, created_by, created_at, updated_at\n);",
    "publishes": true,
    "origin": "20261001201230:196-200"
  },
  {
    "name": "real-f30-quoted-add-recipients",
    "table": "multiplix_recipients",
    "sql": "ALTER PUBLICATION supabase_realtime ADD TABLE \"public\".\"multiplix_recipients\" (\n  id, dispatch_id, company_id, company_name_snapshot, destino_origem, status,\n  sent_at, delivered_at, error_message, delivery_claimed_at, delivery_claim_expires_at,\n  delivery_claimed_by, delivery_attempt_count, created_at, updated_at, attempt_count,\n  retry_after, provider_dispatch_started_at, external_id\n);",
    "publishes": true,
    "origin": "20261001201230:202-207"
  },
  {
    "name": "real-blacklist-do-execute-column-list",
    "table": "talkx_blacklist",
    "sql": "do $$\nbegin\n  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then\n    if exists (\n      select 1 from pg_publication_tables\n      where pubname = 'supabase_realtime'\n        and schemaname = 'public'\n        and tablename = 'talkx_blacklist'\n    ) then\n      execute 'alter publication supabase_realtime drop table public.talkx_blacklist';\n    end if;\n    execute 'alter publication supabase_realtime add table public.talkx_blacklist (id, contact_id)';\n  end if;\nend $$;",
    "publishes": true,
    "origin": "20261011000013:31-44"
  },
  {
    "name": "real-tasks-do-execute-no-inner-semicolon",
    "table": "conversation_tasks",
    "sql": "DO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime'\n      AND tablename = 'conversation_tasks'\n  ) THEN\n    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks';\n  END IF;\nEND $$;",
    "publishes": true,
    "origin": "20260928140000:195-204"
  },
  {
    "name": "real-d5-simple-add",
    "table": "team_messages",
    "sql": "ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;\n",
    "publishes": true,
    "origin": "20260826210200:5"
  },
  {
    "name": "control-blacklist-block-inside-select-text",
    "table": "talkx_blacklist",
    "sql": "SELECT $text$\ndo $$\nbegin\n  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then\n    if exists (\n      select 1 from pg_publication_tables\n      where pubname = 'supabase_realtime'\n        and schemaname = 'public'\n        and tablename = 'talkx_blacklist'\n    ) then\n      execute 'alter publication supabase_realtime drop table public.talkx_blacklist';\n    end if;\n    execute 'alter publication supabase_realtime add table public.talkx_blacklist (id, contact_id)';\n  end if;\nend $$;\n$text$;",
    "publishes": false,
    "origin": "synthetic control containing real block"
  },
  {
    "name": "control-blacklist-function-not-invoked",
    "table": "talkx_blacklist",
    "sql": "CREATE FUNCTION test() RETURNS void LANGUAGE plpgsql AS $func$\nbegin\n  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then\n    if exists (\n      select 1 from pg_publication_tables\n      where pubname = 'supabase_realtime'\n        and schemaname = 'public'\n        and tablename = 'talkx_blacklist'\n    ) then\n      execute 'alter publication supabase_realtime drop table public.talkx_blacklist';\n    end if;\n    execute 'alter publication supabase_realtime add table public.talkx_blacklist (id, contact_id)';\n  end if;\nend \n$func$;",
    "publishes": false,
    "origin": "synthetic control containing real body"
  },
  {
    "name": "control-blacklist-raise-notice-text",
    "table": "talkx_blacklist",
    "sql": "do $$\nbegin\n  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then\n    if exists (\n      select 1 from pg_publication_tables\n      where pubname = 'supabase_realtime'\n        and schemaname = 'public'\n        and tablename = 'talkx_blacklist'\n    ) then\n      raise notice 'alter publication supabase_realtime drop table public.talkx_blacklist';\n    end if;\n    raise notice 'alter publication supabase_realtime add table public.talkx_blacklist (id, contact_id)';\n  end if;\nend $$;",
    "publishes": false,
    "origin": "synthetic control derived from real block"
  },
  {
    "name": "control-tasks-commented-do",
    "table": "conversation_tasks",
    "sql": "/*\nDO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime'\n      AND tablename = 'conversation_tasks'\n  ) THEN\n    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks';\n  END IF;\nEND $$;\n*/",
    "publishes": false,
    "origin": "synthetic control containing real block"
  },
  {
    "name": "control-tasks-do-with-inner-semicolon",
    "table": "conversation_tasks",
    "sql": "DO $$\nBEGIN\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_publication_tables\n    WHERE pubname = 'supabase_realtime'\n      AND tablename = 'conversation_tasks'\n  ) THEN\n    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tasks;';\n  END IF;\nEND $$;",
    "publishes": true,
    "origin": "synthetic semicolon variation of real block"
  }
];

for (const newline of ['\n', '\r\n', '\n\n']) {
  for (const form of publicationForms) {
    test(`CLI publication ${form.name} ${JSON.stringify(newline)}`, () => {
      conferirCLI(executarGuard(form.text.replace(/\n/g, newline) + newline), form.publishes);
    });
  }
  for (const form of realContextForms) {
    test(`CLI contexto ${form.name} ${JSON.stringify(newline)}`, () => {
      conferirCLI(executarGuard(form.sql.replace(/\n/g, newline) + newline, form.table), form.publishes);
    });
  }
}

for (const [name, sql] of [
  ['prefixo válido seguido de SET TABLE', add + '; ALTER PUBLICATION supabase_realtime SET TABLE public.segunda;'],
  ['EXECUTE format', `DO $$BEGIN EXECUTE format('ALTER PUBLICATION %I ADD TABLE public.visible_table','supabase_realtime'); END$$;`],
  ['corpo DO sem fechamento', `DO $$BEGIN ${add}; END`],
  ['DDL fragmentada', `DO $$BEGIN EXECUTE 'ALTER PUB' || 'LICATION supabase_' || 'realtime ADD TABLE public.visible_table'; END$$;`],
]) {
  test(`CLI falha fechado: ${name}`, () => {
    const resultado = executarGuard(sql);
    conferirCLI(resultado, false);
    assert.match(resultado.stderr, /publication não suportada/);
  });
}

test('projecao lexical aceita as migrations reais do repositorio', () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const arquivos = readdirSync(dir).filter((file) => file.endsWith('.sql'));
  assert.ok(arquivos.length > 0);
  for (const file of arquivos) {
    assert.doesNotThrow(() => publicationChanges(readFileSync(new URL(file, dir), 'utf8'), file));
  }
});
