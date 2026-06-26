import { useEffect } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { messaging } from '../firebase'
import { supabase } from '../supabase'

const VAPID_KEY = 'BJXclBksXWIr3BWqEE5RlTcVhn-ROmKFynWIG6ZuKsYVMsjdc2Lb4HxTKwYWkuUnKn4SOwy3z1wKoWnUQYvahnc'

export function useFCM(isAdmin) {
  useEffect(() => {
    if (!isAdmin) return

    async function registerToken() {
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          console.log('알림 권한 거부됨')
          return
        }

        // Service Worker가 이미 등록되어 있으면 재사용, 없으면 새로 등록
        let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
        if (!registration) {
          registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
          await navigator.serviceWorker.ready
        }

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        })

        if (token) {
          console.log('FCM 토큰 발급 성공:', token.slice(0, 20) + '...')
          const { error } = await supabase.from('fcm_tokens').upsert(
            { token, role: 'admin', last_seen: new Date().toISOString() },
            { onConflict: 'token' }
          )
          if (error) console.error('토큰 저장 실패:', error)
          else console.log('FCM 토큰 저장 완료!')
        }
      } catch (err) {
        console.error('FCM 토큰 등록 실패:', err)
      }
    }

    registerToken()

    const unsubscribe = onMessage(messaging, payload => {
      const { title, body } = payload.notification || {}
  // Service Worker를 통해 알림 표시 (포그라운드에서도 동작)
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title || '시약관리 알림', {
        body: body || '',
        icon: '/favicon.ico',
      })
    })
  } else if (Notification.permission === 'granted') {
    new Notification(title || '시약관리 알림', {
      body: body || '',
      icon: '/favicon.ico',
    })
  }
})

    return () => unsubscribe()
  }, [isAdmin])
}
