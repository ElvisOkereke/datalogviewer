import { REPO_URL } from '@/config';
import type { LogErrorCode } from '@/data/errors';

/**
 * Pre-fills a GitHub issue with the error code and app version only. Messages can contain file
 * names and column headers, which must never leave the browser unless the user types them.
 */
export function reportUrl(code: LogErrorCode | 'render-error'): string {
  const title = code === 'render-error' ? 'The app crashed' : `Can't open a log file (${code})`;
  const body = [
    `Error code: ${code}`,
    `App version: ${__APP_VERSION__}`,
    '',
    'Which logger or software produced the file? What were you doing?',
    '',
    "(Please don't attach files that contain private data.)",
  ].join('\n');
  return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
