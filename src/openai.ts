import WebSocket from 'ws'
import { LOG_EVENT_TYPES, SYSTEM_MESSAGE, VOICE } from './config'

class OpenAIWebSocket {
  private readonly ws: WebSocket
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
          voice: VOICE,
          instructions: SYSTEM_MESSAGE,
          temperature: 0.8,
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
  appendAudioMessageIfOpen(audio: string) {
    if (this.isOpen()) {
      const audioAppend = {
        type: 'input_audio_buffer.append',
        audio,
      }
      this.ws.send(JSON.stringify(audioAppend))
    }
  }

  close() {
    if (this.isOpen()) {
      this.ws.close()
      console.log('Closed connection to OpenAI Realtime API')
    }
  }

  onmessage(streamSid: string, callback: (audioDelta: string) => void) {
    this.ws.on('message', (data) => {
      try {
        const response = JSON.parse(data as any)
        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response)
        }
        if (response.type === 'session.updated') {
          console.log('Session updated successfully:', response)
        }
        if (response.type === 'response.audio.delta' && response.delta) {
          const audioDelta = this.convertToTwilioAudio(
            streamSid!,
            Buffer.from(response.delta, 'base64').toString('base64')
          )
          callback(audioDelta)
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
