import type { YouTubePlayerState } from './YouTubePlayer.js';
import { msToSec } from '../time.js';

type Clock =
  | { readonly kind: 'stopped'; readonly sec: number }
  | { readonly kind: 'flowing'; readonly fromAtMs: number; readonly fromSec: number };

// 시작 직후 YouTube 보고 위치는 추정값이라 뒤로 보정되곤 한다. 그 값으로 다시 맞추면 노트가 버벅이므로,
// 요청한 위치에서 재생 상태에 따라 벽시계로만 흐른다.
export class YouTubeTimeSource {
  private readonly now: () => number;
  private clock: Clock = {
    kind: 'stopped',
    sec: 0,
  };

  constructor(now: () => number) {
    this.now = now;
  }

  get currentTime(): number {
    return this.clock.kind === 'flowing'
      ? this.clock.fromSec + msToSec(this.now() - this.clock.fromAtMs)
      : this.clock.sec;
  }

  hold(sec: number): void {
    this.clock = {
      kind: 'stopped',
      sec,
    };
  }

  // 끝난 뒤엔 판정 마감을 위해 혼자 흐른다.
  handleStateChange(state: YouTubePlayerState): void {
    switch (state) {
      case 'playing':
        if (this.clock.kind === 'stopped') {
          this.clock = {
            kind: 'flowing',
            fromAtMs: this.now(),
            fromSec: this.clock.sec,
          };
        }
        return;
      case 'ended':
        return;
      default:
        this.hold(this.currentTime);
        return;
    }
  }
}
