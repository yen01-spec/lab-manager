import { initializeApp } from 'firebase/app'
import { getMessaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyChnR0Y3JJS5xAbyr9LQJQwoC2PIJOEbHs",
  authDomain: "lab-manager-alarm.firebaseapp.com",
  projectId: "lab-manager-alarm",
  storageBucket: "lab-manager-alarm.firebasestorage.app",
  messagingSenderId: "702210218847",
  appId: "1:702210218847:web:0e05249d3781405d61b4ea"
}

const app = initializeApp(firebaseConfig)
export const messaging = getMessaging(app)
