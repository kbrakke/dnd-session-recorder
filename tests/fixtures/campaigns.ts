export interface TestCampaign {
  name: string;
  description: string;
  players?: string[];
  gameSystem?: string;
}

export interface TestSession {
  title: string;
  notes: string;
  duration?: number;
  audioFile?: string;
}

export class CampaignFixtures {
  static createCampaign(overrides: Partial<TestCampaign> = {}): TestCampaign {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    
    return {
      name: `Test Campaign ${random}`,
      description: `A test D&D campaign created at ${new Date().toISOString()}`,
      players: ['Alice', 'Bob', 'Charlie', 'Diana'],
      gameSystem: 'D&D 5e',
      ...overrides
    };
  }

  static createMultipleCampaigns(count: number): TestCampaign[] {
    return Array.from({ length: count }, (_, i) => 
      this.createCampaign({ 
        name: `Campaign ${i + 1}`,
        description: `Test campaign number ${i + 1}`
      })
    );
  }

  static createLargeCampaign(): TestCampaign {
    return {
      name: 'Epic Campaign with Very Long Name That Tests UI Layout and Overflow Handling',
      description: 'This is a very long campaign description that tests how the UI handles extensive text content. '.repeat(10),
      players: Array.from({ length: 20 }, (_, i) => `Player ${i + 1}`),
      gameSystem: 'D&D 5e'
    };
  }

  static createMinimalCampaign(): TestCampaign {
    return {
      name: 'Minimal',
      description: 'Min'
    };
  }
}

export class SessionFixtures {
  static createSession(overrides: Partial<TestSession> = {}): TestSession {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    
    return {
      title: `Session ${random}`,
      notes: `Test session notes created at ${new Date().toISOString()}`,
      duration: 180, // 3 hours in minutes
      ...overrides
    };
  }

  static createMultipleSessions(count: number): TestSession[] {
    return Array.from({ length: count }, (_, i) => 
      this.createSession({ 
        title: `Session ${i + 1}`,
        notes: `Notes for session ${i + 1}`
      })
    );
  }

  static createLongSession(): TestSession {
    return {
      title: 'Epic 12-Hour Session That Went Way Too Long But Was Amazing',
      notes: 'This session had incredible moments. '.repeat(50),
      duration: 720 // 12 hours
    };
  }

  static createSessionWithAudio(): TestSession {
    return {
      title: 'Session with Audio Recording',
      notes: 'This session includes audio for transcription testing',
      duration: 120,
      audioFile: 'test-audio.mp3'
    };
  }
}

// Common test data patterns
export const TEST_CAMPAIGNS = {
  STANDARD: CampaignFixtures.createCampaign(),
  MINIMAL: CampaignFixtures.createMinimalCampaign(),
  LARGE: CampaignFixtures.createLargeCampaign(),
  MULTIPLE: CampaignFixtures.createMultipleCampaigns(5)
};

export const TEST_SESSIONS = {
  STANDARD: SessionFixtures.createSession(),
  LONG: SessionFixtures.createLongSession(),
  WITH_AUDIO: SessionFixtures.createSessionWithAudio(),
  MULTIPLE: SessionFixtures.createMultipleSessions(3)
};