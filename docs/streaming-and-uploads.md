# Streaming, AI & File Uploads

This guide demonstrates how to consume real-time Server-Sent Events (SSE) and AI LLM token streams, track upload and download progress in real time, and upload binary files with **`react-native-fetch-client`**.

---

## 🤖 1. AI LLM Token & SSE Streaming (`api.stream`)

Consuming streaming responses from AI providers (OpenAI, Anthropic, Gemini, Ollama) traditionally requires third-party event-source polyfills. `react-native-fetch-client` provides native async generator streaming via `api.stream`:

```typescript
import { createClient } from 'react-native-fetch-client';

const aiClient = createClient({
  baseURL: 'https://api.openai.com/v1',
  bearerToken: process.env.OPENAI_API_KEY,
});

// Stream completions token-by-token
const eventStream = aiClient.stream('/chat/completions', {
  method: 'POST',
  body: {
    model: 'gpt-4o',
    stream: true,
    messages: [{ role: 'user', content: 'Explain quantum computing in 3 bullets' }],
  },
});

let accumulatedText = '';

for await (const chunk of eventStream) {
  if (chunk.data === '[DONE]') break;

  try {
    const parsed = JSON.parse(chunk.data);
    const token = parsed.choices[0]?.delta?.content ?? '';
    accumulatedText += token;
    process.stdout.write(token); // Stream directly to UI or terminal
  } catch {
    // Non-JSON SSE event
  }
}
```

### Parsing SSE Chunks Manually (`parseSseStream`)
If you have an existing `ReadableStream<Uint8Array>` (from any Fetch response or WebSocket bridge), convert it to SSE events using `parseSseStream`:

```typescript
import { parseSseStream } from 'react-native-fetch-client';

const response = await fetch('https://api.example.com/events');
const eventStream = parseSseStream(response.body!);

for await (const event of eventStream) {
  console.log(`Event ID: ${event.id}, Name: ${event.event}, Data: ${event.data}`);
}
```

---

## 📤 2. File Upload Helper (`api.upload`)

The `api.upload` method simplifies sending files, multipart forms, or binary buffers without worrying about manual boundary setting or header collisions:

```typescript
import { createClient } from 'react-native-fetch-client';

const api = createClient({ baseURL: 'https://api.example.com' });

// 1. Uploading a File / Blob
const file = new File(['Hello, world!'], 'sample.txt', { type: 'text/plain' });

const uploadRes = await api.upload<{ fileUrl: string }>('/media/upload', file, {
  fieldName: 'document', // Default: 'file'
  fileName: 'custom-sample.txt',
  additionalFields: {
    folderId: 'inbox',
    isPublic: true,
  },
});
console.log(uploadRes.data.fileUrl);

// 2. Uploading a pre-constructed FormData
const formData = new FormData();
formData.append('avatar', imageBlob, 'avatar.png');
formData.append('userId', '123');

await api.upload('/users/avatar', formData);
```

---

## 📊 3. Upload Progress Tracking (`onUploadProgress`)

Track real-time upload progress with loaded bytes, total bytes, and computed percentage using WHATWG byte streams:

```typescript
import { type ProgressEvent } from 'react-native-fetch-client';

const res = await api.upload('/videos/upload', videoBlob, {
  onUploadProgress: (progress: ProgressEvent) => {
    const { loaded, total, percent, lengthComputable } = progress;

    if (lengthComputable && percent !== undefined) {
      console.log(`Uploading: ${percent}% (${(loaded / 1024 / 1024).toFixed(1)} MB / ${(total! / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      console.log(`Uploaded: ${(loaded / 1024).toFixed(1)} KB`);
    }
  },
});
```

---

## 📥 4. Download Progress Tracking (`onDownloadProgress`)

Monitor the progress of large asset, model, or document downloads:

```typescript
const pdf = await api.get('/reports/annual-2026.pdf', {
  responseType: 'blob',
  onDownloadProgress: (progress: ProgressEvent) => {
    if (progress.percent !== undefined) {
      console.log(`Downloading report: ${progress.percent}% complete`);
    }
  },
});

console.log(`Downloaded file size: ${pdf.data.size} bytes`);
```

---

## 🌊 5. Raw WHATWG Byte Streams (`responseType: 'stream'`)

For custom streaming processing (e.g. streaming audio decoding, parsing NDJSON lines, or saving to native disk via `react-native-fs` / `expo-file-system`):

```typescript
const response = await api.get<ReadableStream<Uint8Array>>('/audio/podcast.mp3', {
  responseType: 'stream',
});

const reader = response.data.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // value is a Uint8Array chunk
  console.log(`Received chunk of size ${value.length} bytes`);
}
```

