// src/cmd/s.ts
import { ExtendedWebMessageInfo } from '../index'
import { WASocket, downloadMediaMessage } from '@whiskeysockets/baileys'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'

ffmpeg.setFfmpegPath(ffmpegStatic as string);

class StickerLogger {
  private static colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
  };

  static success(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${this.colors.green}${this.colors.bright}✨ [${timestamp}] ${message}${this.colors.reset}`);
  }

  static info(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${this.colors.blue}${this.colors.bright}ℹ️ [${timestamp}] ${message}${this.colors.reset}`);
  }

  static warning(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${this.colors.yellow}${this.colors.bright}⚠️ [${timestamp}] ${message}${this.colors.reset}`);
  }

  static error(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${this.colors.red}${this.colors.bright}❌ [${timestamp}] ${message}${this.colors.reset}`);
  }

  static process(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${this.colors.magenta}${this.colors.bright}🔄 [${timestamp}] ${message}${this.colors.reset}`);
  }

  static debug(message: string) {
    // Só para debug
  }
}

const mediaLogger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    level: 'silent' as const,
    child: () => mediaLogger
}

function convertToBuffer(data: any): Buffer {
    if (Buffer.isBuffer(data)) {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data);
    }
    if (Array.isArray(data)) {
        return Buffer.from(data);
    }
    if (typeof data === 'string') {
        return Buffer.from(data, 'base64');
    }
    return Buffer.from(data as any);
}


export async function handleStickerCommand(
    sock: WASocket, 
    msg: ExtendedWebMessageInfo, 
    sendMessage: (chatId: string, text: string) => Promise<void>
): Promise<void> {
    let tempFilePath: string | null = null;
    let tempInputPath: string | null = null;
    let tempImagePath: string | null = null;

    try {
        const chatId = msg.key.remoteJid!;

        const quotedMessage = (msg.message as any)?.extendedTextMessage?.contextInfo?.quotedMessage;

        const viewOnceMessage = quotedMessage?.viewOnceMessage || 
                              quotedMessage?.viewOnceMessageV2 || 
                              quotedMessage?.viewOnceMessageV2Extension;
        
        let actualMedia: any = null;
        let isVideo = false;
        let mediaType: 'image' | 'video' | null = null;

        if (viewOnceMessage) {

            if (viewOnceMessage.message?.videoMessage) {
                actualMedia = viewOnceMessage.message.videoMessage;
                mediaType = 'video';
                isVideo = true;
            } else if (viewOnceMessage.message?.imageMessage) {
                actualMedia = viewOnceMessage.message.imageMessage;
                mediaType = 'image';
                isVideo = false;
            } else {
                actualMedia = (viewOnceMessage as any)?.videoMessage || 
                             (viewOnceMessage as any)?.imageMessage;
                isVideo = !!(viewOnceMessage as any)?.videoMessage;
                mediaType = isVideo ? 'video' : 'image';
            }
        } else {
            if (quotedMessage?.imageMessage) {
                actualMedia = quotedMessage.imageMessage;
                mediaType = 'image';
                isVideo = false;
            } else if (quotedMessage?.videoMessage) {
                actualMedia = quotedMessage.videoMessage;
                mediaType = 'video';
                isVideo = true;
            }
        }

        if (!actualMedia) {
            await sendMessage(chatId, '*[❎]* Responda a uma imagem ou vídeo com /s!');
            return;
        }

        StickerLogger.info(`Processando ${mediaType} ${viewOnceMessage ? 'viewOnce' : 'normal'}`);

        const downloadMsg = {
            key: {
                remoteJid: chatId,
                fromMe: false,
                id: msg.key.id
            },
            message: {
                [isVideo ? 'videoMessage' : 'imageMessage']: actualMedia
            }
        };

        try {
            
            const buffer = await downloadMediaMessage(
                downloadMsg as any,
                'buffer',
                {},
                {
                    logger: mediaLogger,
                    reuploadRequest: sock.updateMediaMessage
                }
            );

            if (!buffer) {
                await sendMessage(chatId, '*[❎]* Falha ao baixar a mídia!');
                return;
            }

            const mediaBuffer = convertToBuffer(buffer);

            if (isVideo) {
                tempInputPath = join(tmpdir(), `input_${Date.now()}.mp4`);
                await writeFile(tempInputPath, mediaBuffer);
                
                tempFilePath = join(tmpdir(), `sticker_${Date.now()}.webp`);
                
                await new Promise((resolve, reject) => {
                    ffmpeg(tempInputPath!)
                        .outputOptions([
                            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                            '-c:v', 'libwebp',
                            '-loop', '0',
                            '-an',
                            '-t', '5',
                            '-q:v', '75',
                            '-preset', 'default',
                            '-compression_level', '6'
                        ])
                        .output(tempFilePath!)
                        .on('end', () => {
                            resolve(true);
                        })
                        .on('error', (err) => {
                            reject(err);
                        })
                        .run();
                });
                
            } else {
                tempImagePath = join(tmpdir(), `temp_image_${Date.now()}.jpg`);
                await writeFile(tempImagePath, mediaBuffer);
                StickerLogger.info(`Imagem salva temporariamente: ${tempImagePath}`);
                
                tempFilePath = join(tmpdir(), `sticker_${Date.now()}.webp`);
                
                await new Promise((resolve, reject) => {
                    ffmpeg(tempImagePath!)
                        .outputOptions([
                            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000'
                        ])
                        .output(tempFilePath!)
                        .on('end', () => {
                            StickerLogger.info('Conversão de imagem para sticker concluída');
                            resolve(true);
                        })
                        .on('error', (err) => {
                            StickerLogger.error(`Erro na conversão: ${err.message}`);
                            reject(err);
                        })
                        .run();
                });
            }

            const fs = await import('fs/promises');
            try {
                await fs.access(tempFilePath!);
                
                const fileInfo = await fs.stat(tempFilePath!);
                StickerLogger.info(`Sticker criado: ${Math.round(fileInfo.size / 1024)}KB`);
                
                await sock.sendMessage(chatId, {
                    sticker: { url: tempFilePath! },
                    mimetype: 'image/webp'
                }, {
                    quoted: msg
                });

                StickerLogger.success("Sticker enviado com sucesso!");

            } catch (fileError) {
                StickerLogger.error(`Erro ao acessar arquivo: ${fileError}`);
                await sendMessage(chatId, '*[❎]* Erro ao criar o sticker!');
            }

        } catch (downloadError) {
            StickerLogger.error(`Erro no processamento: ${downloadError}`);
            await sendMessage(chatId, '*[❎]* Erro ao processar a mídia!');
        }

    } catch (error) {
        StickerLogger.error(`Erro geral: ${error}`);
        await sendMessage(msg.key.remoteJid!, '*[❎]* Erro ao processar o sticker!');
    } finally {
        const cleanup = async (path: string | null) => {
            if (path) {
                try {
                    await unlink(path);
                } catch (cleanupError) {
                    if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
                        StickerLogger.error(`Erro ao remover arquivo: ${cleanupError}`);
                    }
                }
            }
        };
        
        await cleanup(tempFilePath);
        await cleanup(tempInputPath);
        await cleanup(tempImagePath);
    }
}