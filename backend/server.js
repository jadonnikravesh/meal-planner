require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const https      = require('https');
const fs         = require('fs');
const path       = require('path');
const Anthropic  = require('@anthropic-ai/sdk');
const rateLimit  = require('express-rate-limit');
const admin      = require('firebase-admin');

const app  = express();
const port = process.env.PORT || 3001;

// ─── Firebase Admin ───────────────────────────────────────────────────────────
// Requires three env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
// FIREBASE_PRIVATE_KEY (the private key with literal \n for newlines, as
// Render stores it).
let firebaseReady = false;
try {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        // Render stores the key with literal \n — replace so the PEM is valid
        privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    firebaseReady = true;
    console.log('  Firebase Admin:      initialized ✓');
  } else {
    console.warn('  Firebase Admin:      MISSING — auth middleware will use dev bypass ✗');
    console.warn('  Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to enable token verification.');
  }
} catch (err) {
  console.warn('  Firebase Admin:      init failed:', err.message);
}

// ─── Auth middleware ───────────────────────────────────────────────────────────
// Verifies the Firebase ID token sent as "Authorization: Bearer <token>".
// In dev (firebaseReady=false), falls back to req.body.userId so local testing
// still works without credentials. In production this must be a real token.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!firebaseReady) {
    // Dev bypass — no credentials configured
    req.uid = req.body?.userId || 'dev-user';
    return next();
  }

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7));
    req.uid = decoded.uid;
    next();
  } catch (err) {
    console.warn('[auth] token verification failed:', err.message);
    res.status(401).json({ error: 'Invalid or expired session — please log in again.' });
  }
}

// ─── Rate limiters ────────────────────────────────────────────────────────────
const limiter = {
  // Global catch-all — 300 req / 15 min per IP
  global: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — please slow down.' },
  }),

  // Chat — 30 req / 3 hours (Claude Opus, most expensive)
  chat: rateLimit({
    windowMs: 3 * 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Message limit reached — please try again in a few hours.' },
  }),

  // Vision endpoints — 10 req / hour (costly, one-shot per session)
  vision: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Photo analysis limit reached — try again in an hour.' },
  }),

  // TTS — 30 req / 3 hours
  tts: rateLimit({
    windowMs: 3 * 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Voice limit reached — please try again in a few hours.' },
  }),

};

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' })); // large enough for base64 audio
app.use(limiter.global);

// ─── Anthropic client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── In-memory meal log (per-user) ───────────────────────────────────────────
const mealLog = new Map(); // uid → entry[]

function getUserMeals(uid) {
  if (!mealLog.has(uid)) mealLog.set(uid, []);
  return mealLog.get(uid);
}

// ─── Passive label-correction store ──────────────────────────────────────────
// Tracks implicit user corrections: when a user renames a scan-detected item,
// we record original → corrected. Once CORRECTION_THRESHOLD unique users have
// made the same correction, it is applied automatically at inference time.
//
// Structure: normalisedOriginal → Map<normalisedCorrection → count>
const _labelCorrections = new Map();
const CORRECTION_THRESHOLD = 5;

function _normLabel(n) {
  return (n || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function recordLabelCorrection(original, corrected) {
  const orig = _normLabel(original);
  const corr = _normLabel(corrected);
  if (!orig || !corr || orig === corr) return;
  if (!_labelCorrections.has(orig)) _labelCorrections.set(orig, new Map());
  const counts = _labelCorrections.get(orig);
  counts.set(corr, (counts.get(corr) ?? 0) + 1);
  console.log(`[corrections] "${orig}" → "${corr}" (n=${counts.get(corr)})`);
}

// Returns the consensus corrected label if >= CORRECTION_THRESHOLD votes exist,
// or null if no consensus has been reached yet.
function getConsensusLabel(name) {
  const counts = _labelCorrections.get(_normLabel(name));
  if (!counts) return null;
  let best = null, bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) { best = label; bestCount = count; }
  }
  return bestCount >= CORRECTION_THRESHOLD ? best : null;
}

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

// ─── Pexels image helper ──────────────────────────────────────────────────────
// Shared by /chat, /analyze-photo, and /analyze-pantry so every response that
// creates a food item already carries an imageUrl. This keeps the client warm-
// call round-trip to /food-image out of the critical path.
const PEXELS_BASE = 'https://api.pexels.com/v1/search';

async function fetchPexelsImage(foodName) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  if (!key) {
    console.warn('[pexels] PEXELS_API_KEY not set — skipping image fetch');
    return null;
  }
  const query = (foodName || '').trim();
  if (!query) return null;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 4000);
  try {
    const url  = `${PEXELS_BASE}?query=${encodeURIComponent(query + ' food')}&per_page=1`;
    const pRes = await fetch(url, { headers: { Authorization: key }, signal: controller.signal });
    clearTimeout(timer);
    if (!pRes.ok) {
      console.warn(`[pexels] ${pRes.status} for "${query}"`);
      return null;
    }
    const json     = await pRes.json();
    const imageUrl = (json.photos || [])[0]?.src?.medium ?? null;
    console.log(`[pexels] "${query}" → ${imageUrl ?? 'no result'}`);
    return imageUrl;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[pexels] "${query}" ${err.name === 'AbortError' ? 'timeout (4s)' : err.message}`);
    return null;
  }
}

// ─── System prompt builder ────────────────────────────────────────────────────
// Built per-request so it includes the user's current goals, logged totals,
// and their personal food history for personalised suggestions.
function buildSystemPrompt(userProfile, foodPreferences = [], pantryItems = []) {
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

  // Pantry items the user has at home right now
  const pantrySection = pantryItems.length ? `
PANTRY (ingredients the user has at home right now):
${pantryItems.map((i) => `- ${i.name}${i.qty ? ` (${i.qty})` : ''}`).join('\n')}

PANTRY RULE: When the user asks what to eat, what to cook, or for meal ideas, build suggestions from these ingredients first. Only suggest something outside this list if nothing on it fits. Be specific — name the exact ingredients. Example: "You've got chicken breast and brown rice — that covers your protein gap perfectly tonight."
` : '';

  // Valid imageKey values (must be one of these — used to fetch a food photo):
  const imageKeys = 'chicken, turkey, beef, steak, pork, salmon, tuna, shrimp, egg, rice, pasta, bread, oats, oatmeal, potato, sweetpotato, banana, apple, salad, broccoli, spinach, avocado, yogurt, cheese, milk, nuts, almonds, soup, pizza, burger, sandwich, sushi, tacos, coffee, smoothie, protein_shake, default';

  return `You are FoodChat AI, a nutrition coach built into a mobile app. You text like a knowledgeable friend who knows exactly what the user eats, what their goals are, and what they actually need right now. You are direct, warm, slightly playful, and never robotic.

${profileSection}${safetySection}${prefSection}${pantrySection}
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

MEAL LOGGING: You MUST output a <meal_log> block when the user explicitly states they already consumed food or a caloric beverage — past tense or actively in progress.
Caloric beverages (always log): juice, soda, beer, wine, spirits, coffee with milk or sugar, latte, cappuccino, smoothie, protein shake, sports drink, energy drink, milk, oat milk.
Valid trigger phrases (consumption only): "I had", "I ate", "I just ate", "I just had", "I'm eating", "I'm having [right now]", "I drank [caloric drink]", "log this", "add this", "track this", "I finished".

DUAL INTENT — HIGHEST PRIORITY RULE: A single message can report food consumption AND ask a question at the same time. When a message contains a valid consumption trigger phrase ("I ate", "I had", "I just had", "I'm eating", etc.) AND also contains a question or advice request, you MUST do both: (1) output the <meal_log> block for the consumed food, AND (2) answer the question in your text response. The presence of a question, question mark, or advisory phrase ("what should I eat for the rest of the day", "what else should I have") does NOT cancel or override a clear consumption statement in the same message. Log first, then answer the question.
Example: "I ate a burger for lunch, what should I eat for dinner?" — log the burger AND suggest dinner.
Example: "I just had oatmeal, am I on track?" — log the oatmeal AND answer how they're doing.
Example: "I had a protein shake, what should I eat next?" — log the shake AND give a recommendation.
Dual-intent response format (3 sentences max): Sentence 1 confirms the log ("[Food] logged ✅ ..."). Sentences 2-3 answer the question directly. Do not drop the question answer to stay under the normal 2-sentence meal-log limit.

NEVER output a <meal_log> block when the message contains NO consumption statement at all — i.e., the entire message is ONLY a question, plan, or hypothetical with no report of food already eaten:
- Pure questions with no consumption: "what should I eat", "what can I have for dinner", "what's a good breakfast", "meal ideas", "meal plan", "what to eat"
- Pure future intentions (no past consumption): "I'm going to have", "I plan to eat", "I'll probably eat", "maybe I'll have", "thinking about eating"
- Pure hypotheticals: "what if I ate", "if I had", "is X good for me", "how many calories in X"
- Pure analysis with no consumption: "how am I doing", "what are my macros", "am I on track"
- Plain water

DEFAULT TO NOT LOGGING: Only skip logging when there is NO consumption statement anywhere in the message. If the message contains a clear consumption trigger phrase ("I ate", "I had", "I just had", etc.), ALWAYS output the <meal_log> block — even if the same message also contains a question, a "?" or advice-seeking language.

When logging: output the <meal_log> block first, then confirm in 1-2 sentences max.
Meal confirmation format (strict): Start with the exact food name + "logged ✅". Example: "Chicken salad logged ✅ You're sitting at 38g protein so far today." NEVER say "Your meal has been logged" or any generic phrasing. Always lead with the food name.

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
app.post('/chat', limiter.chat, requireAuth, async (req, res) => {
  const { message, history = [], userProfile, foodPreferences = [], pantryItems = [], pushToken, jobId } = req.body;

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
      system:     buildSystemPrompt(userProfile, foodPreferences, pantryItems),
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

    let mealImageUrl = null;
    if (shouldLog) {
      // Fetch image while we still have a warm connection — avoids a cold-start
      // round-trip from the client to /food-image after receiving this response.
      mealImageUrl = await fetchPexelsImage(meal.name);
      const entry = {
        id:        Date.now(),
        time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name:      meal.name     ?? 'Unknown meal',
        calories:  meal.calories ?? 0,
        protein:   meal.protein  ?? 0,
        carbs:     meal.carbs    ?? 0,
        fat:       meal.fat      ?? 0,
        imageKey:  meal.imageKey ?? 'default',
        imageUrl:  mealImageUrl,
      };
      getUserMeals(req.uid).push(entry);
      console.log('[chat] meal logged:', entry.name, entry.calories, 'kcal | imageUrl:', mealImageUrl ?? 'none');
      // Fire-and-forget — don't block the HTTP response waiting for Expo
      sendMealPushNotification(pushToken, meal.name, jobId).catch(() => {});
    } else if (meal) {
      console.log('[chat] <meal_log> block found but shouldLog=false (logged:', meal.logged, 'name:', meal.name, 'cal:', meal.calories, ')');
    }

    res.json({
      reply:      displayText,
      mealLogged: shouldLog,
      meal:       shouldLog ? { ...meal, imageUrl: mealImageUrl } : null,
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
app.post('/analyze-photo', limiter.vision, requireAuth, async (req, res) => {
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

    let mealImageUrl = null;
    if (shouldLog) {
      mealImageUrl = await fetchPexelsImage(meal.name);
      const entry = {
        id:       Date.now(),
        time:     new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name:     meal.name     ?? 'Photo meal',
        calories: meal.calories ?? 0,
        protein:  meal.protein  ?? 0,
        carbs:    meal.carbs    ?? 0,
        fat:      meal.fat      ?? 0,
        imageKey: meal.imageKey ?? 'default',
        imageUrl: mealImageUrl,
      };
      getUserMeals(req.uid).push(entry);
      console.log('[photo] meal logged:', entry.name, entry.calories, 'kcal | imageUrl:', mealImageUrl ?? 'none');
      sendMealPushNotification(pushToken, meal.name, null).catch(() => {});
    }

    res.json({ reply: displayText, mealLogged: shouldLog, meal: shouldLog ? { ...meal, imageUrl: mealImageUrl } : null });

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

// ─── POST /analyze-pantry ────────────────────────────────────────────────────
// Accepts a base64 pantry/grocery photo and returns structured detected items.
// Each item: { name, quantity, category, confidence }.
app.post('/analyze-pantry', limiter.vision, requireAuth, async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg' } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required', items: [] });
  }

  console.log('[analyze-pantry] image received, sending to Claude vision...');

  try {
    const response = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `Analyze this image and identify every food or grocery item visible. Include ALL items — even if you are not very sure, include them with a lower confidence score. Do NOT skip items just because you are uncertain.

Return ONLY valid JSON in this exact format — no explanations, no markdown, no extra text:

{
  "items": [
    {
      "name": "Clean common name, no brand (e.g. Chicken Breast, Whole Milk, Baby Spinach)",
      "quantity": "Estimated quantity as a string, or null if unclear",
      "category": "protein | carbs | fat | dairy | produce | snack | other",
      "confidence": 0.0
    }
  ]
}

Rules:
- confidence is a float from 0.0 to 1.0 — use 0.3–0.5 for uncertain items, NOT 0.0 or omit them
- ALWAYS include items you can partially see or guess — never omit due to uncertainty
- Return up to 20 items
- Only return { "items": [] } if the image contains absolutely no food whatsoever
- Output ONLY the JSON object above, nothing else`,
          },
        ],
      }],
    });

    const raw = response.content[0]?.text ?? '';
    console.log('[analyze-pantry] raw response:', raw);

    let allItems = [];

    // Attempt 1: extract outermost JSON object
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.items)) {
          allItems = parsed.items;
        }
      }
    } catch (_) {}

    // Attempt 2: extract JSON array directly (in case model omitted the wrapper)
    if (!allItems.length) {
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) allItems = parsed;
        }
      } catch (_) {}
    }

    // Attempt 3: salvage individual item objects from a truncated/partial response
    if (!allItems.length) {
      const objectMatches = raw.match(/\{[^{}]*"name"\s*:\s*"[^"]+?"[^{}]*\}/g) || [];
      for (const chunk of objectMatches) {
        try {
          const obj = JSON.parse(chunk);
          if (typeof obj.name === 'string') allItems.push(obj);
        } catch (_) {}
      }
      if (allItems.length) {
        console.log(`[analyze-pantry] salvaged ${allItems.length} items from partial JSON`);
      }
    }

    if (!allItems.length) {
      console.warn('[analyze-pantry] could not parse any items from response');
    }

    // Accept all items with a valid name — no confidence floor.
    // Apply consensus label corrections where they exist.
    const items = allItems
      .filter((i) => i && typeof i.name === 'string' && i.name.trim())
      .map((i) => {
        const raw       = i.name.trim();
        const consensus = getConsensusLabel(raw);
        if (consensus) console.log(`[analyze-pantry] consensus override: "${raw}" → "${consensus}"`);
        return {
          name:       consensus ?? raw,
          quantity:   typeof i.quantity === 'string' && i.quantity.trim() ? i.quantity.trim() : null,
          category:   typeof i.category === 'string' ? i.category.toLowerCase().trim() : 'other',
          confidence: typeof i.confidence === 'number' ? i.confidence : 0.5,
        };
      });

    console.log(
      `[analyze-pantry] detected ${items.length} items:`,
      items.map((i) => `${i.name} (${(i.confidence * 100).toFixed(0)}%)`).join(', ') || '(none)',
    );

    // Fetch Pexels images for all items in parallel (4 s cap each).
    // Promise.allSettled — one failure never blocks the others.
    const imageResults = await Promise.allSettled(items.map((i) => fetchPexelsImage(i.name)));
    const itemsWithImages = items.map((item, idx) => ({
      ...item,
      imageUrl: imageResults[idx].status === 'fulfilled' ? (imageResults[idx].value ?? null) : null,
    }));

    const imgSummary = itemsWithImages.map((i) => `${i.name}:${i.imageUrl ? 'ok' : 'none'}`).join(', ');
    console.log(`[analyze-pantry] images fetched — ${imgSummary}`);
    console.log(`[analyze-pantry] returning ${itemsWithImages.length} items with imageUrl`);

    res.json({ items: itemsWithImages });
  } catch (err) {
    console.error('[/analyze-pantry error]', err.message);
    res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── POST /corrections/label ─────────────────────────────────────────────────
// Records an implicit label correction from a user action (rename in scan
// confirm modal, or manual item edit). Fire-and-forget from the client.
app.post('/corrections/label', requireAuth, (req, res) => {
  const { original, corrected } = req.body;
  if (typeof original !== 'string' || typeof corrected !== 'string') {
    return res.status(400).json({ ok: false });
  }
  recordLabelCorrection(original, corrected);
  res.json({ ok: true });
});

// ─── GET /food-image ─────────────────────────────────────────────────────────
// Pexels proxy — keeps the API key server-side.
// Query params: q (search string), count (default 8, max 20)
// Used by imageService.js for the corrections/browse/candidate flows.
app.get('/food-image', async (req, res) => {
  const q     = (req.query.q || '').trim();
  const count = Math.min(parseInt(req.query.count, 10) || 8, 20);

  if (!q) return res.status(400).json({ error: 'q is required', photos: [] });

  const key = (process.env.PEXELS_API_KEY || '').trim();
  if (!key) {
    console.error('[food-image] PEXELS_API_KEY is not set — add it in the Render dashboard under Environment');
    return res.status(503).json({ error: 'Image service not configured', photos: [] });
  }

  console.log(`[food-image] query="${q}" count=${count}`);

  const controller    = new AbortController();
  const pexelsTimeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url  = `${PEXELS_BASE}?query=${encodeURIComponent(q)}&per_page=${count}`;
    const pRes = await fetch(url, { headers: { Authorization: key }, signal: controller.signal });
    clearTimeout(pexelsTimeout);

    if (!pRes.ok) {
      const body = await pRes.text().catch(() => '');
      console.error(`[food-image] Pexels ${pRes.status} for "${q}":`, body.slice(0, 200));
      return res.status(502).json({ error: `Pexels ${pRes.status}`, photos: [] });
    }

    const json = await pRes.json();
    const raw  = json.photos || [];

    const photos = raw
      .filter((p) => p?.src?.medium)
      .map((p) => ({
        id:    String(p.id),
        uri:   p.src.medium,
        uriHd: p.src.large || p.src.medium,
        alt:   p.alt || q,
      }));

    console.log(`[food-image] ${photos.length}/${raw.length} photos for "${q}" | first: ${photos[0]?.uri ?? 'none'}`);
    res.json({ photos });
  } catch (err) {
    clearTimeout(pexelsTimeout);
    const isTimeout = err.name === 'AbortError';
    console.error('[food-image]', isTimeout ? 'timeout (6s) for' : 'error for', `"${q}":`, isTimeout ? '' : err.message);
    res.status(isTimeout ? 504 : 500).json({ error: isTimeout ? 'Upstream timeout' : err.message, photos: [] });
  }
});

// ─── GET /meals ───────────────────────────────────────────────────────────────
app.get('/meals', requireAuth, (req, res) => res.json({ meals: getUserMeals(req.uid) }));

// ─── DELETE /meals ────────────────────────────────────────────────────────────
app.delete('/meals', requireAuth, (req, res) => { mealLog.set(req.uid, []); res.json({ ok: true }); });

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

app.post('/tts', limiter.tts, requireAuth, async (req, res) => {
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
// Promo code redemption is disabled for App Store compliance.
// Premium access is exclusively granted through Apple In-App Purchase.
app.post('/promo/redeem', requireAuth, (_req, res) => {
  res.json({ valid: false, error: 'Promo codes are not currently available.' });
});

// ─── GET / ────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'FoodChat AI backend running' }));

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  const anthropicOk   = !!process.env.ANTHROPIC_API_KEY;
  const elevenLabsOk  = !!process.env.ELEVENLABS_API_KEY;
  const pexelsOk      = !!process.env.PEXELS_API_KEY;
  console.log(`\nFoodChat AI backend running on http://localhost:${port}`);
  console.log(`  ANTHROPIC_API_KEY:   ${anthropicOk  ? 'loaded ✓' : 'MISSING ✗ — check backend/.env'}`);
  console.log(`  ELEVENLABS_API_KEY:  ${elevenLabsOk ? 'loaded ✓' : 'MISSING ✗ — TTS will fail'}`);
  console.log(`  PEXELS_API_KEY:      ${pexelsOk     ? 'loaded ✓' : 'MISSING ✗ — food images will not load'}`);
  console.log(`  ElevenLabs voice:    ${ELEVENLABS_VOICE_ID}`);
  console.log('  POST /tts     — ElevenLabs text-to-speech');
  console.log('  POST /chat    — AI assistant');
  console.log('  GET  /health  — health check\n');
});
