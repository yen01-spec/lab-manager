import { useEffect } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { messaging } from '../firebase'
import { supabase } from '../supabase'

const VAPID_KEY = 'BJXclBksXWIr3BWqEE5RlTcVhn-ROmKFynWIG6ZuKsYVMsjdc2Lb4HxTKwYWkuUnKn4SOwy3z1wKoWnUQYvahnc'

export function useFCM(isAdmin) {
  useEffect(() => {
    if (!isAdmin) return  // 관리자만 알림 등록

    async function registerToken() {
      try {
        // 알림 권한 요청
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          console.log('알림 권한 거부됨')
          return
        }

        // Service Worker 등록
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')

        // FCM 토큰 발급
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })

        if (token) {
          // Supabase에 토큰 저장 (중복이면 last_seen만 업데이트)
          await supabase.from('fcm_tokens').upsert(
            { token, role: 'admin', last_seen: new Date().toISOString() },
            { onConflict: 'token' }
          )
        }
      } catch (err) {
        console.error('FCM 토큰 등록 실패:', err)
      }
    }

    registerToken()

    // 포그라운드 메시지 수신 (앱 켜져있을 때)
    const unsubscribe = onMessage(messaging, payload => {
      const { title, body } = payload.notification || {}
      // 브라우저 알림 직접 표시
      if (Notification.permission === 'granted') {
        new Notification(title || '시약관리 알림', {
          body: body || '',
          icon: '/favicon.ico',
        })
      }
    })

    return () => unsubscribe()
  }, [isAdmin])
}
