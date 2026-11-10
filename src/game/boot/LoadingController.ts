import { MOTION } from '../ui/state/motion.js';
import {
  INITIAL_LOADING_STATE,
  leaveLoading,
  removeLoading,
  withBootStage,
  withSceneLoad,
} from './state/loadingProgress.js';
import type { BootStage, LoadingState } from './state/loadingProgress.js';

export interface LoadingScreen {
  render(previous: LoadingState | null, next: LoadingState): void;
}

export interface LoadingPorts {
  wait(delayMs: number): Promise<void>;
}

export class LoadingController {
  private state: LoadingState = INITIAL_LOADING_STATE;

  constructor(
    private readonly ports: LoadingPorts,
    private readonly screen: LoadingScreen,
  ) {
    this.screen.render(null, INITIAL_LOADING_STATE);
  }

  completeStage(stage: BootStage): void {
    this.apply((state) => withBootStage(state, stage));
  }

  sceneLoadProgress(loaderFraction: number): void {
    this.apply((state) => withSceneLoad(state, loaderFraction));
  }

  firstDraw(): void {
    this.apply(leaveLoading);
    void this.ports.wait(MOTION.mediumMs).then(() => this.remove());
  }

  remove(): void {
    this.apply(removeLoading);
  }

  private apply(transition: (state: LoadingState) => LoadingState): void {
    const previous = this.state;
    const next = transition(previous);
    if (next === previous) {
      return;
    }
    this.state = next;
    this.screen.render(previous, next);
  }
}
