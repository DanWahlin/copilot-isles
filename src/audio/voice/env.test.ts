import { describe, expect, it } from 'vitest';
import { parseKeyValueEnv, redactSecretValues } from './env';

describe('voice env parser', () => {
  it('parses KEY=VALUE lines without dotenv', () => {
    const parsed = parseKeyValueEnv('AZURE_SPEECH_KEY=abc\n# comment\nAZURE_SPEECH_REGION="westus"\n');
    expect(parsed.values.get('AZURE_SPEECH_KEY')).toBe('abc');
    expect(parsed.values.get('AZURE_SPEECH_REGION')).toBe('westus');
  });

  it('throws missing-variable errors with names but no values', () => {
    expect(() => parseKeyValueEnv('AZURE_SPEECH_KEY=super-secret\n', ['AZURE_SPEECH_REGION'])).toThrow(
      /AZURE_SPEECH_REGION/,
    );
    try {
      parseKeyValueEnv('AZURE_SPEECH_KEY=super-secret\n', ['AZURE_SPEECH_REGION']);
    } catch (error) {
      expect(String(error)).not.toContain('super-secret');
    }
  });

  it('redacts known secret values from messages', () => {
    expect(redactSecretValues('bad key super-secret in request', ['super-secret'])).toBe(
      'bad key [redacted] in request',
    );
  });
});
