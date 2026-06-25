import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock fluent-ffmpeg before importing the module
vi.mock('fluent-ffmpeg', () => {
  const ffprobeMock = vi.fn();
  const ffmpegInstance = {
    setStartTime: vi.fn().mockReturnThis(),
    setDuration: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation(function (this: Record<string, unknown>, event: string, cb: () => void) {
      if (event === 'end') {
        // Store the end callback so we can trigger it
        this._endCb = cb;
      }
      return this;
    }),
    run: vi.fn().mockImplementation(function (this: { _endCb?: () => void }) {
      // Trigger end callback immediately
      if (this._endCb) this._endCb();
    }),
  };

  const ffmpegFn: ReturnType<typeof vi.fn> & { ffprobe: typeof ffprobeMock } = Object.assign(
    vi.fn(() => ({
      ...ffmpegInstance,
      // Each call gets fresh on/run so callbacks don't collide
      on: vi.fn().mockImplementation(function (this: Record<string, unknown>, event: string, cb: () => void) {
        if (event === 'end') this._endCb = cb;
        if (event === 'error') this._errorCb = cb;
        return this;
      }),
      run: vi.fn().mockImplementation(function (this: { _endCb?: () => void }) {
        if (this._endCb) this._endCb();
      }),
    })),
    { ffprobe: ffprobeMock },
  );

  return { default: ffmpegFn };
});

// Mock logger to avoid pino initialization
vi.mock('@/lib/logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  splitAudioBySize,
  cleanupChunkFiles,
  validateAudioFile,
  getAudioDuration,
} from '../audioProcessing';
import ffmpeg from 'fluent-ffmpeg';

describe('audioProcessing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('splitAudioBySize', () => {
    it('throws error for non-existent file', async () => {
      await expect(
        splitAudioBySize('/nonexistent/file.mp3')
      ).rejects.toThrow('Audio file not found');
    });

    it('returns single chunk when file is under size limit', async () => {
      const filePath = path.join(tmpDir, 'small.mp3');
      // Create a 1KB file
      fs.writeFileSync(filePath, Buffer.alloc(1024));

      const chunks = await splitAudioBySize(filePath, {
        maxChunkSizeMB: 1, // 1MB limit, file is 1KB
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].path).toBe(filePath);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].sizeBytes).toBe(1024);
    });

    it('splits file into multiple chunks when over size limit', async () => {
      const filePath = path.join(tmpDir, 'large.mp3');
      // Create a 3MB file
      const threeMB = 3 * 1024 * 1024;
      fs.writeFileSync(filePath, Buffer.alloc(threeMB));

      // Mock ffprobe to return duration
      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error | null, metadata: { format: { duration: number } }) => void) => {
        cb(null, { format: { duration: 300 } }); // 5 minutes
      });

      // Mock ffmpeg to create chunk files when run
      const ffmpegFn = ffmpeg as unknown as ReturnType<typeof vi.fn>;
      ffmpegFn.mockImplementation(() => {
        let outputPath = '';
        const instance = {
          setStartTime: vi.fn().mockReturnThis(),
          setDuration: vi.fn().mockReturnThis(),
          outputOptions: vi.fn().mockReturnThis(),
          output: vi.fn().mockImplementation(function (this: typeof instance, p: string) {
            outputPath = p;
            return this;
          }),
          on: vi.fn().mockImplementation(function (this: Record<string, unknown>, event: string, cb: () => void) {
            if (event === 'end') this._endCb = cb;
            if (event === 'error') this._errorCb = cb;
            return this;
          }),
          run: vi.fn().mockImplementation(function (this: { _endCb?: () => void }) {
            // Create the output file to simulate FFmpeg
            fs.writeFileSync(outputPath, Buffer.alloc(1024 * 1024)); // 1MB chunk
            if (this._endCb) this._endCb();
          }),
        };
        return instance;
      });

      const chunks = await splitAudioBySize(filePath, {
        maxChunkSizeMB: 1, // 1MB limit → should create 3 chunks
      });

      expect(chunks).toHaveLength(3);
      chunks.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
        expect(chunk.sizeBytes).toBeGreaterThan(0);
        expect(fs.existsSync(chunk.path)).toBe(true);
      });
    });

    it('uses custom output directory', async () => {
      const filePath = path.join(tmpDir, 'test.mp3');
      const outputDir = path.join(tmpDir, 'output');
      fs.mkdirSync(outputDir);
      // 2MB file
      fs.writeFileSync(filePath, Buffer.alloc(2 * 1024 * 1024));

      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error | null, metadata: { format: { duration: number } }) => void) => {
        cb(null, { format: { duration: 120 } });
      });

      const ffmpegFn = ffmpeg as unknown as ReturnType<typeof vi.fn>;
      ffmpegFn.mockImplementation(() => {
        let outputPath = '';
        return {
          setStartTime: vi.fn().mockReturnThis(),
          setDuration: vi.fn().mockReturnThis(),
          outputOptions: vi.fn().mockReturnThis(),
          output: vi.fn().mockImplementation(function (this: Record<string, unknown>, p: string) {
            outputPath = p;
            return this;
          }),
          on: vi.fn().mockImplementation(function (this: Record<string, unknown>, event: string, cb: () => void) {
            if (event === 'end') this._endCb = cb;
            if (event === 'error') this._errorCb = cb;
            return this;
          }),
          run: vi.fn().mockImplementation(function (this: { _endCb?: () => void }) {
            fs.writeFileSync(outputPath, Buffer.alloc(512 * 1024));
            if (this._endCb) this._endCb();
          }),
        };
      });

      const chunks = await splitAudioBySize(filePath, {
        maxChunkSizeMB: 1,
        outputDir,
      });

      expect(chunks).toHaveLength(2);
      chunks.forEach((chunk) => {
        expect(chunk.path.startsWith(outputDir)).toBe(true);
      });
    });
  });

  describe('getAudioDuration', () => {
    // Drives the decode fallback: ffmpeg() emits one `progress` event with the
    // given timemark (or none when null), then `end`.
    function mockDecodeWithTimemark(timemark: string | null) {
      const ffmpegFn = ffmpeg as unknown as ReturnType<typeof vi.fn>;
      ffmpegFn.mockImplementation(() => {
        const instance: Record<string, unknown> = {};
        const ret = () => instance;
        instance.outputOptions = ret;
        instance.output = ret;
        instance.on = (event: string, cb: (arg?: unknown) => void) => {
          if (event === 'end') instance._endCb = cb;
          if (event === 'error') instance._errorCb = cb;
          if (event === 'progress') instance._progressCb = cb;
          return instance;
        };
        instance.run = () => {
          if (timemark && typeof instance._progressCb === 'function') {
            (instance._progressCb as (arg: { timemark: string }) => void)({ timemark });
          }
          if (typeof instance._endCb === 'function') (instance._endCb as () => void)();
        };
        return instance;
      });
    }

    it('returns duration from ffprobe', async () => {
      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error | null, metadata: { format: { duration: number } }) => void) => {
        cb(null, { format: { duration: 180.5 } });
      });

      const duration = await getAudioDuration('/some/file.mp3');
      expect(duration).toBe(180.5);
    });

    it('rejects when ffprobe errors', async () => {
      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error) => void) => {
        cb(new Error('not a media file'));
      });

      await expect(getAudioDuration('/bad/file.txt')).rejects.toThrow(
        'Failed to probe audio file'
      );
    });

    it('falls back to decoding when the container reports no duration', async () => {
      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error | null, metadata: { format: { duration?: number } }) => void) => {
        cb(null, { format: {} });
      });
      mockDecodeWithTimemark('00:00:12.34');

      const duration = await getAudioDuration('/some/recorder.webm');
      expect(duration).toBeCloseTo(12.34, 2);
    });

    it('rejects when neither ffprobe nor decoding yield a duration', async () => {
      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error | null, metadata: { format: { duration?: number } }) => void) => {
        cb(null, { format: {} });
      });
      mockDecodeWithTimemark(null);

      await expect(getAudioDuration('/some/file.mp3')).rejects.toThrow(
        'Could not determine audio duration'
      );
    });
  });

  describe('cleanupChunkFiles', () => {
    it('removes chunk files but not the original', () => {
      const original = path.join(tmpDir, 'original.mp3');
      const chunk1 = path.join(tmpDir, 'original_chunk0.mp3');
      const chunk2 = path.join(tmpDir, 'original_chunk1.mp3');

      fs.writeFileSync(original, 'original');
      fs.writeFileSync(chunk1, 'chunk1');
      fs.writeFileSync(chunk2, 'chunk2');

      cleanupChunkFiles([original, chunk1, chunk2], original);

      expect(fs.existsSync(original)).toBe(true);
      expect(fs.existsSync(chunk1)).toBe(false);
      expect(fs.existsSync(chunk2)).toBe(false);
    });

    it('handles already-deleted files gracefully', () => {
      const original = path.join(tmpDir, 'original.mp3');
      fs.writeFileSync(original, 'original');

      // This path doesn't exist
      const missing = path.join(tmpDir, 'missing_chunk0.mp3');

      expect(() => {
        cleanupChunkFiles([original, missing], original);
      }).not.toThrow();
    });
  });

  describe('validateAudioFile', () => {
    it('returns invalid for non-existent file', async () => {
      const result = await validateAudioFile('/nonexistent.mp3');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('returns metadata for valid file', async () => {
      const filePath = path.join(tmpDir, 'valid.mp3');
      fs.writeFileSync(filePath, Buffer.alloc(5000));

      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      // First call for duration, second for format
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error | null, metadata: { format: { duration: number; format_name: string } }) => void) => {
        cb(null, { format: { duration: 60.0, format_name: 'mp3' } });
      });

      const result = await validateAudioFile(filePath);
      expect(result.isValid).toBe(true);
      expect(result.metadata).toEqual({
        duration: 60.0,
        format: 'mp3',
        sizeBytes: 5000,
      });
    });

    it('returns invalid when ffprobe fails', async () => {
      const filePath = path.join(tmpDir, 'corrupt.mp3');
      fs.writeFileSync(filePath, Buffer.alloc(100));

      const ffprobeMock = ffmpeg.ffprobe as unknown as ReturnType<typeof vi.fn>;
      ffprobeMock.mockImplementation((_path: string, cb: (err: Error) => void) => {
        cb(new Error('corrupt file'));
      });

      const result = await validateAudioFile(filePath);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to probe audio file');
    });
  });
});
