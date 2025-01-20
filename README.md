# twilio-openai-realtime-call

> The App opens up Speech to Speech (S2S) capabilities for their GPT-4o multimodal model, which supports direct audio input and output – avoiding translating back and forth from text with a speech-to-text (SST) or text-to-speech (TTS) step.

- JavaScript Runtime, Package Manager: [Bun](https://bun.sh/)(v1.1.43)
- Server Framework: [Hono](https://hono.dev/)
- Hosting: [Cloud Run](https://cloud.google.com/run?hl=en)

### 主な機能

- 指定のエンドポイント（`/outgoint-call`）を叩くことでTwilioから通話がかかる
- 会話はOpenAI Realtime APIでプロンプトに従って電話口で対話
- Function callingにより発話者の終了の合図でTwilio APIを叩き通話が終了する

## Setup

以下の環境変数を定義した`.env`を作成します（`direnv`を利用している場合は`.envrc`に`dotenv`のみを記載します）:

```language
TWILIO_ACCOUNT_SID="YOUR_ACCOUNT_SID"
TWILIO_AUTH_TOKEN="YOUR_AUTH_TOKEN"
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
TO_PHONE_NUMBER="YOUR_TO_PHONE_NUMBER"
FROM_PHONE_NUMBER="YOUR_FROM_PHONE_NUMBER"
```

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

### Outgoing Call

以下のcURLリクエストでTwilioから着信を受け取ることができます:

```bash
curl --location 'http://localhost:3000/outgoing-call' \
--header 'Content-Type: application/json' \
--data '{
    "phoneNumber": "+819012345678"
}'
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Mobile
    participant Twilio
    participant Server
    participant OpenAI

    Mobile->>Twilio: Call Twilio Phone Number
    activate Twilio
    Twilio->>Server: HTTP POST /incoming-call (Webhook)
    activate Server
    Server->>Twilio: TwiML Response (<Connect><Stream>)
    deactivate Server
    Twilio->>Server: WebSocket Connection (Stream)
    activate Server
    loop Audio Stream (Twilio -> Server)
        Twilio->>Server: WebSocket Frame (JSON: Start Event, base64 audio data, Stop Event)
        Server->>OpenAI: Audio Data(OpenAI)
        activate OpenAI
        OpenAI->>Server: Text Response
        deactivate OpenAI
        Server->>OpenAI: Text Input
        activate OpenAI
        OpenAI->>Server: Audio Data(OpenAI)
         deactivate OpenAI
          Server->>Twilio:  WebSocket Frame (JSON: base64 audio data, StreamSid)
    end
    Server-->>Twilio:  Close WebSocket Connection
    deactivate Server
    Twilio-->>Mobile: Play Audio Response

    Twilio-->>Mobile: Disconnect Call
```

### 処理の流れ

1. クライアントからTwilioで発行した指定の電話番号へCall
1. Twilio は着信をトリガーにWebhookが発火しサーバーエンドポイント`/incoming-call`が実行
1. `/incoming-call`ではWebSocket URLを指定したTwiMLを作成しレスポンスを返却
1. Twilio は、サーバーから受け取った TwiML レスポンスを解析
    - `<Connect><Stream>` の検出: Twilio は`<Connect>`の中に`<Stream>`タグを見つけ、`<Stream>` 動詞の url 属性で指定された URL にWebSocket接続
1. WebSocket 接続が成功すると、Twilio は通話中の音声データを継続的に WebSocket で`<Stream>`で指定したURLにメッセージを送信
1. Twilioから受け取った音声データをOpenAI Realtime APIで処理し返答用の音声データを取得
1. 返答用音声データをbase64→TwiMLの形式に変換し、音声データが流れてくる度に自動応答が発話される（以下ループ）
1. 通話が終了するか TwiML で終了指示があるとWebSocket接続は切れ通話は終了

## WebSocketの動作確認方法

PostmanでWebSocketリクエストを試すことができます: [Send WebSocket requests with Postman | Postman Docs](https://learning.postman.com/docs/sending-requests/websocket/websocket-overview/)

```bash
ws://localhost:3000/ws
```

## Deploy

サーバーレスでは[Cloud RunがWebSocketに対応している](https://cloud.google.com/run/docs/triggering/websockets?hl=ja)のでコンテナ化してデプロイするのが低価格かつ楽な方法だと思います。

> WebSocket リクエストは、Cloud Run で長時間実行される HTTP リクエストとして扱われます。アプリケーション サーバーがタイムアウトを適用しない場合でも、リクエスト タイムアウトの影響を受けます（最大 60 分、デフォルトは 5 分）。

WebSocketの接続が確立している状態（`onopen`な状態）であればCloud Runはアクティブとに見なされるため、リクエストタイムアウトの設定時間まではインスタンスが残り続けます（その分[課金](https://cloud.google.com/run/pricing?hl=ja#billable-time)は発生します）。記載の通り**最大60分、デフォルトは5分**です。

デプロイは適切なGoogle Cloudアカウントの設定が済んでいる前提であれば以下のみで完了です:

```bash
bun run deploy
```

## 料金

[KDDIが2023年に代理店契約終了した](https://kwcplus.kddi-web.com/notice/termination-of-serviceprovision)ことにより色々と使いづらくなってしまった見たい。Twilio API使ってアプリケーション開発する際に利用する[Programmable Voice](https://www.twilio.com/docs/voice)だが、Outbound/Inboundそれぞれで価格表が公開されている。

参考までに日本国内のスマートフォンで080,090番号を使ってOutbound(Outgoing Call)をすると、1分あたり28円と請求費用が高いので注意。Twilioの発信元は米国とスゥエーデンあたりしか選べる国際ローミングなどの追加料金がかかっているのかも(?)。
![Image](https://github.com/user-attachments/assets/ae48b9ce-4db9-4ba0-9b95-4d0f00142784)

実際、累計60分の通話で$28 *60 = 1,680円（1USD≒156円換算）の請求が発生した。

## Media Streamsの仕様メモ

[Media Streams Overview | Twilio](https://www.twilio.com/docs/voice/media-streams)

TwilioのMedia StreamsはTwiMLで指定したWebSocket URLに対して音声ローデータをストリーミングしてくれる機能。単方向（[Unidirectional Media Streams](https://www.twilio.com/docs/voice/media-streams#unidirectional-media-streams)）と双方向（[Bidirectional Media Streams](https://www.twilio.com/docs/voice/media-streams#bidirectional-media-streams)）の2種類がある。

- 単方向（Unidirectional Media Streams）: `<Start><Stream>`
- 双方向（Bidirectional Media Streams）: `<Connect><Stream>`

### 発行されるTwiMLの例

```yaml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
 <Say language="ja-JP" voice="Polly.Mizuki">こんにちは。オペレーターにお繋ぎします。</Say>
 <Connect>
  <Stream url="wss://[YOUR_DOMAIN]/ws">
    <Parameter name="customerId" value="12345"/>
  </Stream>
 </Connect>
 <Say language="ja-JP" voice="Polly.Mizuki">以上でオペレーターとの通話を終了します。</Say>
</Response>
```

### onMessageで受け取るTwilioのデータの形式例

ref. [Media Streams - WebSocket Messages | Twilio](https://www.twilio.com/docs/voice/media-streams/websocket-messages)

`start`イベントの例:

※`customParameters`は`start`イベントでしか受け取れない点に注意

```yaml
{
  event: "start",
  sequenceNumber: "1",
  start: {
    accountSid: "xxx",
    streamSid: "MZ750f90a3ac2a60f9848fe3c660b48544",
    callSid: "CAfb3a8220146265a21ede79577534cee3",
    tracks: [ "inbound" ],
    mediaFormat: {
      encoding: "audio/x-mulaw",
      sampleRate: 8000,
      channels: 1,
    },
    # TwiMLでパラメーターをセットしておくとここに入ってくる
    customParameters: {
      customerId: "12345",
    },
  },
  streamSid: "MZ750f90a3ac2a60f9848fe3c660b48544",
}
```

`media`イベントの例:

```yaml
{
  "event": "media",
  "sequenceNumber": "926",
  "media": {
    "track": "inbound",
    "chunk": "925",
    "timestamp": "18553",
    "payload": "fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fg=="
  },
  "streamSid": "MZ893cd917cb56661c1c498970e1fe3e08",
}

```

## References

- [Build an AI Voice Assistant with Twilio Voice, OpenAI’s Realtime API, and Node.js | Twilio](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node)
- [(41) How to build a voice assistant using OpenAI Realtime API + Twilio Voice + Python - YouTube](https://www.youtube.com/watch?v=OVguB1h-eTs)
- [Realtime APIとTwilioを用いた電話予約デモシステムの構築 | 株式会社AI Shift](https://www.ai-shift.co.jp/techblog/4980)
- [【リアルタイム音声通話】OpenAI Realtime APIとTwilioで実装する：とりあえず動かすための簡単ガイド](https://zenn.dev/shurijo_dot_com/articles/a6a8710f2ecc53)
- [Realtime APIでAIが応答する電話窓口を実現。 技術部ブログ | 株式会社インターパーク Interpark., Co. Ltd.](https://www.interpark.co.jp/dev/p0503.htm)
- [twilio-samples/live-translation-openai-realtime-api: Integrate AI-powered voice translation into a Twilio Flex contact center using our prebuilt starter app, enabling live conversations between agents and customers speaking different languages.](https://github.com/twilio-samples/live-translation-openai-realtime-api)
  - リアルタイム翻訳のTwilio公式サンプル
- [Twilio Streamingデータを用いたユーザー発話へのリアルタイム音声処理 | 株式会社AI Shift](https://www.ai-shift.co.jp/techblog/2844)
- [OpenAI の Realtime API で音声を使って任意の関数を実行する(Function calling編) | 豆蔵デベロッパーサイト](https://developer.mamezou-tech.com/blogs/2024/10/09/openai-realtime-api-function-calling/)
- [Transcribe Phone Calls in Real-Time using Node.js with AssemblyAI, and Twilio | Twilio](https://www.twilio.com/en-us/blog/phone-call-transcription-assemblyai-twilio-node)
  - AssemblyAIを使った通話の文字起こし
