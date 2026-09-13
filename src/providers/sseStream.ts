/**
 * Server-Sent Events (SSE) line buffer and parser for OpenAI-compatible streaming
 */

type SseChunkHandler = (chunk: string, accumulated: string) => void;

/**
 * Parses an already-read SSE response body.
 *
 * This is also used for responses that arrive with the wrong content type, so
 * it deliberately does not depend on a Response or a stream reader.
 */
export function processSseText(text: string, onChunk: SseChunkHandler): string {
  let accumulated = '';

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) {
      continue; // SSE comment or empty line
    }

    if (!trimmed.startsWith('data:')) {
      continue;
    }

    const dataContent = trimmed.slice(5).trim();
    if (dataContent === '[DONE]') {
      continue;
    }

    try {
      const parsed = JSON.parse(dataContent);
      // Support OpenAI style: choices[0].delta.content or choices[0].text
      const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
      if (delta) {
        accumulated += delta;
        onChunk(delta, accumulated);
      }
    } catch {
      // Some providers might send non-JSON data lines
    }
  }

  return accumulated;
}

export async function processSseStream(
  response: Response,
  onChunk: SseChunkHandler,
  signal?: AbortSignal
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('レスポンスボディをストリームとして読み取れませんでした');
  }

  const decoder = new TextDecoder('utf-8');
  let accumulated = '';
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('Aborted by user', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep the last uncompleted line in buffer

      if (lines.length > 0) {
        const parsedText = processSseText(lines.join('\n'), (chunk, parsedAccumulated) => {
          onChunk(chunk, accumulated + parsedAccumulated);
        });
        accumulated += parsedText;
      }
    }

    // Flush any remaining buffer if needed
    if (buffer) {
      const parsedText = processSseText(buffer, (chunk, parsedAccumulated) => {
        onChunk(chunk, accumulated + parsedAccumulated);
      });
      accumulated += parsedText;
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}
