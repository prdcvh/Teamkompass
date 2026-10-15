// Kleiner QR-Code-Generator ohne externe Abhaengigkeit (SCRUM-30; die CSP erlaubt nur eigene Skripte, SCRUM-62).
// Byte-Modus, Fehlerkorrektur-Stufe M, Versionen 1-10 (bis 213 Zeichen) - reicht fuer Einladungs-Links.
// Algorithmus nach ISO/IEC 18004; getestet gegen einen Referenz-Encoder und einen Decoder (tests/qr-code.test.mjs).
(function (root) {
  "use strict";

  const MAX_VERSION = 10;
  // Stufe M: Fehlerkorrektur-Codewoerter je Block und Anzahl Bloecke, Index = Version.
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

  function rawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const align = Math.floor(version / 7) + 2;
      result -= (25 * align - 10) * align - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(version) {
    return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * NUM_BLOCKS[version];
  }

  function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function reedSolomonDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let rootPower = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMultiply(result[j], rootPower);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      rootPower = gfMultiply(rootPower, 2);
    }
    return result;
  }

  function reedSolomonRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const byte of data) {
      const factor = byte ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
    }
    return result;
  }

  function utf8Bytes(text) {
    return Array.from(new TextEncoder().encode(text));
  }

  function buildCodewords(bytes, version) {
    const bits = [];
    const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach((byte) => push(byte, 8));
    const capacityBits = dataCodewords(version) * 8;
    push(0, Math.min(4, capacityBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

    const blocks = NUM_BLOCKS[version];
    const eccLength = ECC_PER_BLOCK[version];
    const rawCodewords = Math.floor(rawDataModules(version) / 8);
    const shortBlocks = blocks - (rawCodewords % blocks);
    const shortLength = Math.floor(rawCodewords / blocks) - eccLength;
    const divisor = reedSolomonDivisor(eccLength);
    const dataBlocks = [];
    const eccBlocks = [];
    for (let i = 0, offset = 0; i < blocks; i++) {
      const length = shortLength + (i < shortBlocks ? 0 : 1);
      const block = data.slice(offset, offset + length);
      offset += length;
      dataBlocks.push(block);
      eccBlocks.push(reedSolomonRemainder(block, divisor));
    }
    const result = [];
    for (let i = 0; i <= shortLength; i++) dataBlocks.forEach((block) => { if (i < block.length) result.push(block[i]); });
    for (let i = 0; i < eccLength; i++) eccBlocks.forEach((block) => result.push(block[i]));
    return result;
  }

  function alignmentPositions(version) {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const size = version * 4 + 17;
    const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function penalty(modules) {
    const size = modules.length;
    let score = 0;
    const lines = [];
    for (let i = 0; i < size; i++) {
      lines.push(modules[i].map(Number).join(""));
      lines.push(modules.map((row) => Number(row[i])).join(""));
    }
    for (const line of lines) {
      const runs = line.match(/0+|1+/g) || [];
      runs.forEach((run) => { if (run.length >= 5) score += 3 + run.length - 5; });
      score += 40 * ((line.match(/(?=10111010000)/g) || []).length + (line.match(/(?=00001011101)/g) || []).length);
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
      }
    }
    const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  ];

  function buildMatrix(codewords, version, mask) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { modules[y][x] = dark; reserved[y][x] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
        }
      }
    });
    const align = alignmentPositions(version);
    align.forEach((cy, i) => align.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));

    const drawFormat = (maskValue) => {
      const data = maskValue; // Stufe M = Bits 00
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const bit = (i) => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        set(a, b, dark);
        set(b, a, dark);
      }
    }

    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!reserved[y][x] && bitIndex < codewords.length * 8) {
            modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
            bitIndex++;
          }
        }
      }
    }

    const apply = (maskValue) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!reserved[y][x] && MASKS[maskValue](x, y)) modules[y][x] = !modules[y][x];
    };
    let best = 0;
    let bestScore = Infinity;
    if (mask === undefined) {
      for (let m = 0; m < 8; m++) {
        apply(m);
        drawFormat(m);
        const score = penalty(modules);
        if (score < bestScore) { best = m; bestScore = score; }
        apply(m);
      }
    } else {
      best = mask;
    }
    apply(best);
    drawFormat(best);
    return modules;
  }

  // Liefert die Modul-Matrix (Array aus Zeilen mit true = dunkel) fuer den Text.
  function encode(text, mask) {
    const bytes = utf8Bytes(String(text));
    let version = 1;
    while (version <= MAX_VERSION && bytes.length + (version < 10 ? 2 : 3) > dataCodewords(version)) version++;
    if (version > MAX_VERSION) throw new RangeError("Text ist zu lang fuer den QR-Code.");
    return buildMatrix(buildCodewords(bytes, version), version, mask);
  }

  // Fertiges <svg> als String (ein einziger Pfad, mit vorgeschriebener heller Randzone von 4 Modulen).
  function toSvg(text, label) {
    const modules = encode(text);
    const border = 4;
    const total = modules.length + border * 2;
    let path = "";
    modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + border} ${y + border}h1v1h-1z`; }));
    const title = String(label || "QR-Code").replace(/[<>&"]/g, "");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${title}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  const api = { encode, toSvg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TeamKompassQr = api;
})(typeof window !== "undefined" ? window : globalThis);
