import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import twilio from 'twilio'
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse'
import {
  FROM_PHONE_NUMBER,
  LOG_EVENT_TYPES,
  PORT,
  SYSTEM_MESSAGE,
  TO_PHONE_NUMBER,
  VOICE,
} from './config'

import WebSocket from 'ws'
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
function createTwiml() {
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
    let streamSid: string | null = null

    const openAiWs = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
      {
        headers: {
          Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    )

    return {
      onOpen: (event, ws) => {
        console.log(`Connected to WebSocket Server: ${event.type}`)

        openAiWs.on('open', () => {
          console.log('Connected to the OpenAI Realtime API')
          setTimeout(() => {
            const sessionUpdate = {
              type: 'session.update',
              session: {
                turn_detection: { type: 'server_vad' },
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                voice: VOICE,
                instructions: SYSTEM_MESSAGE,
                modalities: ['text', 'audio'],
                temperature: 0.8,
              },
            }
            console.log(
              'Sending session update:',
              JSON.stringify(sessionUpdate)
            )
            openAiWs.send(JSON.stringify(sessionUpdate))
          }, 250)
        })

        openAiWs.on('message', (data) => {
          try {
            const response = JSON.parse(data as any)
            if (LOG_EVENT_TYPES.includes(response.type)) {
              console.log(`Received event: ${response.type}`, response)
            }
            if (response.type === 'session.updated') {
              console.log('Session updated successfully:', response)
            }
            if (response.type === 'response.audio.delta' && response.delta) {
              const audioDelta = convertToTwilioAudio(
                streamSid!,
                Buffer.from(response.delta, 'base64').toString('base64')
              )
              ws.send(audioDelta)
            }
          } catch (error) {
            console.error(
              'Error processing OpenAI message:',
              error,
              'Raw message:',
              data
            )
          }
        })
      },
      onMessage: async (event, ws) => {
        const data = JSON.parse(event.data as any)
        try {
          switch (data.event) {
            case 'media':
              if (openAiWs.readyState === WebSocket.OPEN) {
                const audioAppend = {
                  type: 'input_audio_buffer.append',
                  audio: data.media.payload,
                }
                openAiWs.send(JSON.stringify(audioAppend))
              }
              break
            case 'start':
              streamSid = data.start.streamSid
              console.log('Incoming stream has started', streamSid)
              break
            default:
              console.log('Received non-media event:', data.event)
              break
          }
        } catch (error) {
          console.error('Error parsing message:', error, 'Message:', data)
        }
      },
      onClose: (event, ws) => {
        if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close()
        console.log(`Client disconnected:  ${event.type}`)
      },
    }
  })
)

/**
 * Converts the given stream SID and payload into a Twilio audio response.
 *
 * @param streamSid - The unique identifier for the Twilio stream.
 * @param payload - The media payload to be included in the response.
 * @returns A JSON string representing the Twilio audio response.
 */
function convertToTwilioAudio(streamSid: string, payload: string): string {
  const response = {
    event: 'media',
    streamSid,
    media: { payload },
  }
  return JSON.stringify(response)
}

export default {
  fetch: app.fetch,
  websocket,
  port: PORT,
}
