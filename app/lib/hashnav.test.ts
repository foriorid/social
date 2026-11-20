import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, slugOf } from "./hashnav.ts";

test("nav names become stable slugs", () => {
  assert.equal(slugOf("Photo Delivery"), "photo-delivery");
  assert.equal(slugOf("Research & Insight"), "research-and-insight");
  assert.equal(slugOf("Penawaran"), "penawaran");
});

test("only #/ hashes are routes", () => {
  assert.deepEqual(parseRoute("#/penawaran"), { slug: "penawaran", id: null });
  assert.deepEqual(parseRoute("#/photo-delivery/ab%2Fc"), { slug: "photo-delivery", id: "ab/c" });
  assert.deepEqual(parseRoute("#share=xyz"), { slug: "", id: null });
  assert.deepEqual(parseRoute("#access_token=a&type=invite"), { slug: "", id: null });
  assert.deepEqual(parseRoute(""), { slug: "", id: null });
});
