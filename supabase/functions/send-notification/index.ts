import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Google OAuth2 액세스 토큰 발급 (서비스 계정 → JWT → 토큰)
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  // JWT 헤더
  const header = { alg: 'RS256', typ: 'JWT' }
  const encode = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const signingInput = `${encode(header)}.${encode(payload)}`

  // RSA 서명
  const keyData = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`

  // 액세스 토큰 발급
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { title, body, role = 'admin' } = await req.json()

    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title과 body가 필요합니다' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Supabase에서 토큰 목록 가져오기
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEYS') ?? ''

const supabase = createClient(supabaseUrl, supabaseKey)

const { data: tokens, error } = await supabase
  .from('fcm_tokens')
  .select('token')
  .eq('role', role)

if (error) {
  return new Response(JSON.stringify({ error: '토큰 조회 실패', detail: String(error) }), {
    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

if (!tokens?.length) {
  return new Response(JSON.stringify({ error: '등록된 토큰 없음' }), {
    status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

    // Firebase 서비스 계정으로 액세스 토큰 발급
    const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID')!
    const accessToken = await getAccessToken(serviceAccount)

    // 각 토큰에 알림 발송
    const results = await Promise.allSettled(
      tokens.map(({ token }) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              data: { title, body },
            }
          })
        })
      )
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length

    return new Response(JSON.stringify({ success: true, sent: succeeded, total: tokens.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
