// src/cmd/ig.ts
import { exec } from 'child_process'
import axios from 'axios'
import { WASocket, proto } from '@whiskeysockets/baileys'
import { join } from 'path'
import { homedir } from 'os'

type SendMessageFunction = (chatId: string, text: string) => Promise<void>

const cache = new Map<string, number>()
const rateLimiter = new Map<string, number[]>()
const RATE_LIMIT = 5
const WINDOW_SIZE = 60000

const HOME_DIR = homedir()
const YT_DLP_PATH = join(HOME_DIR, '.local', 'bin', 'yt-dlp')
const GALLERY_DL_PATH = join(HOME_DIR, '.local', 'bin', 'gallery-dl')

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const requests = rateLimiter.get(userId) || []
  const validRequests = requests.filter(time => now - time < WINDOW_SIZE)

  if (validRequests.length >= RATE_LIMIT) return false

  validRequests.push(now)
  rateLimiter.set(userId, validRequests)
  return true
}

function isInstagramUrl(url: string): boolean {
  const patterns = [
    /https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/,
    /https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/
  ]
  return patterns.some(pattern => pattern.test(url))
}

async function downloadWithYtDlp(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    console.log('🔧 YT-DLP buscando melhor qualidade para:', url)
    
    const command = `"${YT_DLP_PATH}" --get-url -f "best[ext=mp4]/best" --no-check-certificates "${url}"`
    
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.log('❌ YT-DLP falhou:', error.message)
        resolve(null)
        return
      }
      
      const urls = stdout.trim().split('\n').filter(line => line.startsWith('http'))
      
      if (urls.length > 0) {
        console.log('✅ YT-DLP encontrou URL de melhor qualidade')
        resolve(urls[0])
      } else {
        console.log('❌ YT-DLP não encontrou URLs')
        resolve(null)
      }
    })
  })
}

async function downloadWithGalleryDl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    console.log('🔧 Gallery-DL buscando mídia para:', url)
    
    const command = `"${GALLERY_DL_PATH}" -g --no-check-certificates "${url}"`
    
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.log('❌ Gallery-DL falhou:', error.message)
        resolve(null)
        return
      }
      
      const urls = stdout.trim().split('\n').filter(line => line.startsWith('http'))
      
      if (urls.length > 0) {
        console.log('✅ Gallery-DL encontrou URL')
        resolve(urls[0])
      } else {
        console.log('❌ Gallery-DL não encontrou URLs')
        resolve(null)
      }
    })
  })
}

async function downloadMedia(url: string): Promise<Buffer | null> {
  try {
    console.log('📥 Iniciando download de:', url.substring(0, 100) + '...')
    
    const response = await Promise.race([
      axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 50 * 1024 * 1024,
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
    
    if (size > 50 * 1024 * 1024) {
      console.log('❌ Arquivo muito grande')
      return null
    }
    
    return Buffer.from(response.data)
  } catch (error) {
    console.log('❌ Falha no download:', error instanceof Error ? error.message : 'Timeout')
    return null
  }
}

export async function handleInstagramCommand(
  client: WASocket,
  message: proto.IWebMessageInfo,
  sendMessage: SendMessageFunction
): Promise<void> {
  console.log('🚀 Processando comando Instagram')
  
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
    await sendMessage(chatId, '📝 *Uso:* /ig <link_do_instagram>\n\n💡 *Exemplo:* /ig https://instagram.com/reel/ABC123/')
    return
  }
  
  const url = args[0].trim()
  console.log('🔍 Processando URL:', url.substring(0, 50) + '...')
  
  if (!isInstagramUrl(url)) {
    await sendMessage(chatId, '❌ *Link inválido!* Por favor, envie um link válido do Instagram.')
    return
  }
  
  if (!checkRateLimit(userId)) {
    await sendMessage(chatId, '⏱️ *Muitas tentativas!* Aguarde 1 minuto.')
    return
  }

  const cacheKey = `${userId}_${url}`
  if (cache.has(cacheKey)) {
    console.log('⚠️ Request duplicada ignorada')
    return
  }
  cache.set(cacheKey, Date.now())
  
  try {
    const processingMsg = await client.sendMessage(chatId, { 
      text: '🔄 *Processando link do Instagram...*' 
    })
    
    let mediaUrl: string | null = null
    
    mediaUrl = await downloadWithYtDlp(url)
    
    if (!mediaUrl) {
      mediaUrl = await downloadWithGalleryDl(url)
    }
    
    if (!mediaUrl) {
      await client.sendMessage(chatId, { 
        text: '❌ *Ferramentas de download não configuradas*\n\n📋 Instale yt-dlp ou gallery-dl para usar este recurso.' 
      })
      return
    }
    
    console.log('📥 Iniciando download da mídia...')
    
    let mediaBuffer: Buffer | null = null
    let retries = 2
    
    for (let attempt = 1; attempt <= retries && !mediaBuffer; attempt++) {
      if (attempt > 1) {
        console.log(`🔄 Tentativa ${attempt}/${retries}`)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      mediaBuffer = await downloadMedia(mediaUrl)
    }
    
    if (!mediaBuffer) {
      await client.sendMessage(chatId, { 
        text: '❌ *Falha no download da mídia*\n💡 Tente novamente em alguns minutos' 
      })
      return
    }
    
    try {
      const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video')
      const caption = `📥 *Download concluído!*`
      
      if (isVideo) {
        await client.sendMessage(chatId, {
          video: mediaBuffer,
          caption: caption
        })
      } else {
        await client.sendMessage(chatId, {
          image: mediaBuffer,
          caption: caption
        })
      }
      
      console.log('✅ Mídia enviada com sucesso')
      
    } catch (sendError) {
      console.log('❌ Erro ao enviar mídia:', sendError)
      await client.sendMessage(chatId, { 
        text: '❌ *Erro ao enviar mídia*\n💡 O arquivo pode estar corrompido ou muito grande' 
      })
    }
    
  } catch (error) {
    console.log('❌ Erro geral:', error)
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