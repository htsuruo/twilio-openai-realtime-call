import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { WSContext } from 'hono/ws'
import twilio from 'twilio'

const app = new Hono()

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const client = twilio(accountSid, authToken)
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

app.post('/create-call', async (c) => {
  const call = await client.calls.create({
    from: '+16085995923',
    to: process.env.TO_PHONE_NUMBER!,
    twiml: createTwimlResponse(),
  })
  console.log(call.sid)
  return c.json({ callSid: call.sid })
})

// Webhookで自動応答を行うためのエンドポイント
// TwilioからのHTTPリクエストを処理し、TwilioにTwiMLレスポンスを返却する
// ref. https://www.twilio.com/docs/messaging/tutorials/how-to-receive-and-reply/node-js
app.post('/incoming-call', async (c) => {
  console.log('Incoming call received from Twilio')
  const response = createTwimlResponse()
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
function createTwimlResponse() {
  const response = new twilio.twiml.VoiceResponse()
  const connect = response.connect()
  connect.stream({
    url: 'wss://gladly-discrete-hound.ngrok-free.app/ws',
  })
  // ストリームが終わるまでは以下は実行されない
  response.say(
    {
      language: 'ja-JP',
      voice: 'Polly.Mizuki',
    },
    '以上で自動応答を終了します。'
  )
  console.log(response.toString())
  return response
}

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    return {
      onOpen: (event, ws) => {
        console.log(`Connection opened: ${event.type}`)
        // new OpenAIWebSocket()
      },
      onMessage: async (event, ws) => {
        const e = JSON.parse(event.data as any)
        if (e.event === 'media') {
          const inputMessage = e.media.payload
          console.log(`inputMessage: ${inputMessage}`)
          if (inputMessage) {
            // const audioBuffer = Buffer.from(inputMessage, 'base64')
            // console.log('Send to OpenAI')
            //テキストをもとに音声を作成し、Twilioに送る
            await sendAudioToTwilio(ws, e.streamSid, 'Hello, World!')
          }
        }
      },
      onClose: (event, ws) => {
        console.log(`Connection closed: ${event.type}`)
      },
      onError: (event, _) => {
        console.error(`Error: ${event.type}`)
      },
    }
  })
)

async function sendAudioToTwilio(
  ws: WSContext<ServerWebSocket<undefined>>,
  streamSid: string,
  text: string
) {
  const response = {
    event: 'media',
    media: {
      payload: generateMediaPayload(text),
    },
    streamSid,
  }
  ws.send(JSON.stringify(response))
}

const generateMediaPayload = (text: string) => {
  // 文字列をUint8Arrayに変換(UTF-8)
  const textEncoder = new TextEncoder()
  const byteArray = textEncoder.encode(text)

  // Uint8ArrayをBase64エンコード
  const base64String = Buffer.from(byteArray).toString('base64')

  return base64String
}

type ResponseAudioPayload = {
  event: 'media'
  media: {
    payload: string // base64 encoded audio
  }
  streamSid: string
}
export default {
  fetch: app.fetch,
  websocket,
}
