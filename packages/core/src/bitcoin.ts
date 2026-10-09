/**
 * Bitcoin address validation (step 02a), pure so the dashboard can run it in the browser:
 * base58check for legacy and P2SH addresses, bech32/bech32m (BIP173, BIP350) for SegWit and
 * Taproot. Mainnet only. A typo fails its checksum instead of becoming a wallet that reads zero.
 */

export type BitcoinAddressType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr';

// --- SHA-256 (FIPS 180-4), needed for base58check's double hash ---

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

type Words8 = [number, number, number, number, number, number, number, number];

export function sha256(data: Uint8Array): Uint8Array {
  const state: Words8 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = data.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);

  const w = new Array<number>(64).fill(0);
  const k = Array.from(K);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15] ?? 0;
      const y = w[i - 2] ?? 0;
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const t1 =
        (h +
          (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
          ((e & f) ^ (~e & g)) +
          (k[i] ?? 0) +
          (w[i] ?? 0)) >>>
        0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const round: Words8 = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) state[i] = ((state[i] ?? 0) + (round[i] ?? 0)) >>> 0;
  }
  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  for (const [i, word] of state.entries()) out.setUint32(i * 4, word);
  return digest;
}

// --- Base58 ---

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decode base58 to bytes (leading '1's are leading zero bytes); null on any invalid character. */
export function base58Decode(text: string): Uint8Array | null {
  let n = 0n;
  for (const ch of text) {
    const v = BASE58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of text) {
    if (ch !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/** The payload of a base58check string whose 4-byte double-SHA-256 checksum matches. */
function base58CheckPayload(text: string): Uint8Array | null {
  const raw = base58Decode(text);
  if (!raw || raw.length < 5) return null;
  const payload = raw.subarray(0, raw.length - 4);
  const hash = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) if (hash[i] !== raw[raw.length - 4 + i]) return null;
  return payload;
}

// --- Bech32 / bech32m ---

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i] as number;
  }
  return chk >>> 0;
}

const hrpExpand = (hrp: string) => [
  ...[...hrp].map((c) => c.charCodeAt(0) >> 5),
  0,
  ...[...hrp].map((c) => c.charCodeAt(0) & 31),
];

/** Regroup bits (5-bit words → bytes). Null when the padding is non-zero (not canonical). */
function convertBits(data: number[], from: number, to: number): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (bits >= from || ((acc << (to - bits)) & max) !== 0) return null;
  return out;
}

/** A mainnet SegWit/Taproot address's type, or null (BIP173 for v0, BIP350 bech32m for v1). */
function segwitType(address: string): BitcoinAddressType | null {
  if (address.length > 90) return null;
  const lower = address.toLowerCase();
  if (address !== lower && address !== address.toUpperCase()) return null; // mixed case
  const sep = lower.lastIndexOf('1');
  if (lower.slice(0, sep) !== 'bc' || sep + 7 > lower.length) return null;
  const data = [...lower.slice(sep + 1)].map((c) => CHARSET.indexOf(c));
  if (data.some((v) => v < 0)) return null;
  const check = polymod([...hrpExpand('bc'), ...data]);
  const words = data.slice(0, -6);
  const version = words[0];
  const program = convertBits(words.slice(1), 5, 8);
  if (version === undefined || !program) return null;
  if (version === 0 && check === BECH32_CONST) {
    if (program.length === 20) return 'p2wpkh';
    if (program.length === 32) return 'p2wsh';
    return null;
  }
  if (version === 1 && check === BECH32M_CONST && program.length === 32) return 'p2tr';
  return null; // other witness versions aren't in use
}

/** What kind of mainnet Bitcoin address this is, or null if it isn't a valid one. */
export function bitcoinAddressType(address: string): BitcoinAddressType | null {
  const a = address.trim();
  if (/^bc1/i.test(a)) return segwitType(a);
  if (!/^[13]/.test(a)) return null;
  const payload = base58CheckPayload(a);
  if (payload?.length !== 21) return null;
  if (payload[0] === 0x00) return 'p2pkh';
  if (payload[0] === 0x05) return 'p2sh';
  return null;
}
