require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const https     = require('https');
const fs        = require('fs');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app  = express();
const port = process.env.PORT || 3001;

// ─── Promo code store (file-backed) ──────────────────────────────────────────
const PROMO_FILE = path.join(__dirname, 'promo_redemptions.json');

// Master list of valid codes. Set revoked: true to disable a code without
// deleting its redemption history.
let promoData = {
  codes: {
    Squidward22: { revoked: false, plan: 'lifetime_free', redemptions: [] },
  },
};

try {
  const raw    = fs.readFileSync(PROMO_FILE, 'utf8');
  const loaded = JSON.parse(raw);
  // Deep-merge so new codes in the source list aren't lost on restart,
  // but saved revoked state and redemptions from disk take precedence.
  if (loaded.codes) {
    for (const [code, saved] of Object.entries(loaded.codes)) {
      if (promoData.codes[code]) {
        promoData.codes[code] = { ...promoData.codes[code], ...saved };
      }
    }
  }
} catch (_) {
  // File doesn't exist yet — created on first redemption.
}

function savePromoData() {
  try {
    fs.writeFileSync(PROMO_FILE, JSON.stringify(promoData, null, 2), 'utf8');
  } catch (err) {
    console.error('[promo] failed to persist redemptions:', err.message);
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Anthropic client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── In-memory meal log ───────────────────────────────────────────────────────
let mealLog = [];

// ─── System prompt builder ────────────────────────────────────────────────────
// Built per-request so it includes the user's current goals, logged totals,
// and their personal food history for personalised suggestions.
function buildSystemPrompt(userProfile, foodPreferences = []) {
  const p = userProfile || {};

  const goalLine = p.goal === 'lose'     ? 'lose body fat'
                 : p.goal === 'gain'     ? 'build muscle and gain weight'
                 : p.goal === 'maintain' ? 'maintain their current weight'
                 : 'stay healthy';

  const dietLine    = p.dietaryRestrictions?.trim()
    ? `- Dietary restrictions: ${p.dietaryRestrictions} (NEVER suggest foods that violate these)`
    : '';
  const allergyLine = p.allergies?.trim()
    ? `- Allergies: ${p.allergies} (NEVER suggest anything containing these — this is a safety requirement)`
    : '';

  const profileSection = p.calorieTarget ? `
User profile:
- Goal: ${goalLine}
- Daily targets: ${p.calorieTarget} kcal | Protein ${p.proteinTarget}g | Carbs ${p.carbTarget}g | Fat ${p.fatTarget}g
- Activity level: ${p.activityLevel || 'moderate'}
- Already logged today: ${p.loggedCalories || 0} kcal | Protein ${p.loggedProtein || 0}g | Carbs ${p.loggedCarbs || 0}g | Fat ${p.loggedFat || 0}g
- Remaining today: ${(p.calorieTarget || 2000) - (p.loggedCalories || 0)} kcal | Protein ${(p.proteinTarget || 150) - (p.loggedProtein || 0)}g remaining
${dietLine}
${allergyLine}
` : '';

  const prefSection = foodPreferences.length ? `
Foods this user eats regularly (ranked by recency-weighted frequency — higher rank = more familiar):
${foodPreferences.map((f, i) => `${i + 1}. ${f.name} (logged ${f.count}x)`).join('\n')}

When suggesting meals or foods: prioritise these items and close variations first. Don't force them into every response, but give them clear preference when relevant. The goal is for recommendations to feel like something this specific person would actually eat, not generic advice.
` : '';

  // Valid imageKey values (must be one of these — used to fetch a food photo):
  const imageKeys = 'chicken, turkey, beef, steak, pork, salmon, tuna, shrimp, egg, rice, pasta, bread, oats, oatmeal, potato, sweetpotato, banana, apple, salad, broccoli, spinach, avocado, yogurt, cheese, milk, nuts, almonds, soup, pizza, burger, sandwich, sushi, tacos, coffee, smoothie, protein_shake, default';

  return `You are FoodChat AI — a personal trainer and nutrition coach inside a mobile app. You talk exactly like a real trainer texting a client: short, direct, warm, specific. Never like a report or a document.

${profileSection}${prefSection}
CRITICAL FORMAT RULES — violating these breaks the app UI:
You are FORBIDDEN from using any markdown whatsoever. That means:
  NO # or ## headings
  NO ** bold ** or * italic *
  NO - bullet points or numbered lists
  NO --- dividers
  NO tables
  NO "Here's your plan:" followed by structured sections

INSTEAD write plain flowing sentences, like a text message from a trainer. If you need to mention multiple meals across the day, string them together naturally in a paragraph. Macro numbers can be dropped entirely or tucked in briefly at the end of a sentence in parentheses.

WRONG (never do this):
"### Breakfast – Egg & Oat Power Start
- 3 scrambled eggs + 1 cup oatmeal
- ~500 kcal | 28g protein"

RIGHT (always do this):
"For breakfast knock out 3 scrambled eggs with a cup of oatmeal — that's roughly 500 cals and 28g of protein right there to get you going."

LENGTH:
- Meal log confirmation: 2-3 sentences max.
- Advice or meal plan: 1 short paragraph (5-7 sentences). Cover the whole day in that one paragraph. No sections, no headers, no lists.
- One emoji max, only if it feels natural.

BEHAVIOUR:

LOGGING RULES — read every rule before deciding what to output:

─── MEAL LOGGING ───
You MUST output a <meal_log> block when the user states they already ate food OR drank a caloric beverage.
Caloric beverages (MUST use <meal_log>): juice, soda, beer, wine, spirits, coffee with milk/sugar, latte, cappuccino, smoothie, protein shake, sports drink, energy drink, milk, oat milk — anything with calories.
Trigger phrases: "I had", "I ate", "I just ate", "I just had", "I'm eating", "I'm having", "I drank [caloric drink]", "log this", "add this", "track this", "I finished".

NEVER output <meal_log> for:
- Plain water (use <water_log> instead)
- Meal suggestions ("what should I eat", "give me a plan")
- Nutrition questions ("how many calories in X")
- Hypothetical food ("I'm going to have", "what if I had")
- Analysis requests ("how am I doing")

When a meal IS logged: output the <meal_log> block first, then reply in 2-3 sentences confirming it like a trainer with one practical tip.

MEAL LOG FORMAT:
<meal_log>
{
  "logged": true,
  "name": "Descriptive Meal Name",
  "calories": 350,
  "protein": 22,
  "carbs": 38,
  "fat": 9,
  "imageKey": "egg"
}
</meal_log>
imageKey must be one of: ${imageKeys} — pick the one that best matches the primary food. Macros must be accurate for typical serving sizes.

When the user asks for meal suggestions or a plan: write one flowing paragraph. Be specific with food names and amounts. Tie suggestions to their goal (${goalLine}) and what they still need. Sound like you know them.

${(p.dietaryRestrictions?.trim() || p.allergies?.trim()) ? `DIETARY RULES (non-negotiable — always enforce these regardless of what the user asks):
${p.dietaryRestrictions?.trim() ? `- The user follows these dietary restrictions: ${p.dietaryRestrictions}. Every suggestion must respect this.` : ''}
${p.allergies?.trim() ? `- The user is allergic to: ${p.allergies}. NEVER suggest anything containing these ingredients. This is a safety requirement — treat it like a hard rule with no exceptions.` : ''}

` : ''}`;
}

// ─── Helper: strip markdown formatting from AI text ──────────────────────────
function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s*/g, '')          // # headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // **bold**
    .replace(/\*(.+?)\*/g, '$1')        // *italic*
    .replace(/^[-–—]{2,}\s*$/gm, '')    // --- dividers
    .replace(/^\s*[-•]\s+/gm, '')       // - bullet points
    .replace(/^\s*\d+\.\s+/gm, '')      // 1. numbered lists
    .replace(/\|.+\|/g, '')             // | table | rows |
    .replace(/\n{3,}/g, '\n\n')         // collapse excess blank lines
    .trim();
}

// ─── Helper: extract meal data from AI reply ──────────────────────────────────
function parseMealLog(text) {
  const match = text.match(/<meal_log>([\s\S]*?)<\/meal_log>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

// ─── GET /test ────────────────────────────────────────────────────────────────
// Quick sanity-check: confirms the key is loaded and the API responds.
app.get('/test', async (_req, res) => {
  const keyPreview = process.env.ANTHROPIC_API_KEY
    ? process.env.ANTHROPIC_API_KEY.slice(0, 16) + '...'
    : 'NOT SET';

  console.log('[/test] API key loaded:', keyPreview);

  try {
    const response = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 16,
      messages:   [{ role: 'user', content: 'Say "ok"' }],
    });
    res.json({ ok: true, keyPreview, reply: response.content[0]?.text });
  } catch (err) {
    console.error('[/test error]', err.status, err.message, err.error);
    res.status(500).json({
      ok:         false,
      keyPreview,
      status:     err.status,
      message:    err.message,
      detail:     err.error,
    });
  }
});

// ─── POST /chat ───────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  const { message, history = [], userProfile, foodPreferences = [] } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const messages = [
    ...history,
    { role: 'user', content: message.trim() },
  ];

  try {
    const response = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 1024,
      system:     buildSystemPrompt(userProfile, foodPreferences),
      messages,
    });

    const aiText = response.content[0]?.text ?? '';
    const displayText = stripMarkdown(
      aiText
        .replace(/<meal_log>[\s\S]*?<\/meal_log>/, '')
        .trim()
    );

    // parseMealLog returns null when no <meal_log> block exists.
    // meal.logged must be explicitly true — prevents phantom logs from
    // malformed or informational <meal_log> blocks the AI sometimes emits.
    const meal      = parseMealLog(aiText);
    const shouldLog = !!(meal && meal.logged === true && meal.name && meal.calories > 0);

    if (shouldLog) {
      const entry = {
        id:        Date.now(),
        time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name:      meal.name     ?? 'Unknown meal',
        calories:  meal.calories ?? 0,
        protein:   meal.protein  ?? 0,
        carbs:     meal.carbs    ?? 0,
        fat:       meal.fat      ?? 0,
        imageKey:  meal.imageKey ?? 'default',
      };
      mealLog.push(entry);
      console.log('[chat] meal logged:', entry.name, entry.calories, 'kcal | image:', entry.imageKey);
    } else if (meal) {
      console.log('[chat] <meal_log> block found but shouldLog=false (logged:', meal.logged, 'name:', meal.name, 'cal:', meal.calories, ')');
    }

    res.json({
      reply:      displayText,
      mealLogged: shouldLog,
      meal:       shouldLog ? meal : null,
    });

  } catch (err) {
    // Log every field so nothing is hidden
    console.error('[/chat error] status=%s message=%s detail=%j', err.status, err.message, err.error ?? err);

    const status = err.status ?? 500;
    const msg =
      status === 401 ? 'Invalid API key — check ANTHROPIC_API_KEY in backend/.env' :
      status === 429 ? 'Rate limited. Please wait a moment and try again.' :
      err.message    ? err.message :
                       'Unknown error — check the backend terminal for details.';

    res.status(status).json({ error: msg });
  }
});

// ─── POST /analyze-photo ─────────────────────────────────────────────────────
// Accepts a base64-encoded food photo, runs it through Claude vision, and
// returns the same shape as /chat so the frontend can handle both identically.
app.post('/analyze-photo', async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg', userProfile, foodPreferences = [] } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  try {
    const response = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 1024,
      system:     buildSystemPrompt(userProfile, foodPreferences),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          {
            type: 'text',
            text:  'Analyze this food photo. Identify every food item you can see, estimate accurate portion sizes, and log the meal with full nutrition data using the <meal_log> format.',
          },
        ],
      }],
    });

    const aiText      = response.content[0]?.text ?? '';
    const displayText = stripMarkdown(
      aiText
        .replace(/<meal_log>[\s\S]*?<\/meal_log>/, '')
        .trim()
    );

    const meal      = parseMealLog(aiText);
    const shouldLog = !!(meal && meal.logged === true && meal.name && meal.calories > 0);

    if (shouldLog) {
      const entry = {
        id:       Date.now(),
        time:     new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name:     meal.name     ?? 'Photo meal',
        calories: meal.calories ?? 0,
        protein:  meal.protein  ?? 0,
        carbs:    meal.carbs    ?? 0,
        fat:      meal.fat      ?? 0,
        imageKey: meal.imageKey ?? 'default',
      };
      mealLog.push(entry);
      console.log('[photo] meal logged:', entry.name, entry.calories, 'kcal | image:', entry.imageKey);
    }

    res.json({ reply: displayText, mealLogged: shouldLog, meal: shouldLog ? meal : null });

  } catch (err) {
    console.error('[/analyze-photo error] status=%s message=%s detail=%j', err.status, err.message, err.error ?? err);
    const status = err.status ?? 500;
    const msg =
      status === 401 ? 'Invalid API key — check ANTHROPIC_API_KEY in backend/.env' :
      status === 429 ? 'Rate limited. Please wait a moment and try again.' :
      err.message    ? err.message :
                       'Unknown error — check the backend terminal for details.';
    res.status(status).json({ error: msg });
  }
});

// ─── GET /meals ───────────────────────────────────────────────────────────────
app.get('/meals', (req, res) => res.json({ meals: mealLog }));

// ─── DELETE /meals ────────────────────────────────────────────────────────────
app.delete('/meals', (req, res) => { mealLog = []; res.json({ ok: true }); });

// ─── POST /tts ────────────────────────────────────────────────────────────────
// Strips emojis, sends text to ElevenLabs, returns base64 audio.
// The API key never leaves the backend.
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah — conversational, natural

function stripEmojis(text) {
  return text
    // Remove emoji ranges
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{FE00}-\u{FEFF}]/gu, '')
    // Remove any leftover symbol characters
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

app.post('/tts', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  const spokenText = stripEmojis(text);
  if (!spokenText) return res.status(400).json({ error: 'no speakable text after cleaning' });

  const payload = JSON.stringify({
    text: spokenText,
    model_id: 'eleven_turbo_v2_5',   // fast + high quality
    voice_settings: {
      stability:        0.45,
      similarity_boost: 0.80,
      style:            0.10,
      use_speaker_boost: true,
    },
  });

  const options = {
    hostname: 'api.elevenlabs.io',
    path:     `/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    method:   'POST',
    headers: {
      'xi-api-key':    process.env.ELEVENLABS_API_KEY,
      'Content-Type':  'application/json',
      'Accept':        'audio/mpeg',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  try {
    const audioBase64 = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        if (response.statusCode !== 200) {
          let body = '';
          response.on('data', (chunk) => { body += chunk; });
          response.on('end', () => reject(new Error(`ElevenLabs ${response.statusCode}: ${body}`)));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      });
      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    console.log('[/tts] generated audio, bytes (base64 len):', audioBase64.length);
    res.json({ audioBase64, mimeType: 'audio/mpeg' });

  } catch (err) {
    console.error('[/tts error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /promo/redeem ───────────────────────────────────────────────────────
// Validates a promo code and records the redemption.
// Returns { valid: true, plan } on success or { valid: false, error } on failure.
// To revoke a code: open backend/promo_redemptions.json and set "revoked": true.
app.post('/promo/redeem', (req, res) => {
  const { code, userId, email } = req.body;
  if (!code) return res.status(400).json({ valid: false, error: 'code is required' });

  const entry = promoData.codes[code];
  if (!entry || entry.revoked) {
    return res.json({ valid: false, error: 'Invalid code' });
  }

  entry.redemptions.push({
    userId:      userId    || '',
    email:       email     || '',
    redeemedAt:  new Date().toISOString(),
  });
  savePromoData();

  console.log(`[promo] "${code}" redeemed by ${email || userId} → plan: ${entry.plan}`);
  res.json({ valid: true, plan: entry.plan });
});

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'FoodChat AI backend running' }));

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  const anthropicOk   = !!process.env.ANTHROPIC_API_KEY;
  const elevenLabsOk  = !!process.env.ELEVENLABS_API_KEY;
  console.log(`\nFoodChat AI backend running on http://localhost:${port}`);
  console.log(`  ANTHROPIC_API_KEY:   ${anthropicOk  ? 'loaded ✓' : 'MISSING ✗ — check backend/.env'}`);
  console.log(`  ELEVENLABS_API_KEY:  ${elevenLabsOk ? 'loaded ✓' : 'MISSING ✗ — TTS will fail'}`);
  console.log(`  ElevenLabs voice:    ${ELEVENLABS_VOICE_ID}`);
  console.log('  POST /tts     — ElevenLabs text-to-speech');
  console.log('  POST /chat    — AI assistant');
  console.log('  GET  /health  — health check\n');
});
