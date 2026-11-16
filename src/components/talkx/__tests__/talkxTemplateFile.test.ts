import { describe, it, expect } from 'vitest';
import {
  parseTemplateFile,
  serializeTemplatesToCsv,
  serializeTemplatesToJson,
  serializarTags,
  desserializarTags,
  nomeDeCopia,
  TEMPLATE_NAME_MAX,
  TEMPLATE_CONTENT_MAX,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_FILE_MAX_ROWS,
  TEMPLATE_TAGS_MAX,
  TEMPLATE_TAG_MAX,
  linhaBloqueada,
} from '../talkxTemplateFile';

const UTF8_BOM = '﻿';
const NO_CONFLICTS = new Set<string>();

describe('X093 · talkxTemplateFile — parseTemplateFile', () => {
  it('CSV básico com cabeçalho name;content', () => {
    const csv = 'name;content\nOlá mundo;Mensagem de boas-vindas';
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].raw.name).toBe('Olá mundo');
    expect(r.rows[0].raw.content).toBe('Mensagem de boas-vindas');
    expect(r.rows[0].issues).toHaveLength(0);
  });

  it('CSV com BOM é limpo', () => {
    const csv = `${UTF8_BOM}name;content\nTemplate;Conteúdo`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows[0].raw.name).toBe('Template');
  });

  it('CSV com aspas duplas em campo', () => {
    const csv = `name;content\n"Nome ""especial""";Conteúdo normal`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows[0].raw.name).toBe('Nome "especial"');
  });

  it('CSV com separador ; dentro de campo entre aspas', () => {
    const csv = `name;content\n"Promoção; Desconto";Temos promoções`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows[0].raw.name).toBe('Promoção; Desconto');
  });

  it('CSV com quebra de linha no campo (não suportado inline, mas não trava)', () => {
    const csv = `name;content\nTemplate A;Linha 1\nTemplate B;Linha 2`;
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('CSV sem colunas name/content retorna fatalError', () => {
    const csv = 'titulo;corpo\nFoo;Bar';
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeDefined();
  });

  it('JSON array válido', () => {
    const json = JSON.stringify([
      { name: 'Template A', content: 'Corpo A', category: 'vendas' },
      { name: 'Template B', content: 'Corpo B' },
    ]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].raw.category).toBe('vendas');
  });

  it('JSON inválido retorna fatalError', () => {
    const r = parseTemplateFile('{ not valid json ]', 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeDefined();
    expect(r.fatalError).toMatch(/JSON inválido/);
  });

  it('JSON não-array retorna fatalError', () => {
    const r = parseTemplateFile('{"name":"foo","content":"bar"}', 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeDefined();
  });

  it('Valida nome ausente', () => {
    const json = JSON.stringify([{ name: '', content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('Valida nome > 1024 caracteres', () => {
    const json = JSON.stringify([{ name: 'A'.repeat(1025), content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'name')).toBe(true);
  });

  it('Valida conteúdo ausente', () => {
    const json = JSON.stringify([{ name: 'Template', content: '' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'content')).toBe(true);
  });

  it('Valida categoria desconhecida', () => {
    const json = JSON.stringify([{ name: 'Template', content: 'Corpo', category: 'inexistente' }]);
    const r = parseTemplateFile(json, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.some((i) => i.field === 'category')).toBe(true);
  });

  it('Detecta conflito com existente', () => {
    const json = JSON.stringify([{ name: 'Existente', content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', new Set(['Existente']));
    expect(r.rows[0].isConflict).toBe(true);
  });

  it('Não detecta conflito quando nome é novo', () => {
    const json = JSON.stringify([{ name: 'Novo', content: 'Corpo' }]);
    const r = parseTemplateFile(json, 'json', new Set(['Existente']));
    expect(r.rows[0].isConflict).toBe(false);
  });

  it(`Trunca ao atingir ${TEMPLATE_FILE_MAX_ROWS} linhas`, () => {
    const rows = Array.from({ length: TEMPLATE_FILE_MAX_ROWS + 5 }, (_, i) => ({ name: `T${i}`, content: 'C' }));
    const r = parseTemplateFile(JSON.stringify(rows), 'json', NO_CONFLICTS);
    expect(r.truncated).toBe(true);
    expect(r.rows).toHaveLength(TEMPLATE_FILE_MAX_ROWS);
  });
});

describe('X093 · talkxTemplateFile — serializeTemplatesToCsv', () => {
  it('produz BOM + cabeçalho + linha de dados', () => {
    const csv = serializeTemplatesToCsv([{ name: 'Oi', content: 'Msg', category: 'vendas' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('name;content');
    expect(csv).toContain('Oi;Msg;');
  });

  it('neutraliza célula que começa com =', () => {
    const csv = serializeTemplatesToCsv([{ name: '=cmd()', content: 'ok' }]);
    expect(csv).toContain("'=cmd()");
  });

  it('neutraliza célula que começa com +', () => {
    const csv = serializeTemplatesToCsv([{ name: '+1234', content: 'ok' }]);
    expect(csv).toContain("'+1234");
  });

  it('neutraliza célula que começa com -', () => {
    const csv = serializeTemplatesToCsv([{ name: '-fórmula', content: 'ok' }]);
    expect(csv).toContain("'-fórmula");
  });

  it('neutraliza célula que começa com @', () => {
    const csv = serializeTemplatesToCsv([{ name: '@sum', content: 'ok' }]);
    expect(csv).toContain("'@sum");
  });

  it('faz round-trip CSV: serialize → parse', () => {
    const templates = [
      { name: 'T1', content: 'Corpo 1', category: 'vendas', description: 'Desc' },
      { name: 'T2;separador', content: 'Corpo 2' },
      { name: 'T3 "aspas"', content: 'Ok' },
    ];
    const csv = serializeTemplatesToCsv(templates);
    const parsed = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(parsed.rows[0].raw.name).toBe('T1');
    expect(parsed.rows[1].raw.name).toBe('T2;separador');
    expect(parsed.rows[2].raw.name).toBe('T3 "aspas"');
  });
});

describe('X093 · talkxTemplateFile — serializeTemplatesToJson', () => {
  it('produz JSON array válido', () => {
    const json = serializeTemplatesToJson([{ name: 'T', content: 'C' }]);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('T');
  });
});

/**
 * Achados da revisão da PR #3175. Os dois primeiros casos falham com o parser
 * que quebrava o arquivo em linhas antes de interpretar as aspas, e o terceiro
 * e o quarto estouravam uma exceção que `reader.onload` não captura — o diálogo
 * não mostrava motivo nenhum e as linhas válidas do mesmo arquivo iam embora.
 */
describe('X093 · ida e volta do arquivo exportado', () => {
  it('CSV: mensagem com quebra de linha sobrevive a exportar e importar', () => {
    const csv = serializeTemplatesToCsv([
      { name: 'Saudação', content: 'Olá!\nTudo bem?', description: 'linha 1\nlinha 2', category: 'geral', tags: '', status: 'draft' },
      { name: 'Despedida', content: 'Até logo', description: '', category: 'geral', tags: '', status: 'draft' },
    ]);
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].raw.name).toBe('Saudação');
    expect(r.rows[0].raw.content).toBe('Olá!\nTudo bem?');
    expect(r.rows[0].raw.description).toBe('linha 1\nlinha 2');
    expect(r.rows[0].issues).toHaveLength(0);
    expect(r.rows[1].raw.name).toBe('Despedida');
  });

  it('CSV: ponto e vírgula e aspas dentro do campo sobrevivem', () => {
    const csv = serializeTemplatesToCsv([
      { name: 'Oferta', content: 'Leve 2; pague 1 — ele disse "sim"', category: 'geral', tags: '', status: 'draft' },
    ]);
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].raw.content).toBe('Leve 2; pague 1 — ele disse "sim"');
  });

  it('JSON: `[null]` vira problema da linha, sem derrubar a leitura', () => {
    const r = parseTemplateFile('[null, {"name":"Ok","content":"Oi"}]', 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].issues.map((i) => i.field)).toContain('name');
    expect(r.rows[1].issues).toHaveLength(0);
    expect(r.rows[1].raw.name).toBe('Ok');
  });

  it('JSON: campo com tipo errado vira problema da linha, não exceção', () => {
    const r = parseTemplateFile('[{"name":42,"content":"Oi"},{"name":"Bom","content":"Dia"}]', 'json', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows[0].issues.map((i) => i.field)).toContain('name');
    expect(r.rows[1].issues).toHaveLength(0);
  });
});

/**
 * Rodada 2 da revisão: `escapeCell` prefixa `'` contra fórmula no Excel e nada
 * desfazia isso na importação. `- Olá!` voltava `'- Olá!` como conteúdo válido,
 * e `+Oferta` voltava `'+Oferta` — nome diferente, logo não era reconhecido como
 * conflito e criava duplicata mesmo com "Pular todos".
 */
describe('X093 · protecao contra formula e reversivel', () => {
  it('conteúdo e nome que começam com caractere de fórmula voltam iguais', () => {
    const csv = serializeTemplatesToCsv([
      { name: '+Oferta', content: '- Olá!\n- Tudo bem?', category: 'geral', tags: '', status: 'draft' },
      { name: '=Total', content: '@mencao', category: 'geral', tags: '', status: 'draft' },
    ]);
    // O arquivo exportado MANTÉM a proteção.
    expect(csv).toContain("'+Oferta");
    expect(csv).toContain("'=Total");

    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].raw.name).toBe('+Oferta');
    expect(r.rows[0].raw.content).toBe('- Olá!\n- Tudo bem?');
    expect(r.rows[1].raw.name).toBe('=Total');
    expect(r.rows[1].raw.content).toBe('@mencao');
  });

  it('o nome reimportado volta a ser reconhecido como conflito', () => {
    const csv = serializeTemplatesToCsv([
      { name: '+Oferta', content: 'Promo', category: 'geral', tags: '', status: 'draft' },
    ]);
    const r = parseTemplateFile(csv, 'csv', new Set(['+Oferta']));
    expect(r.rows[0].isConflict).toBe(true);
  });

  it('apóstrofo de verdade no começo do texto não é comido', () => {
    const csv = serializeTemplatesToCsv([
      { name: "'Aspas", content: "'Olá", category: 'geral', tags: '', status: 'draft' },
    ]);
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows[0].raw.name).toBe("'Aspas");
    expect(r.rows[0].raw.content).toBe("'Olá");
  });

  /**
   * Rodada 3 da revisão: o caso acima usa `'Olá` — a letra `O` não é caractere
   * de fórmula, então ele NÃO cobria apóstrofo literal seguido de `-`, `+`, `=`
   * ou `@`. Era o buraco exato do teste, e o defeito estava lá.
   */
  it('apóstrofo literal seguido de caractere de fórmula sobrevive à ida e volta', () => {
    const originais = ["'- Olá!", "'+Oferta", "'=Total", "'@mencao", "''ja dobrado"];
    const csv = serializeTemplatesToCsv(
      originais.map((v, i) => ({ name: `t${i}${v}`, content: v, category: 'geral', tags: '', status: 'draft' })),
    );
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows).toHaveLength(originais.length);
    originais.forEach((v, i) => {
      expect(r.rows[i].raw.content).toBe(v);
    });
  });

  it('CSV de fora: apóstrofo inicial antes de caractere de fórmula é lido como proteção', () => {
    // Convenção do Excel, e a única leitura possível sem metadado no arquivo.
    const r = parseTemplateFile("name;content\n'+Oferta;'- Olá", 'csv', NO_CONFLICTS);
    expect(r.rows[0].raw.name).toBe('+Oferta');
    expect(r.rows[0].raw.content).toBe('- Olá');
  });
});

/**
 * Rodada 4 da revisão.
 */
describe('X093 · limites e espacos vindos do banco', () => {
  it('nome com mais de 200 caracteres é recusado pelo parser, não pelo banco', () => {
    const nome = 'a'.repeat(201);
    const r = parseTemplateFile(`[{"name":"${nome}","content":"Oi"}]`, 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.map((i) => i.field)).toContain('name');
    // 200 passa: é o limite do trigger validate_talkx_template_input.
    const ok = parseTemplateFile(`[{"name":"${'a'.repeat(200)}","content":"Oi"}]`, 'json', NO_CONFLICTS);
    expect(ok.rows[0].issues).toHaveLength(0);
  });

  it('espaço nas pontas do conteúdo sobrevive a exportar e importar', () => {
    const csv = serializeTemplatesToCsv([
      { name: 'Saudação', content: '  Olá  ', category: 'geral', tags: '', status: 'draft' },
    ]);
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(r.rows[0].raw.content).toBe('  Olá  ');
  });

  it('nome existente com espaço ao redor É reconhecido como conflito', () => {
    // O conjunto de nomes existentes do diálogo normaliza igual ao parser; aqui o
    // teste cobre o lado do parser, que é quem decide `isConflict`.
    const r = parseTemplateFile('[{"name":"Oferta","content":"Promo"}]', 'json', new Set([' Oferta '.trim()]));
    expect(r.rows[0].isConflict).toBe(true);
  });
});

/**
 * Rodada 5: o limite tem de contar como o Postgres conta. `length()` do
 * Postgres conta pontos de código; `.length` do JavaScript conta unidades
 * UTF-16, e um emoji vale 2 — então um nome que o banco aceita era barrado
 * aqui, inclusive vindo de uma exportação da própria biblioteca.
 */
describe('X093 · limite do nome conta ponto de codigo, nao unidade UTF-16', () => {
  it('199 letras + 1 emoji = 200 pontos de código: passa', () => {
    const nome = 'a'.repeat(199) + '🚀';
    expect(nome.length).toBe(201);            // UTF-16
    expect(Array.from(nome).length).toBe(200); // pontos de código, como o banco
    const r = parseTemplateFile(JSON.stringify([{ name: nome, content: 'Oi' }]), 'json', NO_CONFLICTS);
    expect(r.rows[0].issues).toHaveLength(0);
  });

  it('200 letras + 1 emoji = 201 pontos de código: recusa', () => {
    const nome = 'a'.repeat(200) + '🚀';
    const r = parseTemplateFile(JSON.stringify([{ name: nome, content: 'Oi' }]), 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.map((i) => i.field)).toContain('name');
    expect(r.rows[0].issues[0].message).toContain('201');
  });
});

/**
 * Rodada 6: a lista de tags era `join(',')` na ida e `split(',')` na volta, e o
 * editor aceita tag com vírgula dentro — então `black, friday` saía como UMA
 * tag e voltava como DUAS, mudando a classificação do template sozinha.
 */
describe('X093 · tags com virgula sobrevivem a ida e volta', () => {
  it('serializar e desserializar é reversível', () => {
    const casos: string[][] = [
      ['black, friday'],
      ['promo', 'black, friday', 'natal'],
      ['com\\barra'],
      ['vírgula, e \\barra'],
      [],
    ];
    for (const tags of casos) {
      expect(desserializarTags(serializarTags(tags))).toEqual(tags);
    }
  });

  it('tag simples continua separada por vírgula, como antes', () => {
    expect(desserializarTags('promo,natal')).toEqual(['promo', 'natal']);
    expect(desserializarTags(' promo , natal ')).toEqual(['promo', 'natal']);
    expect(serializarTags(['promo', 'natal'])).toBe('promo,natal');
  });

  it('CSV: tag com vírgula não vira duas na reimportação', () => {
    const csv = serializeTemplatesToCsv([
      { name: 'Oferta', content: 'Promo', category: 'geral', tags: serializarTags(['black, friday', 'natal']), status: 'draft' },
    ]);
    const r = parseTemplateFile(csv, 'csv', NO_CONFLICTS);
    expect(desserializarTags(r.rows[0].raw.tags)).toEqual(['black, friday', 'natal']);
  });
});

/**
 * Rodada 7: aspas abertas no fim do arquivo. O tokenizador fechava o registro
 * e aceitava o conteúdo, então um CSV truncado virava UM template cuja mensagem
 * engolia os registros seguintes — e "Sobrescrever" salvava isso no lugar do
 * template existente.
 */
describe('X093 · CSV mal formado e recusado, nao aceito pela metade', () => {
  it('campo entre aspas sem fechar recusa o arquivo', () => {
    const r = parseTemplateFile('name;content\nOferta;"Olá\nOutra;Mensagem', 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeTruthy();
    expect(r.fatalError).toMatch(/aspas/i);
    expect(r.rows).toHaveLength(0);
  });

  it('aspas fechadas corretamente continuam valendo, com quebra de linha dentro', () => {
    const r = parseTemplateFile('name;content\nOferta;"Olá\nTudo bem?"\nOutra;Mensagem', 'csv', NO_CONFLICTS);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].raw.content).toBe('Olá\nTudo bem?');
    expect(r.rows[1].raw.name).toBe('Outra');
  });
});

/**
 * Rodada 8: a desserialização de tags tratava QUALQUER caractere depois da
 * barra como escapado, então um arquivo de fora com `vendas\varejo` perdia a
 * barra. Só `\\` e `\,` são escapes nossos.
 */
describe('X093 · barra invertida de arquivo externo sobrevive', () => {
  it('tag de fora com barra simples mantém a barra', () => {
    expect(desserializarTags('vendas\\varejo')).toEqual(['vendas\\varejo']);
    expect(desserializarTags('a\\b,c\\d')).toEqual(['a\\b', 'c\\d']);
  });

  it('os escapes nossos continuam sendo desfeitos', () => {
    expect(desserializarTags('black\\, friday')).toEqual(['black, friday']);
    expect(desserializarTags('com\\\\barra')).toEqual(['com\\barra']);
  });

  it('ida e volta continua exata para os casos com barra', () => {
    for (const tags of [['com\\barra'], ['vendas\\varejo', 'black, friday'], ['\\'], ['a\\\\b']]) {
      expect(desserializarTags(serializarTags(tags))).toEqual(tags);
    }
  });
});

/**
 * Rodada 9: "Criar cópia" somava ` (cópia)` a um nome JÁ validado em 200, então
 * um nome de 200 chegava com 208 ao INSERT e o trigger recusava — a linha
 * aparecia válida no diálogo e falhava na gravação.
 */
describe('X093 · nome da copia cabe no limite do banco', () => {
  it('nome de 200 vira cópia de exatamente 200', () => {
    const copia = nomeDeCopia('a'.repeat(200));
    expect(Array.from(copia).length).toBe(TEMPLATE_NAME_MAX);
    expect(copia.endsWith(' (cópia)')).toBe(true);
  });

  it('nome curto não é cortado', () => {
    expect(nomeDeCopia('Oferta')).toBe('Oferta (cópia)');
    expect(nomeDeCopia('  Oferta  ')).toBe('Oferta (cópia)');
  });

  it('corta por ponto de código, não por unidade UTF-16', () => {
    const copia = nomeDeCopia('🚀'.repeat(200));
    expect(Array.from(copia).length).toBe(TEMPLATE_NAME_MAX);
  });
});

/**
 * Rodada 10: o parser só checava se o conteúdo estava vazio, mas o trigger
 * `validate_talkx_template_input` recusa `length(content)` fora de 1..65536 e
 * `length(description) > 4000`. O usuário confirmava uma importação que ia
 * falhar e só recebia a contagem de erros depois. A descrição tinha o mesmo
 * buraco e não foi apontada — entra junto, é a mesma função e o mesmo trigger.
 */
describe('X093 · limites de conteudo e descricao batem com o banco', () => {
  it('conteúdo de 65536 passa; 65537 recusa', () => {
    const ok = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'a'.repeat(TEMPLATE_CONTENT_MAX) }]), 'json', NO_CONFLICTS);
    expect(ok.rows[0].issues).toHaveLength(0);

    const nao = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'a'.repeat(TEMPLATE_CONTENT_MAX + 1) }]), 'json', NO_CONFLICTS);
    expect(nao.rows[0].issues.map((i) => i.field)).toContain('content');
  });

  it('descrição de 4000 passa; 4001 recusa', () => {
    const ok = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', description: 'd'.repeat(TEMPLATE_DESCRIPTION_MAX) }]), 'json', NO_CONFLICTS);
    expect(ok.rows[0].issues).toHaveLength(0);

    const nao = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', description: 'd'.repeat(TEMPLATE_DESCRIPTION_MAX + 1) }]), 'json', NO_CONFLICTS);
    expect(nao.rows[0].issues.map((i) => i.field)).toContain('description');
  });

  it('conteúdo é contado SEM trim, como o trigger conta', () => {
    // O trigger usa length(NEW.content), sem btrim — só o nome passa por btrim.
    const v = ' '.repeat(10) + 'a'.repeat(TEMPLATE_CONTENT_MAX - 5);
    const r = parseTemplateFile(JSON.stringify([{ name: 'T', content: v }]), 'json', NO_CONFLICTS);
    expect(r.rows[0].issues.map((i) => i.field)).toContain('content');
  });
});

/**
 * Achado da revisao da PR #3175 (Codex P2 e Devin): o parser nao olhava as tags
 * e o dialogo tratava como bloqueante so `name` e `content`. Tag de 65
 * caracteres, 51 tags, descricao de 4001 e status invalido apareciam em
 * vermelho mas a linha ficava "Ok" e ia para a gravacao, recusada pelo banco.
 */
describe('X093 · limites de tags batem com o trigger do banco', () => {
  it(`${TEMPLATE_TAGS_MAX} tags passam; ${TEMPLATE_TAGS_MAX + 1} recusa`, () => {
    const ok = Array.from({ length: TEMPLATE_TAGS_MAX }, (_, i) => `t${i}`);
    const r1 = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', tags: serializarTags(ok) }]), 'json', NO_CONFLICTS);
    expect(r1.rows[0].issues).toHaveLength(0);

    const demais = Array.from({ length: TEMPLATE_TAGS_MAX + 1 }, (_, i) => `t${i}`);
    const r2 = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', tags: serializarTags(demais) }]), 'json', NO_CONFLICTS);
    expect(r2.rows[0].issues.map((i) => i.field)).toContain('tags');
  });

  it(`tag de ${TEMPLATE_TAG_MAX} passa; de ${TEMPLATE_TAG_MAX + 1} recusa`, () => {
    const r1 = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', tags: 'a'.repeat(TEMPLATE_TAG_MAX) }]), 'json', NO_CONFLICTS);
    expect(r1.rows[0].issues).toHaveLength(0);

    const r2 = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', tags: 'a'.repeat(TEMPLATE_TAG_MAX + 1) }]), 'json', NO_CONFLICTS);
    expect(r2.rows[0].issues.map((i) => i.field)).toContain('tags');
  });

  it('tag longa e contada em ponto de codigo, como o length() do Postgres', () => {
    // 64 foguetes: 64 para o banco, 128 para o `.length` do JavaScript.
    const r = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', tags: '🚀'.repeat(TEMPLATE_TAG_MAX) }]), 'json', NO_CONFLICTS);
    expect(r.rows[0].issues).toHaveLength(0);
  });
});

describe('X093 · o que o banco recusa bloqueia a linha', () => {
  const bloqueia = (campos: Record<string, unknown>) => {
    const r = parseTemplateFile(JSON.stringify([{ name: 'T', content: 'Oi', ...campos }]), 'json', NO_CONFLICTS);
    return linhaBloqueada(r.rows[0]);
  };

  it('descricao acima do limite bloqueia', () => {
    expect(bloqueia({ description: 'd'.repeat(TEMPLATE_DESCRIPTION_MAX + 1) })).toBe(true);
    expect(bloqueia({ description: 'd'.repeat(TEMPLATE_DESCRIPTION_MAX) })).toBe(false);
  });

  it('status fora de draft/review/approved bloqueia', () => {
    expect(bloqueia({ status: 'pendente' })).toBe(true);
    expect(bloqueia({ status: 'approved' })).toBe(false);
  });

  it('tags fora do limite bloqueiam', () => {
    expect(bloqueia({ tags: 'a'.repeat(TEMPLATE_TAG_MAX + 1) })).toBe(true);
  });

  it('linha sem problema nenhum nao bloqueia', () => {
    expect(bloqueia({})).toBe(false);
  });
});
