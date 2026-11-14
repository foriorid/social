import assert from "node:assert/strict";
import { test } from "node:test";
import { autoFill, keywords, rankFor, sceneWants, stockFile, topTags, usageOf, type StockFile } from "./stock.ts";

const f = (id: string, name: string, mime: string, path: string[]) => stockFile({ id, name, mimeType: mime }, path)!;
const files: StockFile[] = [
  f("p1", "DSC_0012.jpg", "image/jpeg", ["Kolam Renang"]),
  f("p2", "IMG_0040.jpg", "image/jpeg", ["Kolam Renang"]),
  f("k1", "dapur-wide.jpg", "image/jpeg", ["Dapur"]),
  f("b1", "master bedroom.jpg", "image/jpeg", ["Kamar"]),
  f("v1", "drone pool sore.mp4", "video/mp4", ["Video"]),
  f("a1", "ambient.mp3", "audio/mpeg", ["Audio"])
];

test("keywords map Indonesian and English to the same keys and drop camera file noise", () => {
  assert.deepEqual(keywords("Kolam Renang").sort(), ["pool"]);
  assert.ok(keywords("Wide shot area pool & fasad villa").includes("exterior"));
  assert.deepEqual(keywords("DSC_0012"), []);
  assert.ok(stockFile({ id: "x", name: "a.pdf", mimeType: "application/pdf" }, []) === null);
});

test("scenes match by subfolder and file names; videos preferred for Reels", () => {
  const pool = { label: "Pool Area", visual: "Moving shot sepanjang kolam", text: "", audio: "" };
  assert.equal(rankFor(pool, files, true)[0].id, "v1");
  assert.ok(["p1", "p2"].includes(rankFor(pool, files, false)[0].id));
  assert.equal(rankFor({ label: "Kitchen", visual: "Detail dapur", text: "", audio: "" }, files, false)[0].id, "k1");
  assert.ok(!rankFor(pool, files, true).some(x => x.kind === "Audio"));
  assert.deepEqual(sceneWants({ label: "x", visual: "y", text: "", audio: "", tags: ["kamar"] }), ["bedroom"]);
});

test("autoFill never repeats a file within a content and keeps scenes that already have a picture", () => {
  const board = [
    { label: "Pool 1", visual: "kolam renang", text: "", audio: "" },
    { label: "Pool 2", visual: "kolam renang", text: "", audio: "" },
    { label: "Sudah ada", visual: "dapur", text: "", audio: "", image: "keep.jpg" }
  ];
  const { board: out, filled } = autoFill(board, files, false, id => `thumb:${id}`);
  assert.equal(filled, 2);
  assert.notEqual(out[0].assetId, out[1].assetId);
  assert.ok(["p1", "p2"].includes(out[0].assetId!) && ["p1", "p2"].includes(out[1].assetId!));
  assert.equal(out[2].image, "keep.jpg");
  assert.equal(out[0].image, `thumb:${out[0].assetId}`);
});

test("usage across the campaign pushes already-used files down", () => {
  const used = usageOf([{ board: [{ label: "", visual: "", text: "", audio: "", assetId: "p1" }] }]);
  assert.equal(used.p1, 1);
  const { board } = autoFill([{ label: "Pool", visual: "kolam", text: "", audio: "" }], files, false, id => id, used);
  assert.equal(board[0].assetId, "p2");
});

test("topTags counts folder tags", () => {
  assert.equal(topTags(files)[0].tag, "pool");
});

test("specific scenes are served before scenes without keywords; slides prefer photos", () => {
  const fs2: StockFile[] = [
    f("bath", "bathroom.jpg", "image/jpeg", ["Kamar"]),
    f("bed", "master-bedroom.jpg", "image/jpeg", ["Kamar"]),
    f("pool", "DSC_1.jpg", "image/jpeg", ["Kolam Renang"]),
    f("vid", "drone.mp4", "video/mp4", ["Video"])
  ];
  const board = ["Cover", "Kamar", "Kamar mandi", "Dining"].map(label => ({ label, visual: "", text: "", audio: "" }));
  const out = autoFill(board, fs2, false, id => id).board.map(s => s.assetId);
  assert.equal(out[2], "bath");
  assert.equal(out[1], "bed");
  assert.ok(out[0] !== "vid" && out[0] !== undefined);
  assert.equal(out[3], "vid"); // only the video is left; still better than an empty slide
});
