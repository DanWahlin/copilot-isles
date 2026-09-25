type AudioFormat = 'ogg' | 'm4a';

export interface FormatChoice {
  readonly format: AudioFormat;
  readonly extension: `.${AudioFormat}`;
  readonly mime: string;
}

export function chooseAudioFormat(
  audio: Pick<HTMLAudioElement, 'canPlayType'> | null | undefined,
): FormatChoice {
  if (audio?.canPlayType('audio/ogg; codecs="opus"')) {
    return { format: 'ogg', extension: '.ogg', mime: 'audio/ogg; codecs="opus"' };
  }
  return { format: 'm4a', extension: '.m4a', mime: 'audio/mp4; codecs="mp4a.40.2"' };
}

export function audioFileFor(
  baseName: string,
  audio: Pick<HTMLAudioElement, 'canPlayType'> | null | undefined,
): string {
  return `${baseName}${chooseAudioFormat(audio).extension}`;
}
