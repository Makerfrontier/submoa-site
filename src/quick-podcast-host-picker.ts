// src/quick-podcast-host-picker.ts
// Uses Gemini Flash via OpenRouter to pick 1-3 hosts from the user's library
// with complementary positions for the topic.

export interface HostPick {
  host_id: string;
  position_preset: string;
  position_direction: string;
  speaker_order: number;
  selection_rationale: string;
}

const SYSTEM_PROMPT = `You are casting hosts for a podcast episode. Given a topic and a list of available hosts, pick 2-3 hosts with COMPLEMENTARY positions that will produce an interesting conversation.

RULES:
- For Conversation mode: pick hosts whose personalities + recurring viewpoints will naturally disagree, push back, or reframe each other on this topic. Avoid picking 3 hosts who would all say the same thing.
- For Solo mode: pick the SINGLE best host whose personality and viewpoint best matches the topic. Return only one host.
- Use the position_preset from this list: agrees, disagrees, skeptical, devils_advocate, curious_moderator, expert, outsider, storyteller, comic_relief, interviewer, pragmatist, idealist, historian, futurist, provocateur, mediator, personal_stake, academic, industry_insider, critic.
- For each host, write a short position_direction (1-2 sentences) explaining what unique angle they bring to THIS specific topic.
- speaker_order matters: put the host who should open the show first.

OUTPUT (JSON only, no markdown):
{
  "picks": [
    {
      "host_id": "host_id_from_input",
      "position_preset": "preset_id",
      "position_direction": "Brings X angle because...",
      "speaker_order": 1,
      "selection_rationale": "Why this host fits this topic"
    }
  ]
}`;

export async function pickHostsForTopic(
  openrouterKey: string,
  topic: string,
  mode: 'conversation' | 'solo',
  availableHosts: Array<{
    id: string;
    name: string;
    voice_id: string;
    personality: string;
    recurring_viewpoint: string;
    tags: string[];
  }>,
): Promise<HostPick[]> {
  if (!availableHosts.length) return [];
  const targetCount = mode === 'solo' ? 1 : (availableHosts.length >= 3 ? 3 : 2);

  const fallback = (): HostPick[] => availableHosts.slice(0, targetCount).map((h, i) => ({
    host_id: h.id,
    position_preset: i === 0 ? 'curious_moderator' : i === 1 ? 'expert' : 'skeptical',
    position_direction: 'Default fallback selection — host picker unavailable.',
    speaker_order: i + 1,
    selection_rationale: 'Picked as fallback.',
  }));

  const hostBlocks = availableHosts.map(h => `
=== ${h.name} (id: ${h.id}, voice: ${h.voice_id}) ===
Personality: ${h.personality}
Recurring viewpoint: ${h.recurring_viewpoint}
Tags: ${(h.tags || []).join(', ')}`).join('\n');

  const userMessage = `TOPIC: ${topic}
MODE: ${mode}
TARGET HOST COUNT: ${targetCount}

AVAILABLE HOSTS:
${hostBlocks}

Pick the ${targetCount} best host(s). Return JSON only.`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://submoacontent.com',
        'X-Title': 'SubMoa Quick Podcast — Host Picker',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    });
    if (!res.ok) return fallback();
    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '{"picks":[]}';
    const parsed = JSON.parse(text);
    const picks: HostPick[] = Array.isArray(parsed.picks) ? parsed.picks : [];
    if (picks.length === 0) return fallback();
    // Validate every pick has a host_id that exists
    const validIds = new Set(availableHosts.map(h => h.id));
    const filtered = picks.filter(p => validIds.has(p.host_id));
    return filtered.length > 0 ? filtered : fallback();
  } catch {
    return fallback();
  }
}
