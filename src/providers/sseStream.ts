/**
 * Server-Sent Events (SSE) line buffer and parser for OpenAI-compatible streaming
 */

export async function processSseStream(
  response: Response,
  onChunk: (chunk: string, accumulated: string) => void,
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

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) {
          continue; // SSE comment or empty line
        }

        if (trimmed.startsWith('data:')) {
          const dataContent = trimmed.slice(5).trim();
          if (dataContent === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(dataContent);
            // Support OpenAI style: choices[0].delta.content or choices[0].text
            const delta =
              parsed.choices?.[0]?.delta?.content ||
              parsed.choices?.[0]?.text ||
              '';
            if (delta) {
              accumulated += delta;
              onChunk(delta, accumulated);
            }
          } catch {
            // Some providers might send non-JSON data lines
          }
        }
      }
    }

    // Flush any remaining buffer if needed
    if (buffer.trim().startsWith('data:')) {
      const dataContent = buffer.trim().slice(5).trim();
      if (dataContent !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataContent);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            onChunk(delta, accumulated);
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}
