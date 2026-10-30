import { describe, expect, it } from 'vitest';
import { toContactDisplay } from '../contactDisplay';

/**
 * RD-007 — modelo de exibição do contato.
 *
 * Prova que campo vazio (ausente, só espaços ou o literal 'null') NÃO chega à
 * tela: o modelo devolve `null` e o card/lista omite a linha. O design antigo
 * (`design-comportamento.js`) imprimia 'Empresa não informada', 'Telefone não
 * informado' etc. — este teste trava o comportamento novo.
 */
describe('toContactDisplay', () => {
  it('perfil completo: mostra tudo o que o contato realmente tem', () => {
    const display = toContactDisplay(
      {
        name: 'Ana',
        surname: 'Souza',
        nickname: 'Aninha',
        phone: '5511999992048',
        email: 'ana@empresa.com.br',
        company: 'Acme',
        job_title: 'Gerente',
        contact_type: 'fornecedor',
        created_at: '2026-01-10T12:00:00Z',
        last_message_at: '2026-03-05T12:00:00Z',
      },
      {
        singu: {
          empresa: 'Acme Ltda',
          departamento: 'Compras',
          cargo: 'Diretora',
        },
      },
    );

    expect(display).toEqual({
      nomeCompleto: 'Ana Souza',
      apelido: 'Aninha',
      empresa: 'Acme Ltda',
      departamento: 'Compras',
      cargo: 'Gerente',
      telefone: '+55 (11) 99999-2048',
      email: 'ana@empresa.com.br',
      uf: 'SP',
      regiao: 'São Paulo - SP',
      ultimoContato: 'Último contato em 05 mar 2026',
      tipo: 'Fornecedor',
    });
  });

  it('empresa: companyName (Singu já resolvido) tem prioridade sobre contact.company', () => {
    const display = toContactDisplay(
      { name: 'Eva', company: 'Zapp empresa', contact_type: 'cliente' },
      { companyName: 'Singu empresa' },
    );
    expect(display.empresa).toBe('Singu empresa');
  });

  it('perfil mínimo (só nome e telefone): tudo o mais vira null', () => {
    const display = toContactDisplay({
      name: 'Bruno',
      surname: null,
      nickname: null,
      phone: '11988887777',
      email: null,
      company: null,
      job_title: null,
      contact_type: null,
      created_at: null,
      last_message_at: null,
    });

    expect(display).toEqual({
      nomeCompleto: 'Bruno',
      apelido: null,
      empresa: null,
      departamento: null,
      cargo: null,
      telefone: '+55 (11) 98888-7777',
      email: null,
      uf: 'SP',
      regiao: 'São Paulo - SP',
      ultimoContato: null,
      tipo: 'Cliente',
    });
  });

  it('perfil legado (telefone com 16 dígitos): cai no formatador antigo, sem linha vazia', () => {
    const display = toContactDisplay({
      name: 'Carla',
      phone: '5511999992048123',
      created_at: '2020-06-01T12:00:00Z',
      last_message_at: null,
    });

    expect(display.telefone).toBe('5511999992048123');
    expect(display.uf).toBe('SP');
    expect(display.regiao).toBe('São Paulo - SP');
    // Sem mensagem: cai na data de cadastro (não em 'Não informado').
    expect(display.ultimoContato).toBe('Cadastrado em 01 jun 2020');
  });

  it('campo vazio, só com espaços ou o literal "null" vira null (a tela omite)', () => {
    const display = toContactDisplay({
      name: 'Dora',
      nickname: '   ',
      phone: 'null',
      email: 'null',
      company: '  ',
      job_title: 'null',
      contact_type: '',
      created_at: '',
      last_message_at: null,
    });

    expect(display.nomeCompleto).toBe('Dora');
    expect(display.apelido).toBeNull();
    expect(display.empresa).toBeNull();
    expect(display.departamento).toBeNull();
    expect(display.cargo).toBeNull();
    expect(display.telefone).toBeNull();
    expect(display.email).toBeNull();
    expect(display.ultimoContato).toBeNull();
    // Sem telefone não há região inventada.
    expect(display.uf).toBeNull();
    expect(display.regiao).toBeNull();
    // Tipo vazio cai no padrão do módulo ('Cliente'), nunca em branco.
    expect(display.tipo).toBe('Cliente');
  });

  it('UF só existe quando getRegionFromPhone devolve o sufixo " - XX"; nada é inventado', () => {
    // DDD 10 não existe no mapa: a função devolve 'DDD 10' e NÃO inventamos UF.
    const semMapa = toContactDisplay({ name: 'Fábio', phone: '1099998888' });
    expect(semMapa.uf).toBeNull();
    expect(semMapa.regiao).toBe('DDD 10');

    // Telefone curto demais para localizar: nenhuma região.
    const curto = toContactDisplay({ name: 'Gabi', phone: '1234' });
    expect(curto.uf).toBeNull();
    expect(curto.regiao).toBeNull();
  });
});
