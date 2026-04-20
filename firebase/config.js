import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD-LkNHmv1C0XGqNJLP4c4UfRH715DWuN8",
  authDomain: "fit-ai-20c40.firebaseapp.com",
  projectId: "fit-ai-20c40",
  storageBucket: "fit-ai-20c40.firebasestorage.app",
  messagingSenderId: "730011577882",
  appId: "1:730011577882:web:cbd4bc3a862f1cc5bcaba3"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };