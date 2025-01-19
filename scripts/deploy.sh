bun run env-to-yaml
gcloud run deploy twilio-realtime-call \
--port 3000 \
  --env-vars-file=.env.yaml \
  --source . \
  --allow-unauthenticated \
  --region asia-northeast1