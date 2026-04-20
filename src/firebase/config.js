import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Firebase project config ──────────────────────────────────────────────────
// Get these values from:
//   Firebase Console → Project Settings → Your apps → SDK setup and configuration
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyD-LkNHmv1C0XGqNJLP4c4UfRH715DWuN8',
  authDomain:        'fit-ai-20c40.firebaseapp.com',
  projectId:         'fit-ai-20c40',
  storageBucket:     'fit-ai-20c40.firebasestorage.app',
  messagingSenderId: '730011577882',
  appId:             '1:730011577882:web:cbd4bc3a862f1cc5bcaba3',
};

const app = initializeApp(firebaseConfig);

// On web: use browser localStorage (built-in to Firebase web SDK)
// On native: use AsyncStorage so auth persists across app restarts
export const auth = initializeAuth(app, {
  persistence: Platform.OS === 'web'
    ? browserLocalPersistence
    : getReactNativePersistence(AsyncStorage),
});

// Firestore — used for meal storage / deletion
export const db = getFirestore(app);
