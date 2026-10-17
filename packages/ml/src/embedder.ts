/**
 * The embedder — **a placeholder**, and labelled as one everywhere it is visible.
 *
 * What it is: signed feature hashing of character 3–5-grams and word unigrams into
 * 384 dimensions, L2-normalised. It is deterministic, dependency-free, works
 * offline, and produces the exact shape the schema requires (`topic_vector`, 384
 * floats, unit norm). It captures lexical overlap: two pages about "zone system"
 * and "zone metering" land near each other, and unrelated text does not. It does
 * **not** understand meaning — "borrow checker" and "ownership model" are far
 * apart, because they share no n-grams.
 *
 * Why ship it at all: the storage, the schema, the re-embedding path and the UI
 * that consumes vectors can be built and tested now, against a model that is
 * honest about what it cannot do. A real sentence encoder (MiniLM-class, 384-d,
 * quantised, run through ONNX Runtime Mobile or a native Core ML/TFLite module)
 * replaces `embed()` and bumps `EMBEDDER.id` — nothing else changes, because
 * `@mirror/store` records the model id beside every vector.
 *
 * Re-embedding path (implemented, tested):
 *   1. `store.reembedCandidates(currentModel)` finds events whose vector is
 *      missing or was produced by another model, returning their text.
 *   2. `embed()` recomputes the vector.
 *   3. `store.writeVectors()` replaces the row, with the new model id.
 *   The source text never leaves the device: it is already in the sealed payload.
 *
 * The placeholder id is deliberately unmistakable. Anything that displays a
 * similarity must be able to say which model produced it.
 */
import { TOPIC_VECTOR_DIM } from '@mirror/shared-types';

export const EMBEDDER = {
  id: 'placeholder-ngram-v1',
  kind: 'hashed-character-ngram',
  dim: TOPIC_VECTOR_DIM,
  placeholder: true,
  /** Words are lowercased and stripped to letters/digits/space before hashing. */
  normalise: 'lowercase, ascii-fold, strip punctuation',
} as const;

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/** FNV-1a over a string; 32-bit, enough for feature hashing. */
function fnv1a(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

/** A second, independent hash for the sign bit, so collisions cancel rather than add. */
function signOf(input: string): 1 | -1 {
  const hash = fnv1a(`#${input}`);
  return (hash & 1) === 0 ? 1 : -1;
}

function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The features this text contributes. Exported so tests can reason about them. */
export function features(text: string): string[] {
  const normalised = normalise(text);
  const out: string[] = [];
  if (normalised.length === 0) return out;

  for (const word of normalised.split(' ')) {
    out.push(`w:${word}`);
  }
  // Character n-grams over the whole string, which is what makes near-typos and
  // inflections land near each other without a tokenizer.
  for (const size of [3, 4, 5]) {
    for (let i = 0; i + size <= normalised.length; i += 1) {
      const gram = normalised.slice(i, i + size);
      if (!gram.includes('  ')) out.push(`c${size}:${gram}`);
    }
  }
  return out;
}

/**
 * Embed text into a unit vector of `TOPIC_VECTOR_DIM` dimensions.
 *
 * An empty or uninformative string still returns a valid unit vector (a fixed
 * direction), because a zero vector is not a direction and the schema refuses it.
 */
export function embed(text: string): number[] {
  const vector = new Array<number>(EMBEDDER.dim).fill(0);
  const list = features(text);
  if (list.length === 0) {
    // Deterministic fallback direction; indistinguishable from "no signal" by a
    // caller that checks the model id, which is what should happen.
    vector[0] = 1;
    return vector;
  }
  for (const feature of list) {
    const index = fnv1a(feature) % EMBEDDER.dim;
    vector[index] = (vector[index] ?? 0) + signOf(feature);
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => Math.round((value / norm) * 10_000) / 10_000);
}

/** Cosine similarity of two equal-width vectors. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Which events still need embedding under `model` — the query, as pure logic. */
export function needsReembedding(existing: { model: string | null }, model = EMBEDDER.id): boolean {
  return existing.model !== model;
}
