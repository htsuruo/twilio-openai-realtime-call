import twilio from 'twilio'
import { CallInstance } from 'twilio/lib/rest/api/v2010/account/call'
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse'

class TwilioService {
  private readonly client: twilio.Twilio
  // TODO(htsuruo): ENVで切り替える

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    this.client = twilio(accountSid, authToken)
  }
  static get instance() {
    return (this._instance ??= new TwilioService())
  }
  private static _instance: TwilioService | undefined

  async createCall(): Promise<CallInstance> {
    const from = process.env.FROM_PHONE_NUMBER
    const to = process.env.TO_PHONE_NUMBER
    if (!from || !to) {
      throw new Error(
        'FROM_PHONE_NUMBER and TO_PHONE_NUMBER must be set in the environment'
      )
    }

    return this.client.calls.create({
      from,
      to,
      twiml: this.createTwiml(),
      record: true,
    })
  }

  /**
   * Creates a new instance of Twilio's VoiceResponse object.
   * This object is used to generate TwiML (Twilio Markup Language) responses
   * for controlling call behavior in Twilio's voice applications.
   *
   * @see https://www.twilio.com/docs/voice/twiml
   */
  createTwiml(): VoiceResponse {
    const response = new twilio.twiml.VoiceResponse()
    // 通話開始のシステムメッセージ
    this.setSystemMessage(response, 'こんにちは。オペレーターにお繋ぎします。')
    const connect = response.connect()
    connect.stream({
      url: `wss://${process.env.DOMAIN}/ws`,
    })
    // 通話終了のシステムメッセージ
    this.setSystemMessage(response, '以上でオペレーターとの通話を終了します。')
    console.log(response.toString())
    return response
  }

  setSystemMessage(response: VoiceResponse, message: string) {
    response.say(
      {
        language: 'ja-JP',
        voice: 'Polly.Mizuki',
      },
      message
    )
  }

  async endCall(callSid: string): Promise<Boolean> {
    try {
      await this.client.calls(callSid).update({
        status: 'completed',
      })
      console.log(`Call ended successfully: ${callSid}`)
      return true
    } catch (error) {
      console.error(`Error ending call: ${callSid}`, error)
      return false
    }
  }
}

export default TwilioService
