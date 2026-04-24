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
app.use(express.json({ limit: '10mb' })); // large enough for base64 audio

// ─── Anthropic client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── In-memory meal log ───────────────────────────────────────────────────────
let mealLog = [];

// ─── Push notification helper ─────────────────────────────────────────────────
// Sends an Expo push notification via the Expo Push API (no SDK needed).
// jobId dedup prevents double-notifications when the client retries a request
// whose response never reached it (e.g. app closed mid-flight).
const _sentJobIds = new Map(); // jobId → timestamp

async function sendMealPushNotification(pushToken, mealName, jobId) {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return;

  // Deduplicate by jobId (10-minute TTL keeps the map small)
  if (jobId) {
    const now = Date.now();
    if (_sentJobIds.has(jobId)) {
      console.log('[push] dedup — already sent for job:', jobId);
      return;
    }
    _sentJobIds.set(jobId, now);
    // Prune stale entries so the map never grows unbounded
    if (_sentJobIds.size > 500) {
      const cutoff = now - 10 * 60 * 1000;
      for (const [id, ts] of _sentJobIds) {
        if (ts < cutoff) _sentJobIds.delete(id);
      }
    }
  }

  try {
    const body = JSON.stringify({
      to:    pushToken,
      sound: 'default',
      title: 'Meal Logged',
      body:  `${mealName} has been logged successfully`,
      // data.type lets the app suppress this alert when it's already in foreground
      data:  { type: 'meal_logged', jobId: jobId || null },
    });

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    const result = await res.json();
    const status = result?.data?.status ?? result?.status;
    console.log('[push] sent for meal:', mealName, '| status:', status);
  } catch (e) {
    console.warn('[push] notification failed:', e.message);
  }
}

// ─── System prompt builder ────────────────────────────────────────────────────
// Built per-request so it includes the user's current goals, logged totals,
// and their personal food history for personalised suggestions.
function buildSystemPrompt(userProfile, foodPreferences = []) {
  const p = userProfile || {};

  const goalLine = p.goal === 'lose'     ? 'lose body fat'
                 : p.goal === 'gain'     ? 'build muscle and gain weight'
                 : p.goal === 'maintain' ? 'maintain their current weight'
                 : 'stay healthy';

  const calTarget  = p.calorieTarget || 2000;
  const protTarget = p.proteinTarget || 150;
  const carbTarget = p.carbTarget    || 225;
  const fatTarget  = p.fatTarget     || 56;

  const calLogged  = p.loggedCalories || 0;
  const protLogged = p.loggedProtein  || 0;
  const carbLogged = p.loggedCarbs    || 0;
  const fatLogged  = p.loggedFat      || 0;

  const calLeft  = calTarget  - calLogged;
  const protLeft = protTarget - protLogged;
  const carbLeft = carbTarget - carbLogged;
  const fatLeft  = fatTarget  - fatLogged;

  // Describe what's actually needed today in plain English for the AI to use
  const gapLines = [];
  if (protLeft > 40)  gapLines.push(`protein is low (${protLeft}g still needed)`);
  if (calLeft  > 500) gapLines.push(`calories are low (${calLeft} kcal still needed)`);
  if (calLeft  < -200) gapLines.push(`calories are over target by ${Math.abs(calLeft)} kcal`);
  const gapSummary = gapLines.length
    ? `Key gaps today: ${gapLines.join(', ')}.`
    : 'Macros are roughly on track for today.';

  const profileSection = p.calorieTarget ? `
USER PROFILE:
- Goal: ${goalLine}
- Daily targets: ${calTarget} kcal | Protein ${protTarget}g | Carbs ${carbTarget}g | Fat ${fatTarget}g
- Activity: ${p.activityLevel || 'moderate'}
- Logged today: ${calLogged} kcal | Protein ${protLogged}g | Carbs ${carbLogged}g | Fat ${fatLogged}g
- Remaining: ${calLeft} kcal | Protein ${protLeft}g | Carbs ${carbLeft}g | Fat ${fatLeft}g
- ${gapSummary}
` : '';

  const dietLine    = p.dietaryRestrictions?.trim()
    ? `DIETARY RESTRICTIONS (hard rule, never violate): ${p.dietaryRestrictions}`
    : '';
  const allergyLine = p.allergies?.trim()
    ? `ALLERGIES (safety-critical, never suggest these): ${p.allergies}`
    : '';
  const safetySection = (dietLine || allergyLine)
    ? `\n${dietLine ? dietLine + '\n' : ''}${allergyLine ? allergyLine + '\n' : ''}`
    : '';

  // Food the user actually eats — use these first when suggesting anything
  const prefSection = foodPreferences.length ? `
FOODS THIS USER ACTUALLY EATS (ranked by how often they log them):
${foodPreferences.slice(0, 10).map((f, i) => `${i + 1}. ${f.name} (${f.count}x logged)`).join('\n')}

When suggesting food: pull from this list first. Suggest things they already eat, not random healthy foods. If none fit, suggest something close in style. Never give generic advice when you have this data.
` : '';

  // Valid imageKey values (must be one of these — used to fetch a food photo):
  const imageKeys = 'chicken, turkey, beef, steak, pork, salmon, tuna, shrimp, egg, rice, pasta, bread, oats, oatmeal, potato, sweetpotato, banana, apple, salad, broccoli, spinach, avocado, yogurt, cheese, milk, nuts, almonds, soup, pizza, burger, sandwich, sushi, tacos, coffee, smoothie, protein_shake, default';

  return `You are FoodChat AI, a nutrition coach built into a mobile app. You text like a knowledgeable friend who knows exactly what the user eats, what their goals are, and what they actually need right now. You are direct, warm, slightly playful, and never robotic.

${profileSection}${safetySection}${prefSection}
YOUR VOICE:
You sound like a coach texting a client, not a nutrition report. You are specific ("grab some chicken and rice" not "eat a high-protein meal"). You reference what they actually eat when you know it. You pick up on patterns. You never pad responses with filler.

RESPONSE LENGTH (strict):
Every response is 2 to 4 sentences maximum. No exceptions.
- Meal log confirmation: 2 sentences. Confirm it, add one quick practical note.
- Advice or questions: 2 to 4 sentences. Get to the point immediately.
- Never write a paragraph that could be cut in half. If you can say it in 2 sentences, use 2.

TONE EXAMPLES:
WRONG: "You've got 163g of protein left today which is quite a lot. Here are some high-protein options you might consider..."
RIGHT: "You've got a lot of protein left today. Go with chicken and rice or a Chipotle bowl with double chicken and you'll make a dent in it."

WRONG: "That's a great choice! Eggs are an excellent source of protein and healthy fats, making them a wonderful addition to your diet."
RIGHT: "Solid. Eggs are doing work for you right now, especially with protein still low."

WRONG: "Based on your remaining macros, I would suggest considering some options that align with your goals."
RIGHT: "You're low on protein. Throw some Greek yogurt or chicken in there before the day's over."

FORMAT RULES (breaking these breaks the app):
- No markdown: no # headings, no **bold**, no *italic*, no bullet lists, no numbered lists, no --- dividers, no tables
- No em dashes (do not use the character —)
- No "Here's what I'd suggest:" or similar setup phrases. Just say it.
- Plain sentences only, like a text message

EMOJI RULES:
- Use 0 to 2 emojis per response
- Vary them naturally across responses. Use food emojis, energy emojis, thumbs up, etc.
- Do NOT use the same emoji every time
- Do NOT use 💪 as a default. Rotate through options like 👍 🔥 ✅ 🍗 🥚 🎯 and others
- Never force an emoji if the message doesn't call for it

PROACTIVE COACHING:
When the user asks how they're doing or what to eat, look at the gaps and suggest 1 or 2 specific foods they actually eat. Don't list 5 options. Pick the best 1 or 2 based on their history and what they need most right now.

LOGGING RULES:

MEAL LOGGING: You MUST output a <meal_log> block when the user states they already ate food OR drank a caloric beverage.
Caloric beverages (always log): juice, soda, beer, wine, spirits, coffee with milk or sugar, latte, cappuccino, smoothie, protein shake, sports drink, energy drink, milk, oat milk.
Trigger phrases: "I had", "I ate", "I just ate", "I just had", "I'm eating", "I'm having", "I drank [caloric drink]", "log this", "add this", "track this", "I finished".

NEVER log for:
- Plain water
- Meal suggestions or plans
- Nutrition questions
- Hypothetical food ("I'm going to have", "what if I had")
- Analysis requests

When logging: output the <meal_log> block first, then confirm in 2 sentences max.

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
imageKey must be exactly one of: ${imageKeys}
Pick the one that best matches the main food. Macros must be accurate for a normal serving size.
`;
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
  const { message, history = [], userProfile, foodPreferences = [], pushToken, jobId } = req.body;

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
      // Fire-and-forget — don't block the HTTP response waiting for Expo
      sendMealPushNotification(pushToken, meal.name, jobId).catch(() => {});
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
  const { imageBase64, mimeType = 'image/jpeg', userProfile, foodPreferences = [], pushToken } = req.body;

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
      sendMealPushNotification(pushToken, meal.name, null).catch(() => {});
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

// ─── POST /transcribe — voice-to-text via OpenAI Whisper ─────────────────────
// Used by the iOS app (expo-av recording → base64 m4a → Whisper → text).
// Requires OPENAI_API_KEY env var on Render. Falls back gracefully if missing.
app.post('/transcribe', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Transcription service not configured. Add OPENAI_API_KEY to Render environment variables.' });
  }

  const { audioBase64, mimeType = 'audio/m4a' } = req.body;
  if (!audioBase64) return res.status(400).json({ error: 'audioBase64 is required' });

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([audioBuffer], { type: mimeType });

    const formData = new FormData();
    formData.set('file', blob, 'recording.m4a');
    formData.set('model', 'whisper-1');
    formData.set('language', 'en');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body:    formData,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Whisper error ${whisperRes.status}`);
    }

    const data = await whisperRes.json();
    res.json({ transcript: data.text || '' });
  } catch (err) {
    console.error('[transcribe error]', err.message);
    res.status(500).json({ error: err.message });
  }
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
