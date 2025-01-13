import WebSocket from 'ws'

class OpenAIWebSocket {
  private ws: WebSocket
  constructor() {
    const url =
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17'
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
        'OpenAI-Beta': 'realtime=v1',
      },
    })

    this.ws.onopen = () => {
      console.log('OpenAI WebSocket connection opened')
    }

    this.ws.onmessage = (event) => {
      console.log('Received message from OpenAI:')
      const data = JSON.parse(event.data.toString())
      console.log(data)
    }

    this.ws.onerror = (error) => {
      console.error('error:', error)
    }
    this.ws.onclose = () => {
      console.log('Closed connection')
    }
  }
}

export default OpenAIWebSocket
