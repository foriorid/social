// Public API for a client's Photo Delivery page. No login: the client only knows the gallery slug,
// and can only do what the delivery rules allow (pick photos, notes, submit, approve, ask for revision).
// verify_jwt is off for this function; every change goes through applyClientAction.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.9";
import { applyClientAction, DeliveryError, forClient, type ClientAction, type Gallery } from "./delivery.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, error: string, status = 400) => json({ code, error }, status);
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const ACTIONS = new Set(["photo", "draft-note", "revision-note", "addon", "submit", "submit-raw", "approve", "revision"]);

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method", "Gunakan POST.", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("input", "Body harus JSON."); }
  const slug = String(body.slug ?? "").toLowerCase();
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return fail("not_found", "Galeri tidak ditemukan.", 404);
  const action = String(body.action ?? "get");

  try {
    if (action === "get") {
      const [row] = await sql`select data from public.galleries where slug = ${slug}`;
      return row ? json(forClient(row.data as Gallery)) : fail("not_found", "Galeri tidak ditemukan.", 404);
    }
    if (!ACTIONS.has(action)) return fail("input", "Aksi tidak dikenal.");
    // Row lock so two quick taps on different photos never overwrite each other.
    const updated = await sql.begin(async tx => {
      const [row] = await tx`select id, data from public.galleries where slug = ${slug} for update`;
      if (!row) throw new DeliveryError("not_found", "Galeri tidak ditemukan.");
      const next = applyClientAction(row.data as Gallery, { ...body, action } as ClientAction, () => crypto.randomUUID());
      await tx`update public.galleries set data = ${tx.json(next as never)}, updated_at = now() where id = ${row.id}`;
      return next;
    });
    return json(forClient(updated));
  } catch (e) {
    if (e instanceof DeliveryError) return fail(e.code, e.message, e.code === "not_found" ? 404 : 400);
    console.error(e);
    return fail("server", "Terjadi kesalahan. Coba lagi.", 500);
  }
});
