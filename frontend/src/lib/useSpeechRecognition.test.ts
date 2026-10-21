import { describe, expect, it } from 'vitest';
import { speechSupported, tidyTranscript } from './useSpeechRecognition';

describe('voice transcript tidying', () => {
  it('turns spoken punctuation into symbols and capitalises', () => {
    expect(tidyTranscript('hi elena comma your refund is approved full stop')).toBe('Hi elena, your refund is approved.');
    expect(tidyTranscript('can you confirm the order number question mark')).toBe('Can you confirm the order number?');
  });

  it('leaves ordinary speech alone', () => {
    expect(tidyTranscript('  thanks for waiting ')).toBe('Thanks for waiting');
  });

  it('reports no support outside a browser', () => {
    expect(speechSupported()).toBe(false);
  });
});
