# Implement Test Data Management Strategy

## Description
Create a comprehensive test data management system for consistent, reproducible tests across all environments. This includes database seeding, test factories, data anonymization, and reset functionality.

## Problem Statement
Current testing challenges:
- Inconsistent test data across test runs
- Test interdependencies due to shared data
- No production data sampling for realistic testing
- Manual test data creation is time-consuming
- No data privacy compliance for test environments
- Difficulty reproducing bugs due to data differences

## Tasks
- [ ] Create database seeding scripts
- [ ] Implement test data factories
- [ ] Build data anonymization tools
- [ ] Add test environment reset functionality
- [ ] Create production data sampling (anonymized)
- [ ] Implement test data versioning
- [ ] Add data generation CLI tools
- [ ] Create data snapshot/restore mechanism
- [ ] Build test data documentation
- [ ] Add GDPR compliance tooling

## Implementation Details

### 1. Database Seeding (`prisma/seed.ts`)
```typescript
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface SeedConfig {
  users: number;
  campaigns: number;
  sessionsPerCampaign: number;
  uploadsPerSession: number;
}

async function seed(config: SeedConfig) {
  console.log('🌱 Starting database seed...');
  
  // Clear existing data
  await clearDatabase();
  
  // Create users
  const users = await createUsers(config.users);
  
  // Create campaigns for each user
  for (const user of users) {
    const campaigns = await createCampaigns(user.id, config.campaigns);
    
    // Create sessions for each campaign
    for (const campaign of campaigns) {
      await createSessions(campaign.id, config.sessionsPerCampaign, config.uploadsPerSession);
    }
  }
  
  // Create shared test data
  await createSharedTestData();
  
  console.log('✅ Database seeded successfully');
}

async function createUsers(count: number) {
  const users = [];
  
  // Always create standard test users
  const testUsers = [
    { email: 'admin@test.com', name: 'Admin User', role: 'admin' },
    { email: 'user@test.com', name: 'Test User', role: 'user' },
    { email: 'viewer@test.com', name: 'Test Viewer', role: 'viewer' }
  ];
  
  for (const testUser of testUsers) {
    const user = await prisma.user.create({
      data: {
        ...testUser,
        password: await bcrypt.hash('TestPass123!', 10),
        emailVerified: new Date()
      }
    });
    users.push(user);
  }
  
  // Create additional random users
  for (let i = 0; i < count - testUsers.length; i++) {
    const user = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        password: await bcrypt.hash('TestPass123!', 10),
        role: faker.helpers.arrayElement(['user', 'user', 'viewer']), // More users than viewers
        emailVerified: faker.date.past()
      }
    });
    users.push(user);
  }
  
  return users;
}

async function createCampaigns(userId: string, count: number) {
  const campaigns = [];
  
  for (let i = 0; i < count; i++) {
    const campaign = await prisma.campaign.create({
      data: {
        name: `${faker.company.name()} Campaign`,
        description: faker.lorem.paragraph(),
        userId,
        settings: {
          players: faker.helpers.arrayElements([
            faker.person.firstName(),
            faker.person.firstName(),
            faker.person.firstName(),
            faker.person.firstName(),
            faker.person.firstName()
          ], { min: 2, max: 5 }),
          gameSystem: faker.helpers.arrayElement(['D&D 5e', 'Pathfinder', 'Call of Cthulhu']),
          worldName: faker.location.city()
        },
        createdAt: faker.date.past()
      }
    });
    campaigns.push(campaign);
  }
  
  return campaigns;
}

// Seed command
async function main() {
  const args = process.argv.slice(2);
  const environment = args[0] || 'development';
  
  const configs: Record<string, SeedConfig> = {
    minimal: { users: 3, campaigns: 1, sessionsPerCampaign: 2, uploadsPerSession: 1 },
    development: { users: 10, campaigns: 3, sessionsPerCampaign: 5, uploadsPerSession: 2 },
    staging: { users: 20, campaigns: 5, sessionsPerCampaign: 10, uploadsPerSession: 3 },
    stress: { users: 100, campaigns: 10, sessionsPerCampaign: 20, uploadsPerSession: 5 }
  };
  
  await seed(configs[environment] || configs.development);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### 2. Test Data Factories (`tests/factories/index.ts`)
```typescript
import { faker } from '@faker-js/faker';

export class UserFactory {
  static build(overrides = {}) {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
      role: 'user',
      createdAt: faker.date.past(),
      ...overrides
    };
  }
  
  static buildList(count: number, overrides = {}) {
    return Array.from({ length: count }, () => this.build(overrides));
  }
}

export class CampaignFactory {
  static build(overrides = {}) {
    return {
      id: faker.string.uuid(),
      name: `${faker.company.name()} Campaign`,
      description: faker.lorem.paragraph(),
      userId: faker.string.uuid(),
      createdAt: faker.date.past(),
      ...overrides
    };
  }
  
  static buildWithSessions(sessionCount = 3) {
    const campaign = this.build();
    const sessions = SessionFactory.buildList(sessionCount, { campaignId: campaign.id });
    return { ...campaign, sessions };
  }
}

export class SessionFactory {
  static build(overrides = {}) {
    return {
      id: faker.string.uuid(),
      title: `Session ${faker.number.int({ min: 1, max: 100 })}`,
      date: faker.date.recent(),
      campaignId: faker.string.uuid(),
      notes: faker.lorem.paragraphs(3),
      audioUrl: faker.internet.url(),
      duration: faker.number.int({ min: 1800, max: 14400 }), // 30min to 4 hours
      ...overrides
    };
  }
  
  static buildWithTranscription() {
    const session = this.build();
    const transcription = TranscriptionFactory.build({ sessionId: session.id });
    return { ...session, transcription };
  }
}

export class AudioFileFactory {
  static generateTestFile(sizeInMB = 10) {
    // Generate a test audio file buffer
    const sampleRate = 44100;
    const duration = sizeInMB * 8; // Rough approximation
    const samples = sampleRate * duration;
    
    // Create WAV header
    const buffer = Buffer.alloc(44 + samples * 2);
    // ... WAV header implementation
    
    return buffer;
  }
  
  static build(overrides = {}) {
    return {
      id: faker.string.uuid(),
      filename: `recording_${faker.date.past().getTime()}.mp3`,
      size: faker.number.int({ min: 1000000, max: 100000000 }), // 1MB to 100MB
      duration: faker.number.int({ min: 60, max: 7200 }), // 1min to 2 hours
      mimeType: 'audio/mpeg',
      url: faker.internet.url(),
      ...overrides
    };
  }
}
```

### 3. Data Anonymization (`scripts/anonymize-data.ts`)
```typescript
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface AnonymizationRules {
  users: {
    email: (original: string) => string;
    name: (original: string) => string;
    preserve: string[];
  };
  sessions: {
    notes: (original: string) => string;
    transcription: (original: string) => string;
  };
}

const rules: AnonymizationRules = {
  users: {
    email: (original) => {
      const [localPart, domain] = original.split('@');
      const hash = crypto.createHash('md5').update(localPart).digest('hex').substring(0, 8);
      return `user_${hash}@example.com`;
    },
    name: () => faker.person.fullName(),
    preserve: ['admin@test.com', 'user@test.com'] // Don't anonymize test accounts
  },
  sessions: {
    notes: (original) => {
      // Replace names with placeholders
      return original
        .replace(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g, '[PLAYER_NAME]')
        .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    },
    transcription: (original) => {
      // Similar to notes but preserve game content
      return original.replace(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g, (match) => {
        // Preserve character names but anonymize player names
        if (isCharacterName(match)) return match;
        return '[PLAYER_NAME]';
      });
    }
  }
};

async function anonymizeDatabase() {
  console.log('🔒 Starting data anonymization...');
  
  // Anonymize users
  const users = await prisma.user.findMany();
  for (const user of users) {
    if (rules.users.preserve.includes(user.email)) continue;
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: rules.users.email(user.email),
        name: rules.users.name(user.name),
        // Clear sensitive fields
        phone: null,
        address: null
      }
    });
  }
  
  // Anonymize sessions
  const sessions = await prisma.session.findMany();
  for (const session of sessions) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        notes: session.notes ? rules.sessions.notes(session.notes) : null
      }
    });
  }
  
  console.log('✅ Data anonymization complete');
}

// Export anonymized data for testing
async function exportAnonymizedData(outputPath: string) {
  await anonymizeDatabase();
  
  // Export to SQL dump
  const { exec } = require('child_process');
  exec(`pg_dump ${process.env.DATABASE_URL} > ${outputPath}`, (error) => {
    if (error) {
      console.error('Export failed:', error);
      return;
    }
    console.log(`📦 Anonymized data exported to ${outputPath}`);
  });
}
```

### 4. Test Environment Reset (`scripts/reset-test-env.ts`)
```typescript
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

interface ResetOptions {
  keepUsers?: boolean;
  keepCampaigns?: boolean;
  clearUploads?: boolean;
  resetToSnapshot?: string;
}

export async function resetTestEnvironment(options: ResetOptions = {}) {
  console.log('🔄 Resetting test environment...');
  
  if (options.resetToSnapshot) {
    // Restore from snapshot
    await restoreFromSnapshot(options.resetToSnapshot);
  } else {
    // Selective reset
    if (!options.keepUsers) {
      await prisma.user.deleteMany({
        where: { email: { not: { in: ['admin@test.com', 'user@test.com'] } } }
      });
    }
    
    if (!options.keepCampaigns) {
      await prisma.campaign.deleteMany();
    }
    
    // Always clear sessions and related data
    await prisma.session.deleteMany();
    await prisma.upload.deleteMany();
    await prisma.transcription.deleteMany();
    await prisma.summary.deleteMany();
    
    if (options.clearUploads) {
      // Clear uploaded files
      const uploadsDir = path.join(process.cwd(), 'uploads');
      await fs.rm(uploadsDir, { recursive: true, force: true });
      await fs.mkdir(uploadsDir, { recursive: true });
    }
  }
  
  // Re-seed with base data
  await seedBaseData();
  
  console.log('✅ Test environment reset complete');
}

async function createSnapshot(name: string) {
  const snapshotDir = path.join(process.cwd(), 'test-snapshots');
  await fs.mkdir(snapshotDir, { recursive: true });
  
  const snapshotPath = path.join(snapshotDir, `${name}.sql`);
  
  // Create database dump
  await execAsync(`pg_dump ${process.env.DATABASE_URL} > ${snapshotPath}`);
  
  // Copy uploads directory
  const uploadsSnapshot = path.join(snapshotDir, `${name}-uploads`);
  await execAsync(`cp -r uploads ${uploadsSnapshot}`);
  
  console.log(`📸 Snapshot created: ${name}`);
  return snapshotPath;
}

async function restoreFromSnapshot(name: string) {
  const snapshotPath = path.join(process.cwd(), 'test-snapshots', `${name}.sql`);
  
  // Check if snapshot exists
  await fs.access(snapshotPath);
  
  // Drop and recreate database
  await prisma.$executeRaw`DROP SCHEMA public CASCADE`;
  await prisma.$executeRaw`CREATE SCHEMA public`;
  
  // Restore from snapshot
  await execAsync(`psql ${process.env.DATABASE_URL} < ${snapshotPath}`);
  
  // Restore uploads
  const uploadsSnapshot = path.join(process.cwd(), 'test-snapshots', `${name}-uploads`);
  await execAsync(`rm -rf uploads && cp -r ${uploadsSnapshot} uploads`);
  
  console.log(`♻️ Restored from snapshot: ${name}`);
}
```

### 5. Test Data CLI (`scripts/test-data-cli.ts`)
```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { seed } from './seed';
import { resetTestEnvironment } from './reset-test-env';
import { anonymizeDatabase } from './anonymize-data';

const program = new Command();

program
  .name('test-data')
  .description('Test data management CLI')
  .version('1.0.0');

program
  .command('seed')
  .description('Seed the database with test data')
  .option('-e, --env <environment>', 'Environment preset (minimal|development|staging|stress)', 'development')
  .option('-u, --users <count>', 'Number of users to create', '10')
  .option('-c, --campaigns <count>', 'Campaigns per user', '3')
  .option('-s, --sessions <count>', 'Sessions per campaign', '5')
  .action(async (options) => {
    await seed({
      users: parseInt(options.users),
      campaigns: parseInt(options.campaigns),
      sessionsPerCampaign: parseInt(options.sessions),
      uploadsPerSession: 2
    });
  });

program
  .command('reset')
  .description('Reset test environment')
  .option('--keep-users', 'Keep existing users')
  .option('--keep-campaigns', 'Keep existing campaigns')
  .option('--clear-uploads', 'Clear uploaded files')
  .option('--snapshot <name>', 'Reset to named snapshot')
  .action(async (options) => {
    await resetTestEnvironment(options);
  });

program
  .command('snapshot')
  .description('Create a data snapshot')
  .argument('<name>', 'Snapshot name')
  .action(async (name) => {
    await createSnapshot(name);
  });

program
  .command('anonymize')
  .description('Anonymize sensitive data')
  .option('-o, --output <path>', 'Output path for anonymized dump')
  .action(async (options) => {
    await anonymizeDatabase();
    if (options.output) {
      await exportAnonymizedData(options.output);
    }
  });

program
  .command('generate')
  .description('Generate specific test data')
  .option('-t, --type <type>', 'Data type (user|campaign|session|audio)')
  .option('-n, --count <count>', 'Number to generate', '1')
  .action(async (options) => {
    const factories = {
      user: UserFactory,
      campaign: CampaignFactory,
      session: SessionFactory,
      audio: AudioFileFactory
    };
    
    const factory = factories[options.type];
    if (!factory) {
      console.error(`Unknown type: ${options.type}`);
      process.exit(1);
    }
    
    const data = factory.buildList(parseInt(options.count));
    console.log(JSON.stringify(data, null, 2));
  });

program.parse();
```

### 6. Package.json Scripts
```json
{
  "scripts": {
    "db:seed": "tsx prisma/seed.ts",
    "db:seed:minimal": "tsx prisma/seed.ts minimal",
    "db:seed:staging": "tsx prisma/seed.ts staging",
    "db:reset": "tsx scripts/reset-test-env.ts",
    "db:snapshot": "tsx scripts/test-data-cli.ts snapshot",
    "db:anonymize": "tsx scripts/test-data-cli.ts anonymize",
    "test:data": "tsx scripts/test-data-cli.ts"
  }
}
```

### 7. GitHub Action for Test Data (`.github/workflows/test-data.yml`)
```yaml
name: Test Data Management
on:
  workflow_dispatch:
    inputs:
      action:
        description: 'Action to perform'
        required: true
        type: choice
        options:
          - seed
          - reset
          - snapshot
          - anonymize
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options:
          - development
          - staging
          - test

jobs:
  manage-test-data:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Setup database connection
      run: |
        echo "DATABASE_URL=${{ secrets.DATABASE_URL }}" >> .env
        
    - name: Execute action
      run: |
        case "${{ github.event.inputs.action }}" in
          seed)
            npm run db:seed:${{ github.event.inputs.environment }}
            ;;
          reset)
            npm run db:reset
            ;;
          snapshot)
            npm run db:snapshot -- $(date +%Y%m%d_%H%M%S)
            ;;
          anonymize)
            npm run db:anonymize
            ;;
        esac
        
    - name: Upload artifacts
      if: github.event.inputs.action == 'snapshot' || github.event.inputs.action == 'anonymize'
      uses: actions/upload-artifact@v4
      with:
        name: test-data-${{ github.event.inputs.action }}-${{ github.run_id }}
        path: |
          test-snapshots/
          anonymized-data/
```

## Acceptance Criteria
- [ ] Consistent test data across all environments
- [ ] Fast database reset between test runs (< 10 seconds)
- [ ] Realistic test scenarios with varied data
- [ ] No PII in test environments
- [ ] Test data versioning and snapshots working
- [ ] CLI tools documented and easy to use
- [ ] Automated test data generation in CI
- [ ] GDPR compliance for test data
- [ ] Performance testing with large datasets

## Privacy & Compliance Requirements
- All personal data anonymized in non-production
- Test emails use example.com domain
- Phone numbers replaced with test patterns
- Addresses removed or generalized
- Names replaced with generated ones
- Audit trail for data anonymization

## Definition of Done
- [ ] All factories implemented
- [ ] Seeding scripts working
- [ ] Anonymization tested and verified
- [ ] CLI tools documented
- [ ] CI/CD integration complete
- [ ] Team trained on tools
- [ ] Performance benchmarks met
- [ ] Compliance review passed

## Notes
- Consider using Docker volumes for snapshot storage
- Plan for test data versioning strategy
- Add data validation after seeding
- Consider synthetic data generation for ML testing
- Plan for test data archival policy

## Related Issues
- Supports: All testing issues (#1, #2, #5)
- Related to: #3 (Staging environment)

## Estimated Effort
- **Size:** Medium (5 story points)
- **Time:** 2-3 days
- **Priority:** Low (nice to have, but important for scale)

## Labels
`testing`, `database`, `tooling`, `priority-low`, `infrastructure`