import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

// ─── AsyncStorage keys ────────────────────────────────────────────────────────
// Add any new keys here if they are ever introduced.
const GLOBAL_ASYNC_KEYS = [
  '@fitchat_jobs_v1',       // background job queue
  '@fitchat_push_token_v1', // Expo push token
  'mealPlannerState_v1',    // legacy pre-auth key — must be cleared so a new
                            // same-email account does not inherit old data
];
const userStorageKey  = (uid) => `mealPlannerState_v1_${uid}`;
const pantryStorageKey = (uid) => `pantryItems_v1_${uid}`;

// ─── Firestore subcollections ─────────────────────────────────────────────────
// 'meals' is the only confirmed write path (MealContext → users/{uid}/meals/{id}).
// The others are defensive — delete them if they ever get populated.
const USER_SUBCOLLECTIONS = ['meals', 'logs', 'chat', 'dailyLogs'];

// Timeout applied to each individual Firestore operation.
// getDocs has no built-in timeout; without this a single blocked read hangs
// the entire deletion and the spinner runs forever.
const OP_TIMEOUT_MS = 6_000;

// Resolve (never reject) after ms — used with Promise.race to cap any op.
const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Re-authentication ─────────────────────────────────────────────────────────
export async function reauthenticateWithPassword(password) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('No authenticated user found.');
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function deleteSubcollection(userRef, name, uid) {
  let snap;
  try {
    // Race the read against a timeout — if Firestore is unreachable the promise
    // never settles without this cap.
    snap = await Promise.race([getDocs(collection(userRef, name)), timeout(OP_TIMEOUT_MS)]);
  } catch (e) {
    console.warn(`[deleteAccount] Firestore read users/${uid}/${name} failed:`, e.message);
    return 0;
  }

  // timeout() resolved first — snap is undefined
  if (!snap) {
    console.warn(`[deleteAccount] Firestore read users/${uid}/${name} timed out — skipping`);
    return 0;
  }

  if (snap.empty) {
    console.log(`[deleteAccount] Firestore users/${uid}/${name}: 0 docs`);
    return 0;
  }

  // Batch-delete in chunks of 500 (Firestore limit)
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db);
    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
    try {
      await Promise.race([batch.commit(), timeout(OP_TIMEOUT_MS)]);
    } catch (e) {
      console.warn(`[deleteAccount] Firestore batch delete users/${uid}/${name} failed:`, e.message);
    }
  }

  console.log(`[deleteAccount] Firestore users/${uid}/${name}: deleted ${docs.length} doc(s)`);
  return docs.length;
}

async function deleteFirestoreData(uid) {
  console.log('[deleteAccount] Firestore cleanup — uid:', uid);

  const userRef = doc(db, 'users', uid);
  let totalDocs = 0;

  for (const name of USER_SUBCOLLECTIONS) {
    totalDocs += await deleteSubcollection(userRef, name, uid);
  }

  // Delete the root user document.
  // deleteDoc is a no-op if the document doesn't exist, so this is always safe.
  try {
    await Promise.race([deleteDoc(userRef), timeout(OP_TIMEOUT_MS)]);
    console.log(`[deleteAccount] Firestore users/${uid}: root document deleted`);
  } catch (e) {
    console.warn(`[deleteAccount] Firestore users/${uid}: root document delete failed:`, e.message);
  }

  console.log(`[deleteAccount] Firestore cleanup complete — ${totalDocs} subcollection doc(s) deleted`);
}

// ─── AsyncStorage ─────────────────────────────────────────────────────────────

async function clearLocalStorage(uid) {
  const keys = [userStorageKey(uid), pantryStorageKey(uid), ...GLOBAL_ASYNC_KEYS];
  try {
    await AsyncStorage.multiRemove(keys);
    console.log('[deleteAccount] AsyncStorage cleared:', keys.join(', '));
  } catch (e) {
    // Non-fatal — the auth record is already gone, which is what Apple requires.
    console.warn('[deleteAccount] AsyncStorage clear failed:', e.message);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Permanently delete a user account and all associated data.
 *
 * Order matters:
 *   1. Firestore data   — while auth is still valid
 *   2. Firebase Auth    — fires onAuthStateChanged(null), which triggers
 *                         AppContext → RESET_ONBOARDING and MealContext → RESET_DAY
 *                         so all in-memory state is wiped automatically
 *   3. AsyncStorage     — after auth deletion so the user can retry step 2
 *                         without having lost local state on a first failure
 *
 * A new account created afterwards (even with the same email) receives a brand-
 * new uid, so its storage key is empty and isOnboarded starts as false.
 */
export async function deleteAccountFully(uid) {
  const user = auth.currentUser;
  if (!user) throw new Error('No active session. Please sign in and try again.');

  console.log('[deleteAccount] ── Starting full account deletion ──');
  console.log('[deleteAccount] uid:', uid, '| email:', user.email);

  // 1. Firestore
  await deleteFirestoreData(uid);

  // 2. Firebase Auth (critical — may throw auth/requires-recent-login)
  await deleteUser(user);
  console.log('[deleteAccount] Firebase Auth record deleted');

  // 3. AsyncStorage
  await clearLocalStorage(uid);

  console.log('[deleteAccount] ── Account fully deleted ──');
}

/**
 * Wipe local data for a test/mock account (no real Firebase Auth record).
 */
export async function deleteTestAccount(uid) {
  await clearLocalStorage(uid);
  console.log('[deleteAccount] Test account local data cleared — uid:', uid);
}
