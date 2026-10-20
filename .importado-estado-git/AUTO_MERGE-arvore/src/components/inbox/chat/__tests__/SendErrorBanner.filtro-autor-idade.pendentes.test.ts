/**
 * SendErrorBanner · filtro por autor e idade — REGISTRO DAS PROVAS PENDENTES.
 *
 * Dono da correção: PK-23 (iris). Hoje `SendErrorBanner.tsx` filtra só
 * `sender === 'agent'` (qualquer atendente) e nenhuma data, e 'Enviar de novo'
 * reenvia o texto da ÚLTIMA falha — com o varredor do PD-78 e os cartões de
 * reenvio (R1/R2), um atendente pode reenviar ao cliente um texto antigo de
 * outro. Enquanto PK-23 não integrar, um teste aqui só provaria o defeito, então
 * a prova fica como pendência explícita (ver `area-testes-do-produto`).
 *
 * Os testes de comportamento VIGENTE do banner vivem em `SendErrorBanner.test.tsx`
 * — este arquivo não os duplica.
 */
import { describe, it } from 'vitest';

describe('SendErrorBanner · filtro por autor e idade (provas pendentes)', () => {
  it.todo('PK-23: falha de outro atendente não entra no contador nem no reenvio do usuário atual');
  it.todo('PK-23: falha com mais de 24 h aparece como "Falha antiga", sem botão de reenvio automático');
  it.todo('PK-23: "Enviar de novo" reenvia a falha escolhida (não a última) e pede confirmação acima de 1 h');
});
