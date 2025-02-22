import { ServerWebSocket } from 'bun'
import { WSContext } from 'hono/ws'
import WebSocket from 'ws'
import { SYSTEM_MESSAGE } from '../prompt'

class OpenAIWebSocket {
  private readonly ws: WebSocket
  private readonly END_CALL_NAME = 'end_call'

  private conversationLogs: string = ''

  private readonly LOG_EVENT_TYPES = [
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created',
    'session.updated',
    'response.create',
  ]

  constructor() {
    const url =
      // 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17'
      // 一旦費用面が気になるのでgpt-4o-miniに変更
      'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17'
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
        'OpenAI-Beta': 'realtime=v1',
      },
    })

    this.ws.onopen = async () => {
      console.log('Connected to the OpenAI Realtime API')
      await this.delay(250)
      const sessionUpdate = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          turn_detection: { type: 'server_vad' },
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          voice: 'coral',
          instructions: SYSTEM_MESSAGE,
          input_audio_transcription: { model: 'whisper-1' },
          temperature: 0.6,
          tools: [
            {
              type: 'function',
              name: this.END_CALL_NAME,
              description:
                'Terminates an active Twilio call. This function should be called when the conversation is finished or when the user has indicated that they want to end the call. Call this function when the user says phrases like "end the call", "hang up", "terminate the call", or expresses clear intent to stop the conversation.',
            },
          ],
        },
      }
      this.ws.send(JSON.stringify(sessionUpdate))

      // オペレーターから会話が始まるように初期メッセージを指定
      // `conversation.item.create`ではない点に注意
      // 以下と全く同じ状況だった
      // ref. https://community.openai.com/t/realtime-api-does-not-trigger-after-conversation-item-create-event/1079792
      const initialMessage = {
        type: 'response.create',
        response: {
          instructions: 'もしもし、こんにちは。',
        },
      }
      this.ws.send(JSON.stringify(initialMessage))
    }
  }

  isOpen = () => this.ws.readyState === WebSocket.OPEN
  appendAudioMessage(audio: string) {
    if (this.isOpen()) {
      const audioAppend = {
        type: 'input_audio_buffer.append',
        audio,
      }
      this.ws.send(JSON.stringify(audioAppend))
    }
  }

  close(callSid: string | null) {
    if (this.isOpen()) {
      this.ws.close()
      console.log('Closed connection to OpenAI Realtime API')
      console.log(
        `==Conversation Logs(callSid: ${callSid})==\n${this.conversationLogs}\n===`
      )
    }
  }

  onmessage(param: {
    streamSid: string
    twilioWs: WSContext<ServerWebSocket>
    endCallFunc: () => Promise<void>
  }) {
    const { streamSid, twilioWs, endCallFunc } = param

    this.ws.on('message', async (data) => {
      try {
        const response = JSON.parse(data as any)
        if (this.LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response)
        }
        // 会話ログを保持
        this.handleAudioTranscription(response)

        // OpenAIからの音声データをTwilioに転送
        if (response.type === 'response.audio.delta' && response.delta) {
          const audioDelta = this.convertToTwilioAudio(
            streamSid,
            Buffer.from(response.delta, 'base64').toString('base64')
          )
          twilioWs.send(audioDelta)
        }

        // 発話者の会話を検知したら割り込んで前の発話を停止させる
        if (response.type === 'input_audio_buffer.speech_started') {
          console.log('Speech started')
          // Twilioにメッセージクリアを要求
          // ref. https://www.twilio.com/docs/voice/media-streams/websocket-messages#send-a-clear-message
          twilioWs.send(JSON.stringify({ event: 'clear', streamSid }))
          this.ws.send(JSON.stringify({ type: 'response.cancel' }))
        }
        if (response.type === 'response.output_item.done') {
          const item = response.item
          console.log(
            `[response.output_item.done] item.type: ${item.type}, item.name: ${item.name}`
          )
          if (item.type === 'function_call') {
            if (item.name === this.END_CALL_NAME) {
              // TODO(htsuruo): コール終了前に最後のメッセージを送信したいが発話されない
              const event = {
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: 'ありがとうございました。それでは、失礼いたします。',
                    },
                  ],
                },
              }
              // conversation.item.createだけでは発話されず、response.createを送信する必要がある(?)
              this.ws.send(JSON.stringify(event))
              this.ws.send(JSON.stringify({ type: 'response.create' }))
              await endCallFunc()
            }
          }
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
  }

  // トランスクリプトを取得（事前にsession.updateでinput_audio_transcriptionを指定が必要）
  // ref. https://platform.openai.com/docs/api-reference/realtime-server-events/conversation/item/input_audio_transcription
  private handleAudioTranscription(response: any) {
    // 入力音声のトランスクリプト
    if (
      response.type === 'conversation.item.input_audio_transcription.completed'
    ) {
      console.log(
        `conversation.item.input_audio_transcription.completed: ${response.transcript}`
      )
      this.conversationLogs += `user: ${response.transcript}`
    }

    // 出力音声のトランスクリプト
    if (response.type === 'response.audio_transcript.done') {
      console.log(`response.audio_transcript.done: ${response.transcript}`)
      this.conversationLogs += `assistant: ${response.transcript}\n`
    }
  }

  /**
   * Converts the given stream SID and payload into a Twilio audio response.
   *
   * @param streamSid - The unique identifier for the Twilio stream.
   * @param payload - The media payload to be included in the response.
   * @returns A JSON string representing the Twilio audio response.
   */
  private convertToTwilioAudio(streamSid: string, payload: string): string {
    const response = {
      event: 'media',
      streamSid,
      media: { payload },
    }
    return JSON.stringify(response)
  }

  /**
   * Delays the execution for a specified number of milliseconds.
   *
   * @param ms - The number of milliseconds to delay.
   * @returns A promise that resolves after the specified delay.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export default OpenAIWebSocket
