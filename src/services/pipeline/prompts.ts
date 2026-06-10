/**
 * Prompt builders for AI pipeline steps. Shared by the background worker and
 * the on-demand regenerate endpoints so both paths produce identical prompts.
 */

export function buildSummaryPrompt(transcript: string, campaignSystemPrompt?: string | null): string {
  let basePrompt = `You are a skilled storyteller and D&D campaign chronicler. Below is a transcript of a D&D session. Please create an engaging summary that:

1. Tells the story of what happened in this session
2. Identifies key events, decisions, and character moments
3. Mentions which characters were involved in important scenes
4. Maintains the narrative flow and excitement of the session
5. Uses the character names provided
6. Focuses on story elements, combat highlights, and character development`;

  if (campaignSystemPrompt) {
    basePrompt += `\n\nCampaign Context:\n${campaignSystemPrompt}`;
  }

  basePrompt += `\n\nHere's the transcript:\n\n${transcript}\n\nPlease provide a compelling summary that captures the essence of this D&D session.`;

  return basePrompt;
}

export function buildDmTodoPrompt(transcript: string, campaignSystemPrompt?: string | null): string {
  let basePrompt = `You are an experienced Dungeon Master assistant. Below is a transcript of a D&D session. Please create a comprehensive TODO list for the DM to help them prepare for the next session.

Your TODO list should be formatted in Markdown and include:

1. **Follow-ups on unresolved plot threads** - any cliffhangers, unanswered questions, or incomplete quests
2. **NPCs to develop** - characters mentioned who need more detail or backstory
3. **Locations to flesh out** - places the party plans to visit or showed interest in
4. **Rewards and loot** - items, treasure, or experience to distribute
5. **Consequences to implement** - results of player decisions or actions
6. **Combat encounters to prepare** - if the party is heading into danger
7. **Rules clarifications** - any mechanics that came up and need review
8. **Player character threads** - individual character goals or developments to address

Format the output as a clean Markdown TODO list with headers and checkboxes. Be specific and actionable.
When making this list, start by calling out the Three most important items first.
DO NOT create items for the sake of filling out the list. Only create items that are actually relevant to the sessio and followup.
Avoid adding simple generic items, only include TODO items that come out of the transcript.`;

  if (campaignSystemPrompt) {
    basePrompt += `\n\nCampaign Context:\n${campaignSystemPrompt}`;
  }

  basePrompt += `\n\nSession Transcript:\n\n${transcript}\n\nPlease provide a detailed TODO list to help the DM prepare for the next session.`;

  return basePrompt;
}

export function joinTranscriptions(transcriptions: Array<{ text: string }>): string {
  return transcriptions.map(t => t.text).join(' ');
}
