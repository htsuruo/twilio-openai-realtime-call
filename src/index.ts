import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'

import OpenAIWebSocket from './openai'
import TwilioService from './twilio'
const app = new Hono()

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

app.get('/', (c) => {
  return c.json({ message: 'Hello, world!' })
})

// リクエストを受けてTwilioを使って電話をかけるOutgoingのエンドポイント
app.post('/outgoing-call', async (c) => {
  console.log('Outgoing call request received')
  const call = await TwilioService.instance.createCall()
  return c.json({ callSid: call.sid })
})

// Webhookで自動応答を行うためのエンドポイント
// ref. https://www.twilio.com/docs/messaging/tutorials/how-to-receive-and-reply/node-js
app.post('/incoming-call', async (c) => {
  console.log('Incoming call received from Twilio')
  const response = TwilioService.instance.createTwiml()
  c.header('Content-Type', 'text/xml')
  return c.text(response.toString())
})

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    console.log('Client connected')

    const openAiWs = new OpenAIWebSocket()

    return {
      onOpen: (event) => {
        console.log(`Connected to WebSocket Server: ${event.type}`)
      },
      onMessage: async (event, ws) => {
        const data = JSON.parse(event.data as any)
        try {
          switch (data.event) {
            case 'media':
              openAiWs.appendAudioMessage(data.media.payload)
              break
            case 'start':
              const { streamSid, callSid } = data.start
              console.log('Incoming stream has started', streamSid)
              openAiWs.onmessage(
                streamSid!,
                (audioDelta) => {
                  ws.send(audioDelta)
                },
                async () => {
                  const success = await TwilioService.instance.endCall(callSid)
                  if (success) {
                    ws.close()
                  }
                }
              )
              break
            default:
              console.log('Received non-media event:', data.event)
              break
          }
        } catch (error) {
          console.error('Error parsing message:', error, 'Message:', data)
        }
      },
      onClose: (event) => {
        openAiWs.close()
        console.log(`Client disconnected:  ${event.type}`)
      },
    }
  })
)

export default {
  fetch: app.fetch,
  websocket,
  port: process.env.PORT || 3000,
}
