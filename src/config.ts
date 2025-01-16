export const SYSTEM_MESSAGE =
  'You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.'
export const VOICE = 'alloy'
export const PORT = process.env.PORT || 3000

export const FROM_PHONE_NUMBER = process.env.FROM_PHONE_NUMBER!
export const TO_PHONE_NUMBER = process.env.TO_PHONE_NUMBER!
export const LOG_EVENT_TYPES = [
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
]
