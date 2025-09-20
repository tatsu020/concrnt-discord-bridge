import {
    Client as DiscordClient,
    GatewayIntentBits,
    Partials,
    Events,
    WebhookClient
} from 'discord.js'

import { Client as ConcrntClient } from '@concrnt/worldlib'

const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const CONCRNT_SECRET = process.env.CONCRNT_SECRET
const CONCRNT_SERVER = process.env.CONCRNT_SERVER || "denken.concrnt.net"
const WEBHOOK_NAME = process.env.WEBHOOK_NAME || "Concrnt Bridge"
const CONCRNT_TIMELINE = process.env.CONCRNT_TIMELINE
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID

const concrntClient = await ConcrntClient.create(CONCRNT_SECRET, CONCRNT_SERVER)
let webhookClient = undefined

const socket = await concrntClient.newSocketListener()
socket.on('MessageCreated', async (msg) => {
    console.log("Concrnt message:", msg)
    if (!webhookClient) {
        console.log("Webhook client not ready")
        return
    }

    const doc = JSON.parse(msg.document)
    const body = doc.body

    if (doc.signer === concrntClient.ccid) {
        console.log("Ignoring own message")
        return
    }

    const author = await concrntClient.getUser(doc.signer)

    webhookClient.send({
        content: body.body,
        username: author?.profile?.username,
        avatarURL: author?.profile?.avatar,
    })

})
await socket.listen([CONCRNT_TIMELINE])

const discordClient = new DiscordClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel,
        Partials.Message
    ],
})

discordClient.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${discordClient.user.tag}`)

    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID)
    const hooks = await channel.fetchWebhooks().catch(() => null);
    const existing = hooks?.find(h => h.name === WEBHOOK_NAME);

    const hook = existing ?? await channel.createWebhook({ name: WEBHOOK_NAME })

    webhookClient = new WebhookClient({ id: hook.id, token: hook.token })
    console.log("Webhook client ready:", WEBHOOK_NAME)
})

discordClient.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    console.log(message);

    if (message.channelId !== DISCORD_CHANNEL_ID) return;

    await concrntClient.createMarkdownCrnt(
        message.content,
        [CONCRNT_TIMELINE],
        {
            profileOverride: {
                username: message.author.username,
                avatar: message.author.displayAvatarURL({ forceStatic: false, size: 256 }),
            }
        }
    )
});

discordClient.login(DISCORD_TOKEN);

