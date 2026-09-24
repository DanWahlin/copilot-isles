import { beatDuration, quantizeBeat, secondsToBeat } from './theory';

export interface AudioClock {
  readonly currentTime: number;
}

export interface ScheduledEvent {
  readonly beat: number;
  readonly time: number;
  readonly id: string;
  readonly callback: (time: number, beat: number) => void;
}

export class LookAheadScheduler {
  private readonly events: ScheduledEvent[] = [];
  private lastBeat = 0;

  constructor(
    private readonly clock: AudioClock,
    private readonly bpm: number,
    private readonly lookAheadSeconds = 0.14,
  ) {}

  get beat(): number {
    return secondsToBeat(this.clock.currentTime, this.bpm);
  }

  get nextBeat(): number {
    return this.lastBeat;
  }

  setNextBeat(beat: number): void {
    this.lastBeat = Math.max(this.lastBeat, beat);
  }

  schedule(id: string, beat: number, callback: (time: number, beat: number) => void): void {
    const time = beat * beatDuration(this.bpm);
    this.events.push({ id, beat, time, callback });
    this.events.sort((a, b) => a.time - b.time);
  }

  scheduleQuantized(id: string, callback: (time: number, beat: number) => void, grid = 1): ScheduledEvent {
    const beat = quantizeBeat(this.beat + 0.001, grid);
    const event = { id, beat, time: beat * beatDuration(this.bpm), callback };
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
    return event;
  }

  update(): number {
    const horizon = this.clock.currentTime + this.lookAheadSeconds;
    let fired = 0;
    while (this.events.length > 0 && this.events[0].time <= horizon) {
      const event = this.events.shift();
      if (!event) break;
      event.callback(event.time, event.beat);
      this.lastBeat = Math.max(this.lastBeat, event.beat);
      fired++;
    }
    return fired;
  }
}
