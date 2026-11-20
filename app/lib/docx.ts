// Plain text out of a Word .docx (a zip holding word/document.xml), with no dependency: the browser's
// DecompressionStream inflates the one entry we need. Paragraphs become lines; formatting is dropped.

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function docxText(buf: ArrayBuffer): Promise<string> {
  const b = new Uint8Array(buf), v = new DataView(buf);
  // End of central directory: signature 0x06054b50 within the last 64 KB.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("File Word tidak bisa dibaca.");
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  for (let n = 0; n < count && p + 46 <= b.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    if (name === "word/document.xml") {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = b.subarray(start, start + size);
      const xml = new TextDecoder().decode(method === 8 ? await inflateRaw(raw) : raw);
      return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n").trim();
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("Isi dokumen Word tidak ditemukan.");
}
