import { PART_MAX_BYTES, PART_MAX_DURATION_MS } from './constants';
import type { SealedPart } from './types';

export interface ChunkInput {
  seq: number;
  size: number;
  durationMs: number;
  mediaEndMs: number;
}

interface OpenPart {
  firstSeq: number;
  lastSeq: number;
  size: number;
  durationMs: number;
  mediaEndMs: number;
  count: number;
}

interface SegmentState {
  openIndex: number;
  seqNext: number;
  sealed: number;
  open: OpenPart | null;
}

/**
 * Groups whole timeslice chunks into parts, per segment. A part seals at
 * ≥maxBytes or ≥maxDurationMs (whichever first), or when forced (pause,
 * segment end). Part indexes are assigned HERE, strictly increasing per
 * segment, and a part is never re-sliced — a retry re-sends exactly the same
 * bytes under the same index, which is what makes the server upsert safe.
 *
 * Usage: stamp each chunk with `currentPartIndex(s)` BEFORE calling `add` —
 * sealing only advances the index after including the sealing chunk, so the
 * stamp always equals the part the chunk ends up in.
 */
export class PartAssembler {
  private readonly segments = new Map<number, SegmentState>();
  private readonly maxBytes: number;
  private readonly maxDurationMs: number;

  constructor(opts: { maxBytes?: number; maxDurationMs?: number } = {}) {
    this.maxBytes = opts.maxBytes ?? PART_MAX_BYTES;
    this.maxDurationMs = opts.maxDurationMs ?? PART_MAX_DURATION_MS;
  }

  private state(segmentIndex: number): SegmentState {
    let st = this.segments.get(segmentIndex);
    if (!st) {
      st = { openIndex: 0, seqNext: 0, sealed: 0, open: null };
      this.segments.set(segmentIndex, st);
    }
    return st;
  }

  /** The part index the next chunk of this segment belongs to. */
  currentPartIndex(segmentIndex: number): number {
    return this.state(segmentIndex).openIndex;
  }

  /** Allocate the next capture sequence number for this segment. */
  nextSeq(segmentIndex: number): number {
    return this.state(segmentIndex).seqNext++;
  }

  /** Add a chunk; returns the part it completed, if any. */
  add(
    segmentIndex: number,
    chunk: ChunkInput,
    opts: { forceSeal?: boolean } = {}
  ): SealedPart | null {
    const st = this.state(segmentIndex);
    if (!st.open) {
      st.open = {
        firstSeq: chunk.seq,
        lastSeq: chunk.seq,
        size: 0,
        durationMs: 0,
        mediaEndMs: chunk.mediaEndMs,
        count: 0,
      };
    }
    st.open.lastSeq = chunk.seq;
    st.open.size += chunk.size;
    st.open.durationMs += chunk.durationMs;
    st.open.mediaEndMs = Math.max(st.open.mediaEndMs, chunk.mediaEndMs);
    st.open.count++;

    if (
      opts.forceSeal ||
      st.open.size >= this.maxBytes ||
      st.open.durationMs >= this.maxDurationMs
    ) {
      return this.seal(segmentIndex, st);
    }
    return null;
  }

  /** Seal the open part if it holds at least one chunk (segment end, pause). */
  flush(segmentIndex: number): SealedPart | null {
    const st = this.state(segmentIndex);
    return st.open && st.open.count > 0 ? this.seal(segmentIndex, st) : null;
  }

  /** Parts sealed so far — the segment's partCount for close. */
  partCount(segmentIndex: number): number {
    return this.state(segmentIndex).sealed;
  }

  hasOpenPart(segmentIndex: number): boolean {
    return !!this.segments.get(segmentIndex)?.open;
  }

  forget(segmentIndex: number): void {
    this.segments.delete(segmentIndex);
  }

  private seal(segmentIndex: number, st: SegmentState): SealedPart {
    const open = st.open!;
    const part: SealedPart = {
      segmentIndex,
      partIndex: st.openIndex,
      firstSeq: open.firstSeq,
      lastSeq: open.lastSeq,
      size: open.size,
      durationMs: open.durationMs,
      mediaEndMs: open.mediaEndMs,
    };
    st.openIndex++;
    st.sealed++;
    st.open = null;
    return part;
  }
}
