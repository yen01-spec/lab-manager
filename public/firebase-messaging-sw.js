importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyChnR0Y3JJS5xAbyr9LQJQwoC2PIJOEbHs",
  authDomain: "lab-manager-alarm.firebaseapp.com",
  projectId: "lab-manager-alarm",
  storageBucket: "lab-manager-alarm.firebasestorage.app",
  messagingSenderId: "702210218847",
  appId: "1:702210218847:web:0e05249d3781405d61b4ea"
})

const messaging = firebase.messaging()

// 백그라운드 메시지 수신 (브라우저 꺼져있을 때)
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || payload.data?.title || '시약관리 알림'
  const body = payload.notification?.body || payload.data?.body || ''

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
  })
})
