import assert from "node:assert/strict";
import { test } from "node:test";
import { addHours, dayOf, emailOf, eventBody, fromGoogle, peekState, readState, signState } from "../../supabase/functions/gcal/gcal.ts";

test("state is signed, expires, and must return to https", async () => {
  const s = await signState({ ws: "w1", uid: "u1", ret: "https://hub.forior.id/" }, "secret", 1000);
  assert.deepEqual(await readState(s, "secret", 2000), { ws: "w1", uid: "u1", ret: "https://hub.forior.id/" });
  assert.equal(await readState(s, "other", 2000), null);
  assert.equal(peekState(s), "w1"); assert.equal(peekState("%%%"), "");
  assert.equal(await readState(s, "secret", 1000 + 11 * 60_000), null);
  assert.equal(await readState(s.replace(/^./, "x"), "secret", 2000), null);
  assert.equal(await readState(await signState({ ws: "w", uid: "u", ret: "javascript:alert(1)" }, "k", 0), "k", 1), null);
});

test("emailOf reads the id_token payload", () => {
  const payload = Buffer.from(JSON.stringify({ email: "foriorproject@gmail.com" })).toString("base64url");
  assert.equal(emailOf(`h.${payload}.s`), "foriorproject@gmail.com");
  assert.equal(emailOf("garbage"), "");
});

test("eventBody: local start + hours, Jakarta zone, crosses midnight, rejects bad dates", () => {
  const b = eventBody({ summary: "Shoot Villa", start: "2026-11-20T22:30", hours: 3, location: "Puncak" });
  assert.deepEqual(b.start, { dateTime: "2026-11-20T22:30:00", timeZone: "Asia/Jakarta" });
  assert.deepEqual(b.end, { dateTime: "2026-11-21T01:30:00", timeZone: "Asia/Jakarta" });
  assert.equal(addHours("2026-12-31T23:00", 1.5), "2027-01-01T00:30");
  assert.throws(() => eventBody({ summary: "x", start: "besok", hours: 2 }));
  assert.equal(eventBody({ summary: "", start: "2026-11-20T10:00", hours: 0 }).end.dateTime, "2026-11-20T12:00:00"); // empty duration → 2 hours
  assert.equal(eventBody({ summary: "", start: "2026-11-20T10:00", hours: 0.1 }).end.dateTime, "2026-11-20T10:30:00"); // at least 30 minutes
});

test("fromGoogle maps timed and all-day events, drops cancelled", () => {
  const acct = { id: "a1", email: "foriorid@gmail.com", color: "#16a36a" };
  const t = fromGoogle({ id: "e1", summary: "Meeting", start: { dateTime: "2026-11-20T09:00:00+07:00" }, end: { dateTime: "2026-11-20T10:00:00+07:00" }, htmlLink: "https://g/e1" }, acct)!;
  assert.equal(t.allDay, false); assert.equal(t.email, "foriorid@gmail.com");
  assert.equal(fromGoogle({ id: "e2", start: { date: "2026-11-21" }, end: { date: "2026-11-22" } }, acct)!.allDay, true);
  assert.equal(fromGoogle({ id: "e3", status: "cancelled" }, acct), null);
});

test("dayOf uses Jakarta local day", () => {
  assert.equal(dayOf("2026-11-20T23:30:00Z"), "2026-11-21");
  assert.equal(dayOf("2026-11-21"), "2026-11-21");
});

test("guests become attendees: valid, unique, lowercase, max 10", async () => {
  const { eventBody } = await import("../../supabase/functions/gcal/gcal.ts");
  const b = eventBody({ summary: "x", start: "2026-11-20T10:00", hours: 2, guests: ["Rina@Mail.com", "rina@mail.com", "bukan-email", " "] });
  assert.deepEqual(b.attendees, [{ email: "rina@mail.com" }]);
  assert.ok(!("attendees" in eventBody({ summary: "x", start: "2026-11-20T10:00", hours: 2 })));
});

test("fromGoogle keeps readable description, Meet link and guest count", async () => {
  const { fromGoogle } = await import("../../supabase/functions/gcal/gcal.ts");
  const e = fromGoogle({ id: "e9", summary: "Shoot", start: { dateTime: "2026-11-20T10:00:00+07:00" }, end: { dateTime: "2026-11-20T12:00:00+07:00" }, description: "Bawa <b>lampu</b><br>Parkir &amp; akses", hangoutLink: "https://meet.google.com/abc", attendees: [{ email: "a@b.co" }, { email: "c@d.co" }] }, { id: "a", email: "x@y.z", color: "#000000" })!;
  assert.equal(e.description, "Bawa lampu\nParkir & akses");
  assert.equal(e.meet, "https://meet.google.com/abc");
  assert.equal(e.guests, 2);
});
