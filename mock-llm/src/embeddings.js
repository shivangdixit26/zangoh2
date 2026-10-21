import { hashString } from './generator.js';

export const EMBEDDING_DIM = 256;

const STOPWORDS = new Set('a an the and or but if of to in on at for with from by is are was were be been it this that these those i me my we our you your they them their he she his her as so do does did not no can will would should could have has had about into than then there here what which who when where how why all any each just also only very'.split(' '));

function stem(word) {
  return word
    .replace(/(ing|edly|ed|ies|es|s|ly)$/, (m) => (m === 'ies' ? 'y' : ''))
    .slice(0, 12);
}

export function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

// Feature-hashed bag of words + bigrams, signed and L2-normalised.
// Not semantic like a real model, but stable and good enough for keyword-level retrieval.
export function embed(text) {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  const features = [...tokens];
  for (let i = 0; i < tokens.length - 1; i += 1) features.push(`${tokens[i]}_${tokens[i + 1]}`);
  for (const f of features) {
    const h = hashString(f);
    const idx = h % EMBEDDING_DIM;
    const sign = (h >>> 31) === 0 ? 1 : -1;
    vec[idx] += sign * (f.includes('_') ? 0.5 : 1);
  }
  const norm = Math.sqrt(vec.reduce((n, v) => n + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}
