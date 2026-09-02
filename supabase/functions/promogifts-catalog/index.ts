import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";

const jsonRes = (body: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : getCorsHeaders()), "Content-Type": "application/json" },
  });

// ─── Input Schemas ────────────────────────────────────────────
const ALLOWED_ORDER_FIELDS = ["name", "sale_price", "stock_quantity", "brand", "created_at", "sku"] as const;

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
}).default({});

const GetProductSchema = z.object({
  product_id: z.string().uuid("product_id must be a valid UUID"),
});

const ActionSchema = z.object({
  action: z.enum(["list_products", "get_product", "list_categories", "list_suppliers"]),
  params: z.record(z.unknown()).optional().default({}),
});

function sanitizeSearch(input: string): string {
  return input.replace(/[%_.\\()]/g, "").trim().slice(0, 100);
}

const PRODUCT_FIELDS = `id, name, description, short_description, sku, sale_price, suggested_price,
  stock_quantity, primary_image_url, colors, brand, origin_country, min_quantity,
  dimensions_display, weight_g, combined_sizes, product_type, is_kit, is_active,
  is_stockout, allows_personalization, lead_time_days, supply_mode,
  category_id, supplier_id, slug, capacity_ml, ncm_code,
  categories:category_id(id, name, slug, parent_id),
  suppliers:supplier_id(id, name)`;

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
      const { search, category_id, supplier_id, limit, offset, order_by, ascending, only_active, only_in_stock } = paramsParse.data;

      let query = extClient.from("products").select(PRODUCT_FIELDS, { count: "exact" });
      if (only_active) query = query.eq("is_active", true);
      if (only_in_stock) query = query.eq("is_stockout", false);
      if (category_id) query = query.eq("category_id", category_id);
      if (supplier_id) query = query.eq("supplier_id", supplier_id);
      if (search) {
        const safe = sanitizeSearch(search);
        if (safe.length > 0) query = query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`);
      }
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

    return jsonRes({ error: "Invalid action" }, 400, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Error", { error: msg });
    return jsonRes({ error: "Internal catalog error", code: "CATALOG_INTERNAL_ERROR" }, 500, req);
  }
});
