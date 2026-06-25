#!/usr/bin/env tsx
/**
 * Database seed — default data for the review-app basic flows.
 *
 * Idempotent: safe to run on every boot. Seeds a demo user with one campaign
 * and one fully-processed session (transcription + summary + DM TODO) so a
 * reviewer can exercise sign-in, browse a campaign, and view a completed
 * session WITHOUT any external services (no OpenAI, no object storage).
 *
 * Only runs in the review environment (entrypoint gates on SEED_DATABASE=true).
 * Demo credentials are intentionally well-known and printed below.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed ids make every run idempotent (upsert by id / natural key).
const DEMO_EMAIL = 'demo@example.com'; // @example.com is blocked from AI calls
const DEMO_PASSWORD = 'demodemo123';
const CAMPAIGN_NAME = 'The Sunless Citadel';
const SESSION_ID = 'seed-session-001';

// Precomputed bcryptjs hash of DEMO_PASSWORD (cost 10). Embedded so the seed
// has no runtime deps beyond @prisma/client — the Next.js standalone image does
// not reliably bundle bcryptjs for an out-of-band script like this one.
const DEMO_PASSWORD_HASH = '$2b$10$124CNloSTEqvK4mBS8ijfuC8jGDSJzmSoqEz2sGU5wHAN4k0bu0JG';

async function main(): Promise<void> {
  const passwordHash = DEMO_PASSWORD_HASH;

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      id: 'seed-user-demo',
      email: DEMO_EMAIL,
      name: 'Demo DM',
      password: passwordHash,
    },
  });

  const campaign = await prisma.campaign.upsert({
    where: { userId_name: { userId: user.id, name: CAMPAIGN_NAME } },
    update: {},
    create: {
      name: CAMPAIGN_NAME,
      description:
        'A classic dungeon delve into a ruined fortress swallowed by a ravine. Used as review-app demo data.',
      systemPrompt:
        'You are summarizing a Dungeons & Dragons session. Focus on plot beats, NPCs, and unresolved threads.',
      userId: user.id,
    },
  });

  await prisma.gamingSession.upsert({
    where: { id: SESSION_ID },
    update: {},
    create: {
      id: SESSION_ID,
      userId: user.id,
      campaignId: campaign.id,
      title: 'Session 1 — Into the Citadel',
      sessionDate: new Date('2026-01-15T18:00:00.000Z'),
      status: 'completed',
      duration: 7200,
      transcriptionProgress: 100,
      totalChunks: 2,
      chunksCompleted: 2,
    },
  });

  // Transcriptions have no natural unique key — replace wholesale for idempotency.
  await prisma.transcription.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.transcription.createMany({
    data: [
      {
        sessionId: SESSION_ID,
        startTime: 0,
        endTime: 42.5,
        text: 'The party arrives at the lip of the ravine as dusk settles over the Sunless Citadel.',
        confidence: 0.94,
      },
      {
        sessionId: SESSION_ID,
        startTime: 42.5,
        endTime: 95.0,
        text: 'Talgen the fighter ropes down first, spotting goblin scrawl on the crumbling stone.',
        confidence: 0.91,
      },
      {
        sessionId: SESSION_ID,
        startTime: 95.0,
        endTime: 150.0,
        text: 'A dragonling cries out from somewhere below, and the cleric calls for caution.',
        confidence: 0.89,
      },
    ],
  });

  await prisma.summary.upsert({
    where: { sessionId: SESSION_ID },
    update: {},
    create: {
      sessionId: SESSION_ID,
      summaryText:
        'The party descended into the Sunless Citadel at dusk. Talgen scouted ahead and found goblin markings, while a distant dragonling cry hinted at deeper dangers. They resolved to press on carefully.',
      keyEvents: JSON.stringify([
        'Arrived at the Sunless Citadel ravine',
        'Discovered goblin scrawl on the walls',
        'Heard a dragonling cry from below',
      ]),
      charactersInvolved: JSON.stringify(['Talgen (Fighter)', 'The Cleric']),
    },
  });

  await prisma.dmTodoList.upsert({
    where: { sessionId: SESSION_ID },
    update: {},
    create: {
      sessionId: SESSION_ID,
      content:
        '## DM TODO\n\n- [ ] Stat the dragonling for next session\n- [ ] Decide what the goblin scrawl reveals\n- [ ] Prep the first combat encounter inside the citadel',
    },
  });

  console.log(`[seed] Demo data ready. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[seed] ERROR:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
