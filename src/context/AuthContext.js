import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { TEST_MODE, TEST_EMAIL, TEST_PASSWORD } from '../config/testMode';
import { deleteAccountFully, deleteTestAccount, reauthenticateWithPassword } from '../utils/deleteAccount';

const TEST_USER = { uid: 'test-user-001', email: TEST_EMAIL, displayName: 'Test User', isTestAccount: true };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // true until Firebase resolves persisted session

  useEffect(() => {
    // onAuthStateChanged fires immediately with the cached user (or null)
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe; // cleanup listener on unmount
  }, []);

  const signIn = (email, password) => {
    if (TEST_MODE && email === TEST_EMAIL && password === TEST_PASSWORD) {
      setUser(TEST_USER);
      return Promise.resolve({ user: TEST_USER });
    }
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signUp  = (email, password) => createUserWithEmailAndPassword(auth, email, password);

  const signOut = () => {
    if (user?.isTestAccount) { setUser(null); return Promise.resolve(); }
    return firebaseSignOut(auth);
  };

  /**
   * Permanently delete the current user's account and all associated data.
   *
   * May throw { code: 'auth/requires-recent-login' } — caller must prompt for
   * the user's password, call reauthenticate(password), then retry deleteAccount.
   */
  const deleteAccount = async () => {
    if (!user) throw new Error('No user is signed in.');
    if (user.isTestAccount) {
      // Test accounts have no Firebase Auth record — just wipe local state.
      await deleteTestAccount(user.uid);
      setUser(null);
      return;
    }
    // deleteAccountFully deletes Firestore data, Auth record, and AsyncStorage.
    // On success, Firebase fires onAuthStateChanged(null) which sets user → null
    // automatically, triggering AppContext to reset all in-memory state.
    await deleteAccountFully(user.uid);
  };

  const reauthenticate = (password) => reauthenticateWithPassword(password);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, deleteAccount, reauthenticate }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
