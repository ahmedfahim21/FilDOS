/**
 * Vector hygiene for embedding outputs, shared by the runtime and its tests.
 * A model that overflows (EmbeddingGemma 2 under float16, a corrupt weight
 * file) produces NaN/Inf or all-zero rows rather than an error; storing those
 * would silently poison search, so they fail loudly here instead.
 */

export class BadVectorError extends Error {
  readonly code = 'EBADVECTOR';
}

/** Throw unless every value is finite and the row has non-zero length. */
export function assertFiniteVector(vec: ArrayLike<number>, what = 'embedding'): void {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    if (!Number.isFinite(v)) throw new BadVectorError(`The ${what} contains ${v} at index ${i}.`);
    sum += v * v;
  }
  if (sum === 0) throw new BadVectorError(`The ${what} is all zeros.`);
}

/**
 * Matryoshka truncation: keep the leading `dim` values and re-normalize to
 * unit length (a sliced unit vector is no longer unit length, and cosine on it
 * would rank silently wrong). Validates first.
 */
export function truncateNormalize(vec: ArrayLike<number>, dim: number): Float32Array {
  if (dim > vec.length) throw new RangeError(`Cannot truncate a ${vec.length}-d vector to ${dim}.`);
  assertFiniteVector(vec);
  const out = new Float32Array(dim);
  let sum = 0;
  for (let i = 0; i < dim; i++) {
    out[i] = vec[i];
    sum += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sum);
  if (norm === 0) throw new BadVectorError(`The leading ${dim} values of the embedding are all zeros.`);
  for (let i = 0; i < dim; i++) out[i] /= norm;
  return out;
}

/** Split a row-major [rows × dim] buffer into one validated, truncated vector per row. */
export function rowsOf(data: ArrayLike<number>, rows: number, width: number, dim: number): Float32Array[] {
  if (data.length !== rows * width) {
    throw new RangeError(`Expected ${rows}×${width} values, got ${data.length}.`);
  }
  return Array.from({ length: rows }, (_, r) =>
    truncateNormalize(Array.prototype.slice.call(data, r * width, (r + 1) * width) as number[], dim),
  );
}
