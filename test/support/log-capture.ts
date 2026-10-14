import type { DestinationStream } from 'pino';

export interface LogCapture {
  stream: DestinationStream;
  lines(): Record<string, unknown>[];
}

export function createLogCapture(): LogCapture {
  const buffer: string[] = [];

  const stream: DestinationStream = {
    write(chunk: string) {
      buffer.push(chunk);
    },
  };

  return {
    stream,
    lines(): Record<string, unknown>[] {
      return buffer
        .join('')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}
