// Edge-safe: uses globalThis.crypto.subtle (Web Crypto API) — no Buffer, no jose
const COOKIE_NAME = 'rgb_session'
const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' }

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET env var is not set')
  return secret
}

async function getKey(): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    ALGORITHM,
    false,
    ['sign', 'verify']
  )
}

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let str = ''
  for (const byte of bytes) str += String.fromCharCode(byte)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
  const bin = atob(padded)
  const buf = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return buf
}

export async function signSession(payload: Record<string, unknown>): Promise<string> {
  const enc = new TextEncoder()
  const data = btoa(JSON.stringify(payload))
  const key = await getKey()
  const sig = await globalThis.crypto.subtle.sign(ALGORITHM, key, enc.encode(data))
  return `${data}.${base64urlEncode(sig)}`
}

export async function verifySession(token: string): Promise<Record<string, unknown> | null> {
  try {
    const [data, sigB64] = token.split('.')
    if (!data || !sigB64) return null
    const enc = new TextEncoder()
    const key = await getKey()
    const sig = base64urlDecode(sigB64)
    const valid = await globalThis.crypto.subtle.verify(ALGORITHM, key, sig, enc.encode(data))
    if (!valid) return null
    return JSON.parse(atob(data))
  } catch {
    return null
  }
}

export { COOKIE_NAME }
