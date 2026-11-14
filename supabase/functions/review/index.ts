// Public API for the Client Review Portal. No login: the client only knows the review token and can only
// approve, ask for revision, or comment (rules in review.ts). verify_jwt is off for this function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.9";
import { applyReview, isToken, ReviewError, type Feedback, type ReviewAction, type ReviewSnapshot } from "./review.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (code: string, error: string, status = 400) => json({ code, error }, status);
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const ACTIONS = new Set(["approve", "approve-all", "revision", "comment"]);

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method", "Gunakan POST.", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("input", "Body harus JSON."); }
  const token = String(body.token ?? "");
  if (!isToken(token)) return fail("not_found", "Link review tidak ditemukan.", 404);
  const action = String(body.action ?? "get");

  try {
    if (action === "get") {
      const [row] = await sql`select snapshot, feedback from public.review_links where token = ${token} and not revoked`;
      return row ? json({ snapshot: row.snapshot, feedback: row.feedback }) : fail("not_found", "Link review tidak ditemukan.", 404);
    }
    if (!ACTIONS.has(action)) return fail("input", "Aksi tidak dikenal.");
    // Row lock so two people reviewing at once never overwrite each other's feedback.
    const result = await sql.begin(async tx => {
      const [row] = await tx`select snapshot, feedback from public.review_links where token = ${token} and not revoked for update`;
      if (!row) throw new ReviewError("not_found", "Link review tidak ditemukan.");
      const feedback = applyReview(row.snapshot as ReviewSnapshot, row.feedback as Feedback, { ...body, action } as ReviewAction, () => crypto.randomUUID());
      await tx`update public.review_links set feedback = ${tx.json(feedback as never)}, updated_at = now() where token = ${token}`;
      return { snapshot: row.snapshot, feedback };
    });
    return json(result);
  } catch (e) {
    if (e instanceof ReviewError) return fail(e.code, e.message, e.code === "not_found" ? 404 : 400);
    console.error(e);
    return fail("server", "Terjadi kesalahan. Coba lagi.", 500);
  }
});
