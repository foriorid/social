import assert from "node:assert/strict";
import { test } from "node:test";
import { applyClientAction, DeliveryError, groupBySection, newGallery, photosFrom, setPhase, slugify, uniqueSlug, withFolder, type Gallery } from "../../supabase/functions/gallery/delivery.ts";

let n = 0;
const id = () => `id${++n}`;
const base = (over: Partial<Gallery> = {}): Gallery => ({ ...withFolder(newGallery({ id: "g1", slug: "villa", title: "Villa", selectionLimit: 2 }, new Date("2026-11-12T00:00:00Z")), "preview", "url", [{ id: "a" }, { id: "b" }, { id: "c" }]), ...over });

test("slug helpers", () => {
  assert.equal(slugify("Nagomi House — Ubud!"), "nagomi-house-ubud");
  assert.equal(slugify("   "), "galeri");
  assert.equal(uniqueSlug("villa", ["villa", "villa-2"]), "villa-3");
});

test("new gallery defaults deadlines", () => {
  const g = base();
  assert.equal(g.phase, "Preview");
  assert.equal(g.selectByDate, "2026-11-19");
  assert.equal(g.downloadExpiry, "2026-12-12");
});

test("selection respects quota, and Edit/RAW are exclusive", () => {
  let g = applyClientAction(base(), { action: "photo", photoId: "a", selected: true }, id);
  g = applyClientAction(g, { action: "photo", photoId: "b", selected: true }, id);
  assert.throws(() => applyClientAction(g, { action: "photo", photoId: "c", selected: true }, id), (e: DeliveryError) => e.code === "limit");
  g = applyClientAction(g, { action: "photo", photoId: "a", rawSelected: true }, id);
  assert.deepEqual(g.previewPhotos.map(p => [p.selected, p.rawSelected]), [[false, true], [true, false], [false, false]]);
});

test("reloading the preview folder keeps picks and notes", () => {
  const g = applyClientAction(base(), { action: "photo", photoId: "b", selected: true, note: "cerahkan" }, id);
  const again = photosFrom([{ id: "b" }, { id: "d", section: "Lobby" }], g.previewPhotos);
  assert.equal(again[0].selected, true); assert.equal(again[0].note, "cerahkan"); assert.equal(again[1].section, "Lobby");
});

test("submit flow with and without RAW", () => {
  assert.equal(applyClientAction(base(), { action: "submit" }, id).phase, "Client Selection");
  const raw = applyClientAction(base({ rawSelectionLimit: 3 }), { action: "submit" }, id);
  assert.equal(raw.phase, "Preview");
  assert.throws(() => applyClientAction(base(), { action: "submit-raw" }, id));
  assert.equal(applyClientAction(raw, { action: "submit-raw" }, id).phase, "Client Selection");
  assert.throws(() => applyClientAction(raw, { action: "photo", photoId: "a", selected: true }, id), (e: DeliveryError) => e.code === "locked");
});

test("addon raises quota, custom removes it", () => {
  assert.equal(applyClientAction(base(), { action: "addon", photos: 10 }, id).selectionLimit, 12);
  assert.equal(applyClientAction(base(), { action: "addon", custom: true }, id).selectionLimit, 0);
  assert.throws(() => applyClientAction(base(), { action: "addon", photos: 7 }, id));
});

test("revision captures photo notes, approve finishes, reopen clears submit", () => {
  let g = withFolder(base({ phase: "Client Review" }), "draft", "d", [{ id: "x", name: "Lobby.jpg" }]);
  g = applyClientAction(g, { action: "draft-note", photoId: "x", note: "lebih hangat" }, id);
  g = applyClientAction(g, { action: "revision", text: "umum" }, id);
  assert.equal(g.phase, "Revision"); assert.deepEqual(g.revisions[0].photoNotes, [{ name: "Lobby.jpg", note: "lebih hangat" }]);
  g = applyClientAction(g, { action: "approve" }, id);
  assert.equal(g.phase, "Done");
  const reopened = setPhase({ ...g, previewSubmittedAt: "x", rawSubmittedAt: "y" }, "Preview");
  assert.equal(reopened.previewSubmittedAt, null);
  assert.equal(setPhase(g, "bogus").phase, "Preview");
});

test("groupBySection keeps order", () => {
  const groups = groupBySection(photosFrom([{ id: "1", section: "A" }, { id: "2", section: "B" }, { id: "3", section: "A" }]));
  assert.deepEqual(groups.map(x => [x.section, x.items.length]), [["A", 2], ["B", 1]]);
});
