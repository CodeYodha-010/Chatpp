import Groq from 'groq-sdk';

let groq = null;

function getGroq() {
  if (!groq) {
    if (!process.env.GROQ_API_KEY) {
      console.warn('[groq] GROQ_API_KEY not set — AI priority classification disabled');
      return null;
    }
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

async function classifyPriority(message) {
  try {
    const client = getGroq();
    if (!client) return 'fyi';

    const completion = await client.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Classify this chat message as ONE word only:
                    - "urgent" (action needed, time-sensitive, @mentions, deadlines, blockers)
                    - "fyi" (informational, no action needed, status updates, FYI)
                    - "social" (greetings, jokes, casual chat, emojis, lol, haha, good morning)

                    Examples:
                    "Server is down!" → urgent
                    "Meeting at 3 PM" → fyi
                    "lol that's funny" → social
                    "Can someone help?" → urgent
                    "good morning team" → social
                    "Q3 report ready" → fyi

                    Return ONLY the word. No explanation.`
        },
        { role: 'user', content: message }
      ],
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      max_tokens: 300
    });
    const priority = completion.choices[0].message.content.trim().toLowerCase();
    return ['urgent', 'fyi', 'social'].includes(priority) ? priority : 'fyi';
  } catch (err) {
    console.error('Classification failed:', err.message);
    return 'fyi';
  }
}

export { classifyPriority };
