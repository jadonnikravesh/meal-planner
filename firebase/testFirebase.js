import { auth } from "./config.js";
import { createUserWithEmailAndPassword } from "firebase/auth";

const testSignup = async () => {
  try {
    const user = await createUserWithEmailAndPassword(
      auth,
      "test@test.com",
      "password123"
    );
    console.log("User created:", user.user.email);
  } catch (error) {
    console.error("Error:", error.message);
  }
};

testSignup();