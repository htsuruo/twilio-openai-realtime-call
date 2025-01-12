import { Hono } from 'hono'
import twilio from 'twilio'

const app = new Hono()

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const client = twilio(accountSid, authToken)

// Webhookで自動応答を行うためのエンドポイント
// ref. https://www.twilio.com/docs/messaging/tutorials/how-to-receive-and-reply/node-js
app.post('/incoming-call', async (c) => {
  /**
   * Creates a new instance of Twilio's VoiceResponse object.
   * This object is used to generate TwiML (Twilio Markup Language) responses
   * for controlling call behavior in Twilio's voice applications.
   *
   * @see https://www.twilio.com/docs/voice/twiml
   */
  const twiml = new twilio.twiml.VoiceResponse()
  twiml.say('こんにちは、これは自動音声応答です。')
  c.header('Content-Type', 'text/xml')
  return c.text(twiml.toString())
})

export default app
