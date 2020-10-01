export class StreamVersionConflictError extends Error {
  public static SQL_ERROR_MSG_RE = /^Wrong.*Stream Version: (\d+)\)/;

  constructor(stream: string, expectedVersion: any, actualVersion: any) {
    const message = `StreamVersionConflictError - stream: ${stream} - expected version: ${expectedVersion} actual version: ${actualVersion}`;
    super(message);

    this.message = message;
    this.name = 'StreamVersionConflictError';
  }
}
