import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = '@fitchat_push_token_v1';

// Request push notification permission and obtain an Expo push token.
// Safe to call multiple times — resolves immediately if already granted.
// Returns the token string, or null if unavailable (simulator, denied, etc.)
export async function registerForPushNotifications() {
  if (Platform.OS === 'web') return null;

  // getPermissionsAsync is idempotent; requestPermissionsAsync prompts only once
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') {
    console.log('[push] permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    // Dedicated channel for meal-log push notifications (higher priority than reminders)
    await Notifications.setNotificationChannelAsync('meal-logs', {
      name:       'Meal Logs',
      importance: Notifications.AndroidImportance.HIGH,
      sound:      'default',
    });
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: '5a39c4ba-1a64-4932-911f-bbf5709e5010',
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    console.log('[push] registered:', token.slice(0, 36) + '...');
    return token;
  } catch (e) {
    // Throws on physical simulators or when the projectId is mismatched.
    console.warn('[push] token registration failed:', e.message);
    return null;
  }
}

export async function getStoredPushToken() {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
