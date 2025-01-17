import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import twilio from 'twilio'
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse'
import { FROM_PHONE_NUMBER, PORT, TO_PHONE_NUMBER } from './config'

import OpenAIWebSocket from './openai'
const app = new Hono()

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const client = twilio(accountSid, authToken)
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

// リクエストを受けてTwilioを使って電話をかけるOutgoingのエンドポイント
app.post('/outgoing-call', async (c) => {
  console.log('Outgoing call request received')
  const call = await client.calls.create({
    from: FROM_PHONE_NUMBER,
    to: TO_PHONE_NUMBER,
    twiml: createTwiml(),
  })
  return c.json({ callSid: call.sid })
})

// Webhookで自動応答を行うためのエンドポイント
// TwilioからのHTTPリクエストを処理し、TwilioにTwiMLレスポンスを返却する
// ref. https://www.twilio.com/docs/messaging/tutorials/how-to-receive-and-reply/node-js
app.post('/incoming-call', async (c) => {
  console.log('Incoming call received from Twilio')
  const response = createTwiml()
  c.header('Content-Type', 'text/xml')
  return c.text(response.toString())
})

/**
 * Creates a new instance of Twilio's VoiceResponse object.
 * This object is used to generate TwiML (Twilio Markup Language) responses
 * for controlling call behavior in Twilio's voice applications.
 *
 * @see https://www.twilio.com/docs/voice/twiml
 */
function createTwiml(): VoiceResponse {
  const response = new twilio.twiml.VoiceResponse()
  // 通話開始のシステムメッセージ
  setSystemMessage(response, 'こんにちは。オペレーターにお繋ぎします。')
  const connect = response.connect()
  connect.stream({
    url: 'wss://gladly-discrete-hound.ngrok-free.app/ws',
  })
  // 通話終了のシステムメッセージ
  setSystemMessage(response, '以上でオペレーターとの通話を終了します。')
  console.log(response.toString())
  return response
}

function setSystemMessage(response: VoiceResponse, message: string) {
  response.say(
    {
      language: 'ja-JP',
      voice: 'Polly.Mizuki',
    },
    message
  )
}

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    console.log('Client connected')
    console.log('Call SID:', c.req.query('callSid'))

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
              openAiWs.appendAudioMessageIfOpen(data.media.payload)
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
                  const success = await endCall(callSid)
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

export async function endCall(callSid: string): Promise<Boolean> {
  try {
    await client.calls(callSid).update({
      status: 'completed',
    })
    console.log(`Call ended successfully: ${callSid}`)
    return true
  } catch (error) {
    console.error(`Error ending call: ${callSid}`, error)
    return false
  }
}

export default {
  fetch: app.fetch,
  websocket,
  port: PORT,
}
