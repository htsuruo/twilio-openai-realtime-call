import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import twilio from 'twilio'

const app = new Hono()

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const client = twilio(accountSid, authToken)
const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

// Webhookで自動応答を行うためのエンドポイント
// TwilioからのHTTPリクエストを処理し、TwilioにTwiMLレスポンスを返却する
// ref. https://www.twilio.com/docs/messaging/tutorials/how-to-receive-and-reply/node-js
app.post('/incoming-call', async (c) => {
  console.log('Incoming call received from Twilio')
  /**
   * Creates a new instance of Twilio's VoiceResponse object.
   * This object is used to generate TwiML (Twilio Markup Language) responses
   * for controlling call behavior in Twilio's voice applications.
   *
   * @see https://www.twilio.com/docs/voice/twiml
   */
  const twiml = new twilio.twiml.VoiceResponse()
  twiml.say(
    {
      language: 'ja-JP',
      voice: 'Polly.Mizuki',
    },
    'こんにちは、これは自動音声応答です。'
  )
  c.header('Content-Type', 'text/xml')
  return c.text(twiml.toString())
})

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    return {
      onOpen: (event, ws) => {
        console.log(`Connection opened: ${event.type}`)
        ws.send('[onOpen]Hello from server!')
      },
      onMessage(event, ws) {
        console.log(`Message from client: ${event.data}`)
        ws.send(`Received message from client!: ${event.data}`)
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
export default {
  fetch: app.fetch,
  websocket,
}
