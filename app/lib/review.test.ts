import assert from "node:assert/strict";
import { test } from "node:test";
import { applyReview, isToken, progress, ReviewError, revOf, statusOf, teamReply, type ReviewItem, type ReviewSnapshot } from "../../supabase/functions/review/review.ts";

let n = 0;
const id = () => `c${++n}`;
const mk = (day: number, title: string): ReviewItem => { const x = { day, title, format: "Reels" as const, publishDate: "", cover: "", goal: "", caption: "cap", hashtags: "", cta: "", concept: "", board: [{ label: "A", visual: "v", text: "t", audio: "" }, { label: "B", visual: "v", text: "", audio: "" }] }; return { ...x, rev: revOf(x) }; };
const snap: ReviewSnapshot = { account: "Villa", batch: "Nov", period: "", goal: "", brief: "", cover: "", version: 1, publishedAt: "", items: [mk(1, "Satu"), mk(2, "Dua")] };

test("approve and revision are tied to the content revision", () => {
  let fb = applyReview(snap, {}, { action: "approve", day: 1, name: "Bu Rina" }, id);
  assert.equal(statusOf(snap.items[0], fb["1"]), "approved");
  fb = applyReview(snap, fb, { action: "revision", day: 2, name: "Bu Rina", text: "Ganti musik" }, id);
  assert.equal(statusOf(snap.items[1], fb["2"]), "revision");
  assert.equal(fb["2"].comments[0].text, "Ganti musik");
  assert.deepEqual(progress(snap, fb), { total: 2, approved: 1, revision: 1, review: 0 });
  // the owner edits content 1 and republishes: approval no longer counts
  const edited = { ...snap.items[0], caption: "baru" }; const republished = { ...edited, rev: revOf(edited) };
  assert.equal(statusOf(republished, fb["1"]), "review");
});

test("approve-all only touches what is not approved yet and keeps comments", () => {
  let fb = applyReview(snap, {}, { action: "comment", day: 1, name: "A", text: "bagus", scene: 1 }, id);
  fb = applyReview(snap, fb, { action: "approve-all", name: "A" }, id);
  assert.equal(progress(snap, fb).approved, 2);
  assert.equal(fb["1"].comments[0].scene, 1);
});

test("general notes live on day 0; bad input is refused", () => {
  const fb = applyReview(snap, {}, { action: "comment", day: 0, name: "A", text: "Secara umum oke" }, id);
  assert.equal(fb["0"].comments.length, 1);
  assert.throws(() => applyReview(snap, {}, { action: "approve", day: 9, name: "A" }, id), ReviewError);
  assert.throws(() => applyReview(snap, {}, { action: "comment", day: 1, name: "", text: "x" }, id), /nama/);
  assert.throws(() => applyReview(snap, {}, { action: "revision", day: 1, name: "A", text: "  " }, id), /revisi/);
  assert.throws(() => applyReview(snap, {}, { action: "comment", day: 1, name: "A", text: "x", scene: 5 }, id), /Scene/);
  assert.equal(applyReview(snap, {}, { action: "comment", day: 1, name: "A", text: "x".repeat(3000) }, id)["1"].comments[0].text.length, 1000);
});

test("does not mutate the previous feedback", () => {
  const fb = applyReview(snap, {}, { action: "comment", day: 1, name: "A", text: "satu" }, id);
  const next = applyReview(snap, fb, { action: "comment", day: 1, name: "A", text: "dua" }, id);
  assert.equal(fb["1"].comments.length, 1);
  assert.equal(next["1"].comments.length, 2);
});

test("team reply and token format", () => {
  const fb = teamReply({}, 1, "FORIOR", "Siap, kami revisi", "r1");
  assert.equal(fb["1"].comments[0].team, true);
  assert.ok(isToken("abcdefghijklmnopqrstu1"));
  assert.ok(!isToken("Abc-def"));
});
