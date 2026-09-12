import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";

const jsonRes = (body: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : getCorsHeaders()), "Content-Type": "application/json" },
  });

// ─── Input Schemas ────────────────────────────────────────────
const ALLOWED_ORDER_FIELDS = ["name", "sale_price", "stock_quantity", "brand", "created_at", "sku", "order_count"] as const;

/**
 * Equivalente em JS do unaccent() do Postgres, para casar com o gatilho
 * products_search_vector_update (que aplica unaccent() ANTES do
 * to_tsvector): sem isso, buscar "açucareiro" gera o léxico 'açucareir',
 * que não bate com o 'acucareir' armazenado no vetor. Confirmado via SQL
 * direto contra o banco: websearch_to_tsquery('portuguese','açucareiro')
 * e a versão sem acento produzem lexemas diferentes.
 */
function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const ListProductsSchema = z.object({
  search: z.string().max(200).optional(),
  category_id: z.string().uuid().optional(),
  supplier_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  order_by: z.enum(ALLOWED_ORDER_FIELDS).default("name"),
  ascending: z.boolean().default(true),
  only_active: z.boolean().default(true),
  only_in_stock: z.boolean().default(false),
  compact: z.boolean().default(false),
  // E22 — filtros avançados
  is_featured: z.boolean().optional(),
  is_new: z.boolean().optional(),
  is_bestseller: z.boolean().optional(),
  is_kit: z.boolean().optional(),
  allows_personalization: z.boolean().optional(),
  low_stock: z.boolean().optional(), // 1 <= stock_quantity <= 10
  price_min: z.number().min(0).optional(),
  price_max: z.number().min(0).optional(),
  color: z.string().max(60).optional(),
  material: z.string().max(60).optional(),
  has_engraving: z.boolean().optional(),
}).default({});

const GetProductSchema = z.object({
  product_id: z.string().uuid("product_id must be a valid UUID"),
});

const ActionSchema = z.object({
  action: z.enum(["list_products", "get_product", "list_categories", "list_suppliers", "catalog_stats"]),
  params: z.record(z.unknown()).optional().default({}),
});

function sanitizeSearch(input: string): string {
  return input.replace(/[%_.\\()]/g, "").trim().slice(0, 100);
}

/** websearch_to_tsquery aceita frases/aspas/operadores; só limita tamanho. */
function sanitizeFtsQuery(input: string): string {
  return input.trim().slice(0, 100);
}

const PRODUCT_RELATIONS = `categories:category_id(id, name, slug, parent_id),
  suppliers:supplier_id(id, name)`;

// Payload do card (grade/lista): só o que a UI mostra por item.
const PRODUCT_FIELDS_COMPACT = `id, name, short_description, sku, sale_price, suggested_price,
  stock_quantity, primary_image_url, primary_image_fallback_url, colors, brand, min_quantity,
  is_kit, is_active, is_stockout, allows_personalization, lead_time_days,
  is_featured, is_new, is_bestseller, is_on_sale, is_closeout,
  is_featured_expires_at, is_new_expires_at, is_bestseller_expires_at,
  category_id, supplier_id, slug, created_at, last_sync_at,
  ${PRODUCT_RELATIONS}`;

// Payload completo (detalhe, envio e list_products sem compact).
const PRODUCT_FIELDS = `id, name, description, short_description, sku, sale_price, suggested_price,
  stock_quantity, primary_image_url, primary_image_fallback_url, images, colors, color_swatches,
  materials, tags, brand, origin_country, min_quantity,
  dimensions_display, weight_g, combined_sizes, product_type, is_kit, is_active,
  is_stockout, allows_personalization, lead_time_days, supply_mode,
  is_featured, is_new, is_bestseller, is_on_sale, is_closeout, has_gift_box,
  is_featured_expires_at, is_new_expires_at, is_bestseller_expires_at,
  engraving_type, engraving_description, main_category_id,
  order_count, view_count, created_at, updated_at, last_sync_at,
  category_id, supplier_id, slug, capacity_ml, ncm_code,
  ${PRODUCT_RELATIONS}`;

// E24 — cache em memória do isolate (curto: 60s), evita bater no banco a
// cada abertura da tela. Isolates reciclam periodicamente; pior caso é
// só um cache-miss extra, sem risco de dado defasado por muito tempo.
let catalogStatsCache: { data: unknown; expiresAt: number } | null = null;
const CATALOG_STATS_TTL_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

interface ExternalDatabaseError {
  code?: string;
  message?: string;
}

function externalDatabaseErrorResponse(error: ExternalDatabaseError, req: Request, log: Logger) {
  log.error("External catalog query failed", {
    code: error.code || "UNKNOWN",
    message: error.message || "Unknown external database error",
  });
  const permissionFailure = error.code === "42501";
  return jsonRes({
    error: permissionFailure
      ? "Catalog credentials are not authorized for the requested resource"
      : "Catalog database is temporarily unavailable",
    code: permissionFailure ? "CATALOG_CREDENTIALS_INVALID" : "CATALOG_UPSTREAM_ERROR",
  }, 503, req);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger("promogifts-catalog");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401, req);
    }

    const localClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await localClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonRes({ error: "Unauthorized" }, 401, req);
    }

    if (!checkRateLimit(userData.user.id)) {
      return jsonRes({ error: "Too many requests. Try again in 1 minute." }, 429, req);
    }

    const extUrl = Deno.env.get("PROMOGIFTS_SUPABASE_URL");
    // Catalog tables deliberately deny the external anon role. This function
    // is already protected by the canonical user's JWT, rate-limited and
    // read-only, so the cross-project credential belongs only in Edge secrets.
    const extKey = Deno.env.get("PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      return jsonRes({
        error: "External DB not configured",
        code: "CATALOG_NOT_CONFIGURED",
      }, 503, req);
    }
    const extClient = createClient(extUrl, extKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rawBody = await req.json();
    const bodyParse = ActionSchema.safeParse(rawBody);
    if (!bodyParse.success) {
      return jsonRes({ error: "Invalid request", details: bodyParse.error.flatten().fieldErrors }, 400, req);
    }
    const { action, params } = bodyParse.data;
    const startTime = performance.now();

    if (action === "list_products") {
      const paramsParse = ListProductsSchema.safeParse(params);
      if (!paramsParse.success) {
        return jsonRes({ error: "Invalid parameters", details: paramsParse.error.flatten().fieldErrors }, 400, req);
      }
      const {
        search, category_id, supplier_id, limit, offset, order_by, ascending, only_active, only_in_stock, compact,
        is_featured, is_new, is_bestseller, is_kit, allows_personalization, low_stock,
        price_min, price_max, color, material, has_engraving,
      } = paramsParse.data;

      let query = extClient.from("products").select(compact ? PRODUCT_FIELDS_COMPACT : PRODUCT_FIELDS, { count: "exact" });
      if (only_active) query = query.eq("is_active", true);
      if (only_in_stock) query = query.eq("is_stockout", false);
      if (supplier_id) query = query.eq("supplier_id", supplier_id);
      if (category_id) {
        // Categoria + descendentes: path e um caminho materializado por
        // uuid ("/pai/filho/"); o proprio id ja e prefixo do path dos filhos.
        const { data: cat } = await extClient.from("categories").select("path").eq("id", category_id).maybeSingle();
        if (cat?.path) {
          const { data: descendants } = await extClient.from("categories").select("id").like("path", `${cat.path}%`);
          const ids = (descendants || []).map((d: { id: string }) => d.id);
          query = ids.length > 0 ? query.in("category_id", ids) : query.eq("category_id", category_id);
        } else {
          query = query.eq("category_id", category_id);
        }
      }
      if (is_featured) query = query.eq("is_featured", true);
      if (is_new) query = query.eq("is_new", true);
      if (is_bestseller) query = query.eq("is_bestseller", true);
      if (is_kit) query = query.eq("is_kit", true);
      if (allows_personalization) query = query.eq("allows_personalization", true);
      if (low_stock) query = query.gte("stock_quantity", 1).lte("stock_quantity", 10);
      if (price_min != null) query = query.gte("sale_price", price_min);
      if (price_max != null) query = query.lte("sale_price", price_max);
      if (has_engraving) query = query.not("engraving_type", "is", null);
      if (color) {
        // colors e jsonb; a maioria dos itens e string ("BAMBU"), ~4% (XBZ)
        // e objeto {"nome": "..."} - contains cobre os dois formatos, sem
        // ilike direto em jsonb (o Postgres rejeita ilike sem cast em jsonb).
        const safeColor = sanitizeSearch(color).toUpperCase();
        if (safeColor.length > 0) {
          query = query.or(`colors.cs.${JSON.stringify([safeColor])},colors.cs.${JSON.stringify([{ nome: safeColor }])}`);
        }
      }
      if (material) {
        const safeMaterial = sanitizeSearch(material).toUpperCase();
        if (safeMaterial.length > 0) {
          query = query.or(`materials.cs.${JSON.stringify([safeMaterial])},materials.cs.${JSON.stringify([{ nome: safeMaterial }])}`);
        }
      }
      if (search) {
        // FTS real (search_vector, 100% preenchido — trigger BEFORE INSERT
        // OR UPDATE garante isso sempre; sem fallback ilike necessário).
        // unaccent() aplicado ao termo pra casar com o vetor (o gatilho
        // tambem aplica unaccent() antes do to_tsvector).
        const safe = sanitizeFtsQuery(search);
        if (safe.length > 0) {
          query = query.textSearch("search_vector", stripDiacritics(safe), { type: "websearch", config: "portuguese" });
        }
      }
      // NOTA: "relevance" (ordenar por ts_rank_cd) exigiria uma RPC dedicada
      // no banco externo — o PostgREST não ordena por rank num select comum.
      // Fora do escopo desta etapa; order_by continua nas colunas reais.
      query = query.order(order_by, { ascending }).range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) return externalDatabaseErrorResponse(error, req, log);
      const duration = Math.round(performance.now() - startTime);
      return jsonRes({ data, meta: { total: count, duration_ms: duration } }, 200, req);
    }

    if (action === "get_product") {
      const paramsParse = GetProductSchema.safeParse(params);
      if (!paramsParse.success) {
        return jsonRes({ error: "Invalid parameters", details: paramsParse.error.flatten().fieldErrors }, 400, req);
      }
      const { product_id } = paramsParse.data;
      const { data: product, error: productErr } = await extClient
        .from("products").select(PRODUCT_FIELDS).eq("id", product_id).maybeSingle();
      if (productErr) return externalDatabaseErrorResponse(productErr, req, log);
      if (!product) return jsonRes({ error: "Product not found" }, 404, req);

      const { data: variants, error: varErr } = await extClient
        .from("product_variants").select("*").eq("product_id", product_id).eq("is_active", true).order("color_name");
      if (varErr) return externalDatabaseErrorResponse(varErr, req, log);

      const duration = Math.round(performance.now() - startTime);
      return jsonRes({ data: { ...product, variants: variants || [] }, meta: { duration_ms: duration } }, 200, req);
    }

    if (action === "list_categories") {
      const { data, error } = await extClient.from("categories").select("id, name, slug, parent_id").order("name");
      if (error) return externalDatabaseErrorResponse(error, req, log);
      return jsonRes({ data }, 200, req);
    }

    if (action === "list_suppliers") {
      const { data, error } = await extClient.from("suppliers").select("id, name").order("name");
      if (error) return externalDatabaseErrorResponse(error, req, log);
      return jsonRes({ data }, 200, req);
    }

    if (action === "catalog_stats") {
      if (catalogStatsCache && catalogStatsCache.expiresAt > Date.now()) {
        return jsonRes({ data: catalogStatsCache.data, meta: { cached: true } }, 200, req);
      }
      const { data, error } = await extClient.rpc("zapp_catalog_stats");
      if (error) return externalDatabaseErrorResponse(error, req, log);
      catalogStatsCache = { data, expiresAt: Date.now() + CATALOG_STATS_TTL_MS };
      return jsonRes({ data, meta: { cached: false } }, 200, req);
    }

    return jsonRes({ error: "Invalid action" }, 400, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Error", { error: msg });
    return jsonRes({ error: "Internal catalog error", code: "CATALOG_INTERNAL_ERROR" }, 500, req);
  }
});
