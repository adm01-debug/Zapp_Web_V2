/**
 * Contrato: todo e-mail sai do domínio verificado do projeto.
 *
 * Motivo: remetente em domínio de teste/terceiro não entrega — o Resend só envia de domínio
 * verificado, e `@resend.dev` é domínio de teste que **só entrega para o dono da conta** (alerta
 * de segurança que nunca chega) — e sobrou resíduo de hospedagem antiga no meio.
 *
 * Este contrato quebra se alguém reintroduzir remetente fora do projeto (inclusive via `from`
 * vindo do corpo da requisição, que permite disparo com remetente arbitrário).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..', '..');
const FUNCOES = resolve(RAIZ, 'supabase', 'functions');

/** Domínios que o projeto controla e já verificou no provedor de e-mail. */
const DOMINIOS_PERMITIDOS = ['promobrindes.com.br'];

function arquivosTs(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = resolve(dir, nome);
    if (statSync(caminho).isDirectory()) {
      acc.push(...arquivosTs(caminho));
      continue;
    }
    if (nome.endsWith('.ts')) acc.push(caminho);
  }
  return acc;
}

const ARQUIVOS = arquivosTs(FUNCOES);

describe('contrato: remetente de e-mail sempre no domínio do projeto', () => {
  it('nenhuma função cita domínio de teste ou de terceiro', () => {
    const infratores: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const src = readFileSync(arquivo, 'utf8');
      for (const proibido of ['resend.dev', 'lovable.app', '@zapp.com']) {
        if (src.includes(proibido)) infratores.push(`${arquivo} -> ${proibido}`);
      }
    }

    expect(infratores).toEqual([]);
  });

  it('todo `from:` literal usa um domínio permitido', () => {
    const ruins: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const src = readFileSync(arquivo, 'utf8');
      for (const achado of src.matchAll(/from:\s*["']([^"']*@[^"'\s>]+)/g)) {
        const dominio = achado[1].split('@')[1];
        if (!DOMINIOS_PERMITIDOS.includes(dominio)) ruins.push(`${arquivo} -> ${dominio}`);
      }
    }

    expect(ruins).toEqual([]);
  });

  it('o send-email não deixa o corpo da requisição escolher o remetente', () => {
    const src = readFileSync(resolve(FUNCOES, 'send-email', 'index.ts'), 'utf8');

    expect(src).not.toMatch(/from:\s*body\.from/);
    expect(src).toMatch(/from:\s*"ZAPP System <noreply@promobrindes\.com\.br>"/);
  });

  it('as funções de alerta usam os endereços já verificados do projeto', () => {
    const esperados: Array<[string, string]> = [
      ['sentiment-alert', 'alertas@promobrindes.com.br'],
      ['connection-health-check', 'alertas@promobrindes.com.br'],
      ['send-scheduled-report', 'relatorios@promobrindes.com.br'],
      ['talkx-report', 'relatorios@promobrindes.com.br'],
      ['detect-new-device', 'seguranca@promobrindes.com.br'],
    ];

    for (const [funcao, endereco] of esperados) {
      const src = readFileSync(resolve(FUNCOES, funcao, 'index.ts'), 'utf8');
      expect(src, `${funcao} deve enviar de ${endereco}`).toContain(endereco);
    }
  });
});
