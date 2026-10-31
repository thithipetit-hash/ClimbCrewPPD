const FREE = 0xffffffff;
const END = 0xfffffffe;

function u16(buf, off) { return buf.readUInt16LE(off); }
function u32(buf, off) { return buf.readUInt32LE(off); }

function sector(buf, sectorSize, sid) {
  const start = (sid + 1) * sectorSize;
  return buf.subarray(start, start + sectorSize);
}

function readChain(buf, sectorSize, fat, startSid, maxBytes = Infinity) {
  const parts = [];
  const seen = new Set();
  let sid = startSid >>> 0;
  let total = 0;
  while (sid !== END && sid !== FREE && sid < fat.length && !seen.has(sid) && total < maxBytes) {
    seen.add(sid);
    const part = sector(buf, sectorSize, sid);
    parts.push(part);
    total += part.length;
    sid = fat[sid] >>> 0;
  }
  return Buffer.concat(parts).subarray(0, Number.isFinite(maxBytes) ? maxBytes : undefined);
}

function parseOleWorkbook(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 512 || buf.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") {
    throw new Error("Le fichier n’est pas un classeur Excel .xls valide.");
  }
  const sectorSize = 1 << u16(buf, 30);
  const miniSectorSize = 1 << u16(buf, 32);
  const fatSectorCount = u32(buf, 44);
  const firstDirSid = u32(buf, 48);
  const miniCutoff = u32(buf, 56);
  const firstMiniFatSid = u32(buf, 60);
  const miniFatSectorCount = u32(buf, 64);
  const firstDifatSid = u32(buf, 68);
  const difatSectorCount = u32(buf, 72);

  const fatSids = [];
  for (let i = 0; i < 109; i += 1) {
    const sid = u32(buf, 76 + i * 4);
    if (sid < 0xfffffffa) fatSids.push(sid);
  }
  let difatSid = firstDifatSid;
  for (let i = 0; i < difatSectorCount && difatSid < 0xfffffffa; i += 1) {
    const d = sector(buf, sectorSize, difatSid);
    const count = sectorSize / 4;
    for (let j = 0; j < count - 1; j += 1) {
      const sid = u32(d, j * 4);
      if (sid < 0xfffffffa) fatSids.push(sid);
    }
    difatSid = u32(d, (count - 1) * 4);
  }

  const fat = [];
  for (const sid of fatSids.slice(0, fatSectorCount)) {
    const d = sector(buf, sectorSize, sid);
    for (let off = 0; off + 4 <= d.length; off += 4) fat.push(u32(d, off));
  }

  const dirData = readChain(buf, sectorSize, fat, firstDirSid);
  const entries = [];
  for (let off = 0; off + 128 <= dirData.length; off += 128) {
    const entry = dirData.subarray(off, off + 128);
    const nameBytes = u16(entry, 64);
    if (nameBytes < 2) continue;
    const name = entry.subarray(0, nameBytes - 2).toString("utf16le");
    const type = entry[66];
    const startSid = u32(entry, 116);
    const sizeLow = u32(entry, 120);
    const sizeHigh = u32(entry, 124);
    const size = sizeLow + sizeHigh * 0x100000000;
    entries.push({ name, type, startSid, size });
  }
  const root = entries.find((e) => e.type === 5);
  const workbook = entries.find((e) => e.type === 2 && (e.name === "Workbook" || e.name === "Book"));
  if (!root || !workbook) throw new Error("Le classeur Excel ne contient pas de feuille lisible.");

  const miniFat = [];
  if (miniFatSectorCount && firstMiniFatSid < 0xfffffffa) {
    const miniFatBytes = readChain(buf, sectorSize, fat, firstMiniFatSid, miniFatSectorCount * sectorSize);
    for (let off = 0; off + 4 <= miniFatBytes.length; off += 4) miniFat.push(u32(miniFatBytes, off));
  }
  const miniStream = root.size ? readChain(buf, sectorSize, fat, root.startSid, root.size) : Buffer.alloc(0);

  function readEntry(entry) {
    if (entry.size < miniCutoff && miniFat.length && miniStream.length) {
      const parts = [];
      const seen = new Set();
      let sid = entry.startSid >>> 0;
      while (sid !== END && sid !== FREE && sid < miniFat.length && !seen.has(sid)) {
        seen.add(sid);
        const start = sid * miniSectorSize;
        parts.push(miniStream.subarray(start, start + miniSectorSize));
        sid = miniFat[sid] >>> 0;
      }
      return Buffer.concat(parts).subarray(0, entry.size);
    }
    return readChain(buf, sectorSize, fat, entry.startSid, entry.size);
  }
  return readEntry(workbook);
}

function workbookRecords(workbook) {
  const records = [];
  for (let pos = 0; pos + 4 <= workbook.length;) {
    const id = u16(workbook, pos);
    const len = u16(workbook, pos + 2);
    const start = pos;
    pos += 4;
    if (pos + len > workbook.length) break;
    records.push({ start, id, data: workbook.subarray(pos, pos + len) });
    pos += len;
  }
  return records;
}

class ChunkReader {
  constructor(chunks) { this.chunks = chunks; this.ci = 0; this.off = 0; }
  ensure() { while (this.ci < this.chunks.length && this.off >= this.chunks[this.ci].length) { this.ci += 1; this.off = 0; } }
  readByte() { this.ensure(); if (this.ci >= this.chunks.length) throw new Error("SST tronquée"); return this.chunks[this.ci][this.off++]; }
  readRaw(n) { const parts=[]; let remain=n; while(remain>0){ this.ensure(); if(this.ci>=this.chunks.length) throw new Error("SST tronquée"); const c=this.chunks[this.ci]; const take=Math.min(remain,c.length-this.off); parts.push(c.subarray(this.off,this.off+take)); this.off+=take; remain-=take;} return Buffer.concat(parts); }
  readU16(){return this.readRaw(2).readUInt16LE(0);} readU32(){return this.readRaw(4).readUInt32LE(0);}
  readChars(count, initialUnicode) {
    let unicode = initialUnicode;
    let remaining = count;
    let text = "";
    while (remaining > 0) {
      this.ensure();
      if (this.ci >= this.chunks.length) throw new Error("Chaîne SST tronquée");
      if (this.off === 0 && this.ci > 0) {
        const option = this.readByte();
        unicode = Boolean(option & 1);
      }
      const chunk = this.chunks[this.ci];
      const bytesPerChar = unicode ? 2 : 1;
      const availableChars = Math.floor((chunk.length - this.off) / bytesPerChar);
      if (availableChars <= 0) { this.ci += 1; this.off = 0; continue; }
      const takeChars = Math.min(remaining, availableChars);
      const bytes = chunk.subarray(this.off, this.off + takeChars * bytesPerChar);
      text += bytes.toString(unicode ? "utf16le" : "latin1");
      this.off += bytes.length;
      remaining -= takeChars;
      if (remaining > 0 && this.off >= chunk.length) { this.ci += 1; this.off = 0; }
    }
    return text;
  }
}

function parseSst(records) {
  const index = records.findIndex((r) => r.id === 0x00fc);
  if (index < 0) return [];
  const chunks = [records[index].data];
  for (let i = index + 1; i < records.length && records[i].id === 0x003c; i += 1) chunks.push(records[i].data);
  const reader = new ChunkReader(chunks);
  reader.readU32();
  const unique = reader.readU32();
  const strings = [];
  for (let i = 0; i < unique; i += 1) {
    const cch = reader.readU16();
    const option = reader.readByte();
    const rich = Boolean(option & 0x08);
    const ext = Boolean(option & 0x04);
    const unicode = Boolean(option & 0x01);
    const runCount = rich ? reader.readU16() : 0;
    const extSize = ext ? reader.readU32() : 0;
    strings.push(reader.readChars(cch, unicode));
    if (runCount) reader.readRaw(runCount * 4);
    if (extSize) reader.readRaw(extSize);
  }
  return strings;
}

function decodeRk(rk) {
  const divide100 = Boolean(rk & 1);
  const isInteger = Boolean(rk & 2);
  let value;
  if (isInteger) value = (rk >> 2);
  else {
    const b = Buffer.alloc(8);
    const high = rk & 0xfffffffc;
    b.writeUInt32LE(0, 0);
    b.writeUInt32LE(high, 4);
    value = b.readDoubleLE(0);
  }
  return divide100 ? value / 100 : value;
}

function parseSheet(workbook, start, sst) {
  const cells = new Map();
  let maxRow = 0, maxCol = 0;
  for (let pos = start; pos + 4 <= workbook.length;) {
    const id = u16(workbook, pos), len = u16(workbook, pos + 2); pos += 4;
    const d = workbook.subarray(pos, pos + len); pos += len;
    if (id === 0x000a) break;
    let row, col, value;
    if (id === 0x00fd && d.length >= 10) { row=u16(d,0); col=u16(d,2); value=sst[u32(d,6)] ?? ""; }
    else if (id === 0x0203 && d.length >= 14) { row=u16(d,0); col=u16(d,2); value=d.readDoubleLE(6); }
    else if (id === 0x027e && d.length >= 10) { row=u16(d,0); col=u16(d,2); value=decodeRk(u32(d,6)); }
    else if (id === 0x0204 && d.length >= 8) { row=u16(d,0); col=u16(d,2); const n=u16(d,6); value=d.subarray(8,8+n).toString("latin1"); }
    else if (id === 0x0205 && d.length >= 8) { row=u16(d,0); col=u16(d,2); value=d[7]===0 ? Boolean(d[6]) : ""; }
    if (row !== undefined) { cells.set(`${row}:${col}`, value); if(row>maxRow)maxRow=row;if(col>maxCol)maxCol=col; }
  }
  const rows=[];
  for(let r=0;r<=maxRow;r++){const row=[];for(let c=0;c<=maxCol;c++)row.push(cells.get(`${r}:${c}`) ?? "");rows.push(row);} return rows;
}

export function parseTheCragXls(input) {
  const workbook = parseOleWorkbook(input);
  const records = workbookRecords(workbook);
  const sst = parseSst(records);
  const sheets = records.filter((r) => r.id === 0x0085).map((r) => {
    const d=r.data; const offset=u32(d,0); const count=d[6]; const unicode=Boolean(d[7]&1); const name=d.subarray(8,8+count*(unicode?2:1)).toString(unicode?"utf16le":"latin1"); return {name,offset};
  });
  const sheet = sheets.find((s) => s.name.toLowerCase() === "ascents") || sheets[0];
  if (!sheet) throw new Error("Aucune feuille Ascents trouvée dans le fichier theCrag.");
  const rows = parseSheet(workbook, sheet.offset, sst);
  const headers = (rows[0] || []).map((v) => String(v || "").trim());
  const required = ["Route Name","Ascent ID","Ascent Type","Route Grade","Ascent Gear Style","Crag Name","Comment","Ascent Date"];
  for (const h of required) if (!headers.includes(h)) throw new Error(`Colonne theCrag manquante : ${h}`);
  return rows.slice(1).filter((row)=>row.some((v)=>String(v??"").trim()!=="")).map((row)=>Object.fromEntries(headers.map((h,i)=>[h,row[i] ?? ""])));
}
