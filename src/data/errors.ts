export type LogErrorCode =
  'empty' | 'no-numeric-columns' | 'unsupported' | 'out-of-memory' | 'internal';

export class LogParseError extends Error {
  readonly code: LogErrorCode;

  constructor(code: LogErrorCode, message: string) {
    super(message);
    this.name = 'LogParseError';
    this.code = code;
  }
}
