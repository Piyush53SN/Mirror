/**
 * Vector encoding for storage.
 *
 * `topic_vector` is 384 floats. Stored as JSON numbers it is roughly 5 KB of
 * text per event; as float32 it is **1,536 bytes**, sealed with the same AEAD as
 * the rest of the payload. Over a year that difference is the difference between
 * a database that fits in a backup and one that does not.
 *
 * The codec is deliberately dumb: little-endian float32, no compression. A vector
 * is already close to incompressible, and a byte layout that a future sync layer
 * can read without a library is worth more than the few percent compression would
 * save.
 */

export const VECTOR_DIM = 384;

export function encodeVector(vector: readonly number[]): Uint8Array {
  if (vector.length !== VECTOR_DIM) throw new Error(`vector must have ${VECTOR_DIM} dimensions, got ${vector.length}`);
  const out = new Uint8Array(vector.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < vector.length; i += 1) {
    const value = vector[i]!;
    if (!Number.isFinite(value)) throw new Error(`vector[${i}] is not finite`);
    view.setFloat32(i * 4, value, true);
  }
  return out;
}

export function decodeVector(bytes: Uint8Array | ArrayBuffer, dim = VECTOR_DIM): number[] {
  const view = new DataView(bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes);
  const count = view.byteLength / 4;
  if (count !== dim) throw new Error(`vector blob holds ${count} floats, expected ${dim}`);
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i += 1) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/** ‖v‖ — used to refuse a vector that is not a direction. */
export function vectorNorm(vector: readonly number[]): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/** True when the vector is finite, the right width, and close enough to unit length. */
export function isUsableVector(vector: readonly number[], tolerance = 0.03): boolean {
  if (vector.length !== VECTOR_DIM) return false;
  if (vector.some((value) => !Number.isFinite(value))) return false;
  return Math.abs(vectorNorm(vector) - 1) <= tolerance;
}
