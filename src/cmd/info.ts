// src/cmd/info.ts
import { WASocket, proto } from '@whiskeysockets/baileys'

export interface BotInfo {
    name: string
    version: string
    author: string
    commands: CommandInfo[]
}

export interface CommandInfo {
    command: string
    description: string
    usage: string
}

export const botInfo: BotInfo = {
    name: 'Aeon',
    version: '1.0.0',
    author: 'Diego Melo & Bruno Ruthes',
    commands: [
        {
            command: '/start',
            description: 'Iniciar o bot',
            usage: '/start'
        },
        {
            command: '/info',
            description: 'Ver os comandos',
            usage: '/info'
        },
        {
            command: '/ig',
            description: 'Baixar vídeo do Instagram',
            usage: '/ig <link_do_instagram>'
        },
        {
            command: '/tt',
            description: 'Baixar vídeo do TikTok',
            usage: '/tt <link_do_tiktok>'
        },
        {
            command: '/s',
            description: 'Converter sticker ou sticker animado',
            usage: '/s'
        }
    ]
}

export async function handleInfoCommand(
    sock: WASocket,
    msg: proto.IWebMessageInfo,
    sendMessage: (chatId: string, text: string) => Promise<void>
): Promise<void> {
    try {
        const chatId = msg.key.remoteJid!
        
        let infoText = `✨ *${botInfo.name}*\n`
        infoText += `╰┈➤ Versão: ${botInfo.version}\n`
        infoText += `👤 *Dev's:*\n` 
        infoText += `╰┈➤ ${botInfo.author}\n\n`
        
        infoText += `🛠️ *Comandos disponíveis:*\n\n`

        botInfo.commands.forEach((cmd) => {
            infoText += `• *${cmd.description}*\n`
            infoText += `  ╰┈➤ Uso: \`${cmd.usage}\`\n`
        })

        await sendMessage(chatId, infoText)

    } catch (error) {
        console.error('❌ Erro ao processar comando /info:', error)
        await sendMessage(msg.key.remoteJid!, '❌ Erro ao exibir informações do bot.')
    }
}