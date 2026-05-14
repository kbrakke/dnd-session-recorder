# src/app/campaigns/

Campaign management UI pages. Campaigns are containers that group related D&D sessions and provide AI context via system prompts.

## Pages

### `page.tsx` — Campaign List (`/campaigns`)
Displays all user campaigns in a card grid. Features:
- Create/edit campaign modal (name, description, system prompt)
- Inline delete with confirmation
- Session count per campaign
- TanStack React Query mutations with query invalidation

### `[id]/page.tsx` — Campaign Detail (`/campaigns/[id]`)
Detailed campaign view with:
- Campaign metadata (name, description)
- Editable system prompt (sticky editor) — this prompt is injected into AI summary generation to provide campaign context
- Session timeline sorted by date
- Per-session status indicators and action buttons
- Link to create new session under this campaign
- Delete session capability with confirmation

## System Prompt

The `systemPrompt` field on campaigns is a key feature. It provides context to the GPT-4o summary generation (e.g., character names, world lore, ongoing plotlines). This helps the AI produce more relevant and consistent summaries across sessions in the same campaign.
