import assert from "node:assert/strict";
import { test } from "node:test";
import { automationOf, followGateMessage, hits, linkMessage, matchComment, matchDm, openingMessage, parseWebhook, payloadFor, pickReply, plain, signatureOk, validate, wantsLink, type Automation } from "../../supabase/functions/ig-webhook/autodm.ts";
import { createHmac } from "node:crypto";

const base: Automation = { id: "a1", name: "Pricelist", active: true, keywords: ["PRICELIST", "harga"], match_mode: "contains", media_ids: [], dm_keywords: false, public_replies: ["Cek DM ya!"], opening: "Hai {nama}!", button_label: "Kirim pricelist sekarang juga", require_follow: true, follow_prompt: "", follow_button: "", link_message: "Ini dia", link_label: "Buka", link_url: "https://forior.id/pricelist" };

test("keywords match whole words, any case and accents; exact mode needs the whole comment", () => {
  assert.ok(hits(base, "mau pricelist dong kak!!"));
  assert.ok(hits(base, "Hárga?"));
  assert.ok(!hits(base, "pricelistnya"));
  assert.ok(hits({ ...base, match_mode: "exact" }, " pricelist "));
  assert.ok(!hits({ ...base, match_mode: "exact" }, "pricelist dong"));
});

test("comment matching respects active flag and post scope; DM matching needs dm_keywords", () => {
  const off = { ...base, id: "a0", active: false };
  assert.equal(matchComment([off, base], "pricelist", "m1")?.id, "a1");
  assert.equal(matchComment([{ ...base, media_ids: ["m2"] }], "pricelist", "m1"), null);
  assert.equal(matchComment([{ ...base, keywords: [], media_ids: ["m1"] }], "apa saja", "m1")?.id, "a1");
  assert.equal(matchComment([{ ...base, keywords: [] }], "apa saja", "m1"), null); // never reply to every comment everywhere
  assert.equal(matchDm([base], "pricelist"), null);
  assert.equal(matchDm([{ ...base, dm_keywords: true }], "pricelist")?.id, "a1");
});

test("messages: opening has the link button payload, titles capped at 20, link is a web button", () => {
  const o = openingMessage(base, "rina");
  assert.ok("text" in o && o.text === "Hai @rina!");
  assert.ok("text" in o && o.quick_replies![0].title.length <= 20 && automationOf(o.quick_replies![0].payload) === "a1");
  const g = followGateMessage(base);
  assert.ok("text" in g && g.quick_replies![0].title === "Sudah follow");
  const l = linkMessage(base);
  assert.ok("attachment" in l && l.attachment.payload.buttons[0].url === "https://forior.id/pricelist");
  assert.match((plain(l, base) as { text: string }).text, /forior\.id\/pricelist/);
  assert.equal(automationOf("other"), null);
  assert.equal(payloadFor("x"), "FORIOR_LINK:x");
  assert.ok(wantsLink(base, "Sudah Follow"));
  assert.ok(!wantsLink(base, "halo"));
});

test("pickReply and validation", () => {
  assert.equal(pickReply(["a", " ", "b"], 0.99), "b");
  assert.equal(pickReply([" "]), null);
  assert.equal(validate(base), null);
  assert.match(validate({ ...base, link_url: "http://x" })!, /https/);
  assert.match(validate({ ...base, keywords: [] })!, /kata kunci/);
});

test("parseWebhook reads comments, quick replies, postbacks and DMs; skips echoes and own messages", () => {
  const ev = parseWebhook({ object: "instagram", entry: [
    { id: "IG1", changes: [{ field: "comments", value: { id: "c9", text: "pricelist", from: { id: "U1", username: "rina" }, media: { id: "m1" } } }, { field: "mentions", value: { id: "x" } }],
      messaging: [
        { sender: { id: "U1" }, message: { text: "Kirim", quick_reply: { payload: "FORIOR_LINK:a1" } } },
        { sender: { id: "U2" }, postback: { payload: "FORIOR_LINK:a1" } },
        { sender: { id: "U3" }, message: { text: "halo" } },
        { sender: { id: "IG1" }, message: { text: "balasan kita", is_echo: true } }
      ] }
  ] });
  assert.deepEqual(ev.map(e => e.kind), ["comment", "payload", "payload", "dm"]);
  assert.equal(ev[0].kind === "comment" && ev[0].fromUsername, "rina");
  assert.deepEqual(parseWebhook({ object: "page", entry: [] }), []);
});

test("signature check matches Meta's sha256 HMAC", async () => {
  const raw = '{"object":"instagram"}', secret = "s3cret";
  const good = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.ok(await signatureOk(raw, good, secret));
  assert.ok(!(await signatureOk(raw, good, "other")));
  assert.ok(!(await signatureOk(raw, null, secret)));
});
