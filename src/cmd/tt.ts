// src/cmd/tt.ts
import axios from 'axios'
import { WASocket, proto } from '@whiskeysockets/baileys'

type SendMessageFunction = (chatId: string, text: string) => Promise<void>

const cache = new Map<string, number>()
const rateLimiter = new Map<string, number[]>()
const RATE_LIMIT = 5
const WINDOW_SIZE = 60000

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const requests = rateLimiter.get(userId) || []
  const validRequests = requests.filter(time => now - time < WINDOW_SIZE)

  if (validRequests.length >= RATE_LIMIT) return false

  validRequests.push(now)
  rateLimiter.set(userId, validRequests)
  return true
}

function isTikTokUrl(url: string): boolean {
  const patterns = [
    /https?:\/\/(www\.|vt\.|vm\.)?tiktok\.com\/.+$/,
    /https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
    /https?:\/\/vt\.tiktok\.com\/[\w.-]+/,
    /https?:\/\/vm\.tiktok\.com\/[\w.-]+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

function cleanTikTokUrl(url: string): string | null {
  try {
    if (url.includes('?')) {
      url = url.split('?')[0]
    }
    
    if (url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com')) {
      return url
    }
    
    const parsedUrl = new URL(url)
    return `${parsedUrl.origin}${parsedUrl.pathname}`
  } catch {
    return null
  }
}

interface TikWMResponse {
  code: number
  message?: string
  data: {
    play: string
    title?: string
    author?: {
      nickname?: string
    }
  }
}

interface SnaptikResponse {
  data: {
    url: string
  }
}

interface TikMateResponse {
  success: boolean
  data: {
    no_watermark: string
  }
}

interface SsstikResponse {
  video_url: string
}

interface TikDownResponse {
  videoUrl: string
}

async function tryTikWM(url: string): Promise<string | null> {
  try {
    console.log('[TikTok] Tentando API TikWM...')
    
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15'
    ]
    
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)]
    
    const response = await axios.get<TikWMResponse>('https://tikwm.com/api/', {
      params: { url },
      headers: {
        'User-Agent': randomUserAgent,
        'Accept': 'application/json'
      },
      timeout: 10000
    })
    
    if (!response.data || response.data.code !== 0) {
      throw new Error('Falha na API: ' + (response.data?.message || 'Resposta inválida'))
    }
    
    return response.data.data.play
  } catch (error) {
    console.error('[TikTok] Erro ao usar TikWM:', error instanceof Error ? error.message : error)
    return null
  }
}

async function trySnaptik(url: string): Promise<string | null> {
  try {
    console.log('[TikTok] Tentando API Snaptik...')
    
    const response = await axios.get<SnaptikResponse>('https://api.snaptik.guru/video', {
      params: { url },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      },
      timeout: 8000
    })
    
    if (!response.data?.data?.url) {
      throw new Error('Formato de resposta inválido')
    }
    
    return response.data.data.url
  } catch (error) {
    console.error('[TikTok] Erro ao usar Snaptik:', error instanceof Error ? error.message : error)
    return null
  }
}

async function tryTikMate(url: string): Promise<string | null> {
  try {
    console.log('[TikTok] Tentando API TikMate...')
    
    const response = await axios.get<TikMateResponse>('https://tikmateapp.io/api', {
      params: { url },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      },
      timeout: 8000
    })
    
    if (!response.data?.success || !response.data?.data?.no_watermark) {
      throw new Error('Formato de resposta inválido')
    }
    
    return response.data.data.no_watermark
  } catch (error) {
    console.error('[TikTok] Erro ao usar TikMate:', error instanceof Error ? error.message : error)
    return null
  }
}

async function trySsstik(url: string): Promise<string | null> {
  try {
    console.log('[TikTok] Tentando API SSSTIK...')
    
    const response = await axios.get<SsstikResponse>('https://ssstik.io/api/v1/download', {
      params: { url },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      },
      timeout: 8000
    })
    
    if (!response.data?.video_url) {
      throw new Error('Formato de resposta inválido')
    }
    
    return response.data.video_url
  } catch (error) {
    console.error('[TikTok] Erro ao usar SSSTIK:', error instanceof Error ? error.message : error)
    return null
  }
}

async function tryTikDown(url: string): Promise<string | null> {
  try {
    console.log('[TikTok] Tentando API TikDown...')
    
    const response = await axios.get<TikDownResponse>('https://tikdown.org/api', {
      params: { url },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      },
      timeout: 8000
    })
    
    if (!response.data?.videoUrl) {
      throw new Error('Formato de resposta inválido')
    }
    
    return response.data.videoUrl
  } catch (error) {
    console.error('[TikTok] Erro ao usar TikDown:', error instanceof Error ? error.message : error)
    return null
  }
}

async function downloadMedia(url: string): Promise<Buffer | null> {
  try {
    console.log('📥 Iniciando download de:', url.substring(0, 100) + '...')
    
    const response = await Promise.race([
      axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 100 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'close'
        }
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Download timeout')), 25000)
      )
    ])
    
    const size = response.data.length
    console.log('✅ Download completo, tamanho:', (size / 1024 / 1024).toFixed(2), 'MB')
    
    if (size > 100 * 1024 * 1024) {
      console.log('❌ Arquivo muito grande')
      return null
    }
    
    return Buffer.from(response.data)
  } catch (error) {
    console.log('❌ Falha no download:', error instanceof Error ? error.message : 'Timeout')
    return null
  }
}

export async function handleTikTokCommand(
  client: WASocket,
  message: proto.IWebMessageInfo,
  sendMessage: SendMessageFunction
): Promise<void> {
  console.log('🚀 Processando comando TikTok')
  
  const messageText = message.message?.conversation || 
                      message.message?.extendedTextMessage?.text || ''
  
  const args = messageText.trim().split(' ').slice(1)
  const chatId = message.key.remoteJid
  const userId = message.key.remoteJid
  
  if (!chatId || !userId) {
    console.log('❌ Chat ID ou User ID inválido')
    return
  }
  
  if (!args.length) {
    await sendMessage(chatId, '📝 *Uso:* /tt <link_do_tiktok>\n\n💡 *Exemplo:* /tt https://tiktok.com/@user/video/123')
    return
  }
  
  const url = args[0].trim()
  console.log('🔍 Processando URL:', url.substring(0, 50) + '...')
  
  const cleanedUrl = cleanTikTokUrl(url)
  if (!cleanedUrl || !isTikTokUrl(cleanedUrl)) {
    await sendMessage(chatId, '❌ *Link inválido!* Por favor, envie um link válido do TikTok.')
    return
  }
  
  if (!checkRateLimit(userId)) {
    await sendMessage(chatId, '⏱️ *Muitas tentativas!* Aguarde 1 minuto.')
    return
  }

  const cacheKey = `${userId}_${cleanedUrl}`
  if (cache.has(cacheKey)) {
    console.log('⚠️ Request duplicada ignorada')
    return
  }
  cache.set(cacheKey, Date.now())
  
  try {
    const processingMsg = await client.sendMessage(chatId, { 
      text: '🔄 *Processando link do TikTok...*' 
    })
    
    const methods = [
      tryTikWM,
      trySnaptik,
      tryTikMate,
      trySsstik,
      tryTikDown
    ]
    
    let videoUrl: string | null = null
    
    for (const method of methods) {
      try {
        videoUrl = await method(cleanedUrl)
        if (videoUrl) break
      } catch (error) {
        console.log(`[TikTok] Método falhou: ${error instanceof Error ? error.message : error}`)
      }
    }
    
    if (!videoUrl) {
      await client.sendMessage(chatId, { 
        text: '❌ *Não foi possível baixar o vídeo*\n\n💡 Verifique se:\n• O link é público\n• O vídeo não foi removido\n• A conta não é privada' 
      })
      return
    }
    
    console.log('📥 Iniciando download do vídeo...')
    
    let mediaBuffer: Buffer | null = null
    const retries = 2
    
    for (let attempt = 1; attempt <= retries && !mediaBuffer; attempt++) {
      if (attempt > 1) {
        console.log(`🔄 Tentativa ${attempt}/${retries}`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      mediaBuffer = await downloadMedia(videoUrl)
    }
    
    if (!mediaBuffer) {
      await client.sendMessage(chatId, { 
        text: '❌ *Falha no download do vídeo*\n💡 Tente novamente em alguns minutos' 
      })
      return
    }
    
    try {
      const caption = `📥 *Download concluído!*`
      
      await client.sendMessage(chatId, {
        video: mediaBuffer,
        caption: caption,
        gifPlayback: false
      })
      
    } catch (sendError) {
      console.log('❌ Erro ao enviar vídeo:', sendError instanceof Error ? sendError.message : 'Erro desconhecido')
      await client.sendMessage(chatId, { 
        text: '❌ *Erro ao enviar vídeo*\n💡 O arquivo pode estar corrompido' 
      })
    }
    
  } catch (error) {
    console.log('❌ Erro geral:', error instanceof Error ? error.message : 'Erro desconhecido')
    await client.sendMessage(chatId, { 
      text: '❌ *Erro no processamento*\n💡 Tente novamente mais tarde' 
    })
  } finally {
    setTimeout(() => {
      cache.delete(cacheKey)
      const now = Date.now()
      rateLimiter.forEach((requests, key) => {
        const validRequests = requests.filter(time => now - time < WINDOW_SIZE)
        if (validRequests.length === 0) {
          rateLimiter.delete(key)
        } else {
          rateLimiter.set(key, validRequests)
        }
      })
    }, 300000)
  }
}