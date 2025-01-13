# twilio-openai-realtime-call

To install dependencies:

```sh
bun install
```

## Development

ローカルサーバーを起動します:

```sh
bun run dev
```

[ngrok](https://dashboard.ngrok.com/)を使ってローカルホストをhttps URLとしてプロキシし、Webhookで叩けるようにします。ngrokは開発者がローカルの開発サーバー（localhost）をインターネットに公開することを可能にするトンネリング/リバース・プロキシツールです。

```sh
# ngrok http --domain=[YOUR_DOMAIN] [転送先IP]
ngrok http --domain=gladly-discrete-hound.ngrok-free.app http://localhost:3000
```

ref. [【簡単】ngrokで発行されるURLを固定する](https://zenn.dev/y_taiki/articles/ngrok_domain)

## Sequence Diagram

## WebSocketの動作確認方法

[Websocat](https://github.com/vi/websocat)というコマンドラインでWebSocketの簡単な接続確立とメッセージ送受信ができるツールを使うのが楽です。

```sh
# WebSocketのエンドポイントを指定し接続確立
# その後接続確立している状態でターミナル上でメッセージを入力+Enter押下するとメッセージが送信される
websocat ws://localhost:3000/ws
```

## References

- [Build an AI Voice Assistant with Twilio Voice, OpenAI’s Realtime API, and Node.js | Twilio](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node)
- [(41) How to build a voice assistant using OpenAI Realtime API + Twilio Voice + Python - YouTube](https://www.youtube.com/watch?v=OVguB1h-eTs)
- [Realtime APIとTwilioを用いた電話予約デモシステムの構築 | 株式会社AI Shift](https://www.ai-shift.co.jp/techblog/4980)
- [【リアルタイム音声通話】OpenAI Realtime APIとTwilioで実装する：とりあえず動かすための簡単ガイド](https://zenn.dev/shurijo_dot_com/articles/a6a8710f2ecc53)
- [Realtime APIでAIが応答する電話窓口を実現。 技術部ブログ | 株式会社インターパーク Interpark., Co. Ltd.](https://www.interpark.co.jp/dev/p0503.htm)
- [twilio-samples/live-translation-openai-realtime-api: Integrate AI-powered voice translation into a Twilio Flex contact center using our prebuilt starter app, enabling live conversations between agents and customers speaking different languages.](https://github.com/twilio-samples/live-translation-openai-realtime-api)
  - リアルタイム翻訳のTwilio公式サンプル
