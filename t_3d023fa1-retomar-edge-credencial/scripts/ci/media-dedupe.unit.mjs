import assert from "node:assert/strict";
import test from "node:test";
// ── Guarda de regressao: midia do WhatsApp nao pode duplicar no Storage ──
// Em 25/09/2026 o bucket whatsapp-media tinha 9.712 arquivos / 7,3 GB, sendo
// 4.248 midias duplicadas (ate 10 copias da mesma) e ~3,4 GB de lixo. Causa: o
// nome do arquivo levava `_${Date.now()}`, entao cada reentrega do webhook da
// Evolution (mesmo key.id) gravava um arquivo NOVO; a mensagem era deduplicada
// pelo ON CONFLICT, o objeto antigo virava orfao. O nome tem que ser
// deterministico e o upload tem que ser upsert.
// Le o fonte porque o caminho depende de Deno/fetch: o que importa e a forma.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const mediaSrc = read("supabase/functions/_shared/evolution-media.ts");
const webhookSrc = read("supabase/functions/_shared/evolution-webhook-messages.ts");
const migrateSrc = read("supabase/functions/migrate-media-storage/index.ts");

const NOME_COM_TIMESTAMP = /\$\{messageType\}\/\$\{safeId\}_\$\{Date\.now\(\)\}/;
const NOME_DETERMINISTICO = /`\$\{messageType\}\/\$\{safeId\}\.\$\{ext\}`/g;

test("evolution-media: nome do arquivo e deterministico (sem Date.now)", () => {
  assert.doesNotMatch(mediaSrc, NOME_COM_TIMESTAMP,
    "voltou o carimbo de hora no nome: cada reentrega do webhook vira um arquivo novo e orfao");
  // os dois caminhos de persistencia: download por CDN e base64 do webhook
  assert.equal((mediaSrc.match(NOME_DETERMINISTICO) || []).length, 2,
    "esperava 2 nomes deterministicos (persistMediaToStorage e persistBase64Media)");
});

test("evolution-media: os dois uploads sao upsert", () => {
  // sem upsert, o nome fixo faria o retry falhar com 409 em vez de reaproveitar
  assert.equal((mediaSrc.match(/upsert: true/g) || []).length, 2,
    "todo upload de midia precisa de upsert: true para o retry sobrescrever a mesma chave");
});

test("stickers: nome deterministico e upload com upsert", () => {
  assert.doesNotMatch(webhookSrc, /sticker_\$\{Date\.now\(\)\}/,
    "sticker voltou a usar Date.now() no nome: duplica a cada reentrega");
  assert.equal((webhookSrc.match(/`sticker_\$\{key\.id\.replace\(\/\[\^a-zA-Z0-9\]\/g, ''\)\}\.webp`/g) || []).length, 2,
    "esperava 2 nomes de sticker deterministicos");
  assert.equal(
    (webhookSrc.match(/contentType: 'image\/webp', cacheControl: '31536000', upsert: true/g) || []).length, 2,
    "os 2 uploads de sticker precisam de upsert: true");
});

test("migrate-media-storage: idempotente (rodar de novo nao duplica)", () => {
  assert.doesNotMatch(migrateSrc, NOME_COM_TIMESTAMP);
  assert.ok(new RegExp(NOME_DETERMINISTICO.source).test(migrateSrc), "migrate-media-storage sem nome deterministico");
  assert.match(migrateSrc, /upsert: true/);
});

test("regra do nome: mesma mensagem entregue 2x gera a mesma chave", () => {
  // replica a expressao usada no fonte, para documentar a invariante
  const nome = (messageType, messageId, ext) =>
    `${messageType}/${messageId.replace(/[^a-zA-Z0-9]/g, "")}.${ext}`;
  const id = "3EB0761E3D7A43BBA64F8D";
  assert.equal(nome("image", id, "jpg"), nome("image", id, "jpg"));
  assert.equal(nome("image", id, "jpg"), "image/3EB0761E3D7A43BBA64F8D.jpg");
  // tipos diferentes nao colidem
  assert.notEqual(nome("image", id, "jpg"), nome("video", id, "jpg"));
});
