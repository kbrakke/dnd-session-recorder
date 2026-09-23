import { describe, expect, it } from 'vitest';
import { PartAssembler } from '../part-assembler';

function feed(a: PartAssembler, segment: number, sizes: number[], durationMs = 10_000) {
  const stamps: number[] = [];
  const sealed = [];
  let media = 0;
  for (const size of sizes) {
    const partIndex = a.currentPartIndex(segment); // stamp BEFORE add
    const seq = a.nextSeq(segment);
    media += durationMs;
    stamps.push(partIndex);
    const part = a.add(segment, { seq, size, durationMs, mediaEndMs: media });
    if (part) sealed.push(part);
  }
  return { stamps, sealed };
}

describe('PartAssembler', () => {
  it('seals at the byte limit', () => {
    const a = new PartAssembler({ maxBytes: 100, maxDurationMs: 1e9 });
    const { sealed } = feed(a, 0, [40, 40, 40, 40]);
    expect(sealed).toHaveLength(1);
    expect(sealed[0]).toMatchObject({ partIndex: 0, firstSeq: 0, lastSeq: 2, size: 120 });
  });

  it('seals at the duration limit', () => {
    const a = new PartAssembler({ maxBytes: 1e9, maxDurationMs: 30_000 });
    const { sealed } = feed(a, 0, [1, 1, 1, 1, 1, 1]);
    expect(sealed.map(p => p.partIndex)).toEqual([0, 1]);
    expect(sealed[0]).toMatchObject({ firstSeq: 0, lastSeq: 2, durationMs: 30_000, mediaEndMs: 30_000 });
  });

  it('stamps every chunk with the part it ends up in (including the sealing chunk)', () => {
    const a = new PartAssembler({ maxBytes: 100, maxDurationMs: 1e9 });
    const { stamps, sealed } = feed(a, 0, [60, 60, 60, 60, 10]);
    expect(stamps).toEqual([0, 0, 1, 1, 2]);
    expect(sealed.map(p => [p.firstSeq, p.lastSeq])).toEqual([[0, 1], [2, 3]]);
  });

  it('keeps part indexes and seqs independent per segment', () => {
    const a = new PartAssembler({ maxBytes: 50, maxDurationMs: 1e9 });
    feed(a, 0, [60, 60]);
    const { sealed } = feed(a, 1, [60]);
    expect(sealed[0]).toMatchObject({ segmentIndex: 1, partIndex: 0, firstSeq: 0 });
    expect(a.partCount(0)).toBe(2);
    expect(a.partCount(1)).toBe(1);
  });

  it('flush seals a non-empty open part and returns null when empty', () => {
    const a = new PartAssembler({ maxBytes: 1e9, maxDurationMs: 1e9 });
    expect(a.flush(0)).toBeNull();
    feed(a, 0, [5, 5]);
    expect(a.flush(0)).toMatchObject({ partIndex: 0, size: 10, lastSeq: 1 });
    expect(a.flush(0)).toBeNull();
    expect(a.partCount(0)).toBe(1);
    expect(a.currentPartIndex(0)).toBe(1);
  });

  it('forceSeal closes the part on that chunk (pause flush)', () => {
    const a = new PartAssembler({ maxBytes: 1e9, maxDurationMs: 1e9 });
    const seq = a.nextSeq(0);
    expect(a.add(0, { seq, size: 3, durationMs: 1, mediaEndMs: 1 }, { forceSeal: true })).toMatchObject({ partIndex: 0 });
  });

  it('is byte-exact: sealed parts cover every chunk once, contiguously', () => {
    const a = new PartAssembler({ maxBytes: 97, maxDurationMs: 1e9 });
    const sizes = Array.from({ length: 40 }, (_, i) => 10 + ((i * 7) % 23));
    const { sealed } = feed(a, 3, sizes);
    const last = a.flush(3);
    const parts = last ? [...sealed, last] : sealed;
    expect(parts.reduce((n, p) => n + p.size, 0)).toBe(sizes.reduce((n, s) => n + s, 0));
    parts.forEach((p, i) => {
      expect(p.partIndex).toBe(i);
      if (i > 0) expect(p.firstSeq).toBe(parts[i - 1].lastSeq + 1);
    });
    expect(parts[0].firstSeq).toBe(0);
    expect(parts[parts.length - 1].lastSeq).toBe(sizes.length - 1);
  });

  it('seals a single oversized chunk as its own part', () => {
    const a = new PartAssembler({ maxBytes: 10, maxDurationMs: 1e9 });
    const { sealed } = feed(a, 0, [500]);
    expect(sealed[0]).toMatchObject({ firstSeq: 0, lastSeq: 0, size: 500 });
  });
});
