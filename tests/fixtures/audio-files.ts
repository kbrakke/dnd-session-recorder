import path from 'path';
import fs from 'fs';

export interface AudioFixture {
  name: string;
  path: string;
  size: number;
  format: string;
  description: string;
}

export class AudioFixtures {
  private static fixturesDir = path.join(__dirname, '.');
  
  /**
   * Get path to test audio file
   */
  static getAudioPath(filename: string): string {
    return path.join(this.fixturesDir, filename);
  }

  /**
   * Create a dummy audio file for testing (creates empty file with correct extension)
   */
  static async createDummyAudio(filename: string, sizeInBytes: number = 1024): Promise<string> {
    const filePath = this.getAudioPath(filename);
    const buffer = Buffer.alloc(sizeInBytes, 0);
    
    // Add minimal MP3 header for more realistic testing
    if (filename.endsWith('.mp3')) {
      // Simple MP3 header (not a valid MP3, but has right structure for upload tests)
      buffer.write('ID3', 0);
    } else if (filename.endsWith('.wav')) {
      // Simple WAV header
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(sizeInBytes - 8, 4);
      buffer.write('WAVE', 8);
    }
    
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Get all available test audio fixtures
   */
  static getFixtures(): AudioFixture[] {
    return [
      {
        name: 'Small MP3',
        path: 'test-audio-small.mp3',
        size: 1024, // 1KB
        format: 'mp3',
        description: 'Small MP3 file for basic upload testing'
      },
      {
        name: 'Medium MP3',
        path: 'test-audio-medium.mp3',
        size: 1024 * 1024, // 1MB
        format: 'mp3',
        description: 'Medium MP3 file for normal workflow testing'
      },
      {
        name: 'Large MP3',
        path: 'test-audio-large.mp3',
        size: 50 * 1024 * 1024, // 50MB
        format: 'mp3',
        description: 'Large MP3 file for testing upload limits'
      },
      {
        name: 'WAV File',
        path: 'test-audio.wav',
        size: 1024 * 1024, // 1MB
        format: 'wav',
        description: 'WAV format for testing different audio types'
      },
      {
        name: 'Invalid File',
        path: 'invalid-file.txt',
        size: 512,
        format: 'txt',
        description: 'Text file to test invalid file type handling'
      }
    ];
  }

  /**
   * Setup all test audio files
   */
  static async setupAll(): Promise<void> {
    const fixtures = this.getFixtures();
    
    for (const fixture of fixtures) {
      await this.createDummyAudio(fixture.path, fixture.size);
    }
  }

  /**
   * Cleanup all test audio files
   */
  static async cleanupAll(): Promise<void> {
    const fixtures = this.getFixtures();
    
    for (const fixture of fixtures) {
      try {
        const filePath = this.getAudioPath(fixture.path);
        await fs.promises.unlink(filePath);
      } catch {
        // Ignore if file doesn't exist
      }
    }
  }

  /**
   * Get fixture by name
   */
  static getFixture(name: string): AudioFixture | undefined {
    return this.getFixtures().find(f => f.name === name);
  }

  /**
   * Get fixture by path
   */
  static getFixtureByPath(path: string): AudioFixture | undefined {
    return this.getFixtures().find(f => f.path === path);
  }
}

// Export common paths for easy access in tests
export const AUDIO_PATHS = {
  SMALL_MP3: AudioFixtures.getAudioPath('test-audio-small.mp3'),
  MEDIUM_MP3: AudioFixtures.getAudioPath('test-audio-medium.mp3'),
  LARGE_MP3: AudioFixtures.getAudioPath('test-audio-large.mp3'),
  WAV_FILE: AudioFixtures.getAudioPath('test-audio.wav'),
  INVALID_FILE: AudioFixtures.getAudioPath('invalid-file.txt')
};