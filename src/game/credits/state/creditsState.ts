import type { Song } from '../../../data/songs.js';
import { filterChangedRegions } from '../../../changedRegions.js';
import type { StateReader } from '../../../changedRegions.js';
import { clamp } from '../../../range.js';
import {
  getButtonView,
  hoverButton,
  isButtonHovered,
  isButtonPressed,
  pressButton,
  releaseButton,
  unhoverButton,
} from '../../ui/state/buttonPointer.js';
import type { ButtonHover, ButtonView } from '../../ui/state/buttonPointer.js';
import {
  getControlsCloseView,
  isControlsButtonEnabled,
  isControlsEntryHovered,
} from '../../app/controlsGuide.js';
import type { ControlsButton } from '../../app/controlsGuide.js';
import type { ScrollBarScroll } from '../../ui/state/scrollBarScroll.js';

export interface CreditEntry {
  readonly title: string;
  readonly credit: readonly string[];
}

export interface CreditsGrid {
  readonly columnCount: number;
  readonly visibleRowCount: number;
  readonly lineCount: number;
}

export interface CreditCell {
  readonly title: string;
  readonly lines: readonly string[];
}

export type CreditsButton = 'back' | ControlsButton;

export interface CreditsState {
  readonly entries: readonly CreditEntry[];
  readonly readSongCount: number;
  readonly topRow: number;
  readonly isControlsOpen: boolean;
  readonly hover: ButtonHover<CreditsButton> | null;
}

export const INITIAL_CREDITS_STATE: CreditsState = {
  isControlsOpen: false,
  hover: null,
  entries: [],
  readSongCount: 0,
  topRow: 0,
};

export function withCreditSongs(state: CreditsState, songs: readonly Song[]): CreditsState {
  if (songs.length === state.readSongCount) {
    return state;
  }
  const newEntries = songs.slice(state.readSongCount).flatMap((song) =>
    song.credit === undefined
      ? []
      : [
          {
            title: song.title,
            credit: song.credit,
          },
        ],
  );
  return {
    ...state,
    entries: newEntries.length === 0 ? state.entries : [...state.entries, ...newEntries],
    readSongCount: songs.length,
  };
}

function getCreditRowCount(state: CreditsState, grid: CreditsGrid): number {
  return Math.ceil(state.entries.length / grid.columnCount);
}

export function scrollCredits(state: CreditsState, grid: CreditsGrid, rows: number): CreditsState {
  const maxTopRow = Math.max(0, getCreditRowCount(state, grid) - grid.visibleRowCount);
  const topRow = clamp(state.topRow + rows, 0, maxTopRow);
  if (topRow === state.topRow) {
    return state;
  }
  return {
    ...state,
    topRow,
  };
}

/** 줄 간격이 고정이라 넘치는 줄은 그리지 않고, 마지막 줄 끝에 … 를 붙여 더 있음을 알린다. */
export function getCreditCells(state: CreditsState, grid: CreditsGrid): readonly CreditCell[] {
  return Array.from({ length: grid.columnCount * grid.visibleRowCount }, (_, index) => {
    const entry = state.entries[state.topRow * grid.columnCount + index];
    const credit = entry?.credit ?? [];
    const hasHiddenLines = credit.length > grid.lineCount;
    return {
      title: entry?.title ?? '',
      lines: Array.from({ length: grid.lineCount }, (_, lineIndex) => {
        const value = credit[lineIndex] ?? '';
        return hasHiddenLines && lineIndex === grid.lineCount - 1 ? `${value}…` : value;
      }),
    };
  });
}

export function getCreditScroll(state: CreditsState, grid: CreditsGrid): ScrollBarScroll {
  const totalCount = Math.max(getCreditRowCount(state, grid), 1);
  if (totalCount <= grid.visibleRowCount) {
    return { kind: 'track' };
  }
  return {
    kind: 'thumb',
    firstIndex: state.topRow,
    visibleCount: grid.visibleRowCount,
    totalCount,
  };
}

function isCreditsButtonEnabled(state: CreditsState, button: CreditsButton): boolean {
  return button === 'back' || isControlsButtonEnabled(button, state.isControlsOpen);
}

function withHover(state: CreditsState, hover: CreditsState['hover']): CreditsState {
  return hover === state.hover
    ? state
    : {
        ...state,
        hover,
      };
}

export function hoverCreditsButton(state: CreditsState, button: CreditsButton): CreditsState {
  return withHover(state, hoverButton(state.hover, button));
}

export function unhoverCreditsButton(state: CreditsState, button: CreditsButton): CreditsState {
  return withHover(state, unhoverButton(state.hover, button));
}

export function pressCreditsButton(state: CreditsState, button: CreditsButton): CreditsState {
  return withHover(state, pressButton(state.hover, button, isCreditsButtonEnabled(state, button)));
}

export function releaseCreditsButton(state: CreditsState, button: CreditsButton): CreditsState {
  return withHover(state, releaseButton(state.hover, button));
}

export function getBackButtonView(state: CreditsState): ButtonView {
  return getButtonView(state.hover, 'back', true, false);
}

export function getCreditsControlsCloseView(state: CreditsState): ButtonView {
  return getControlsCloseView(state.hover, state.isControlsOpen);
}

export function isCreditsControlsEntryHovered(state: CreditsState): boolean {
  return isControlsEntryHovered(state.hover);
}

export type CreditsRegion =
  'cells' | 'scrollBar' | 'controls' | 'backButton' | 'controlsEntry' | 'controlsClose';

type CreditsReader = StateReader<CreditsState>;

const readEntries: CreditsReader = (state) => state.entries;
const readTopRow: CreditsReader = (state) => state.topRow;
const readControlsOpen: CreditsReader = (state) => state.isControlsOpen;
const readBackHovered: CreditsReader = (state) => isButtonHovered(state.hover, 'back');
const readBackPressed: CreditsReader = (state) => isButtonPressed(state.hover, 'back');
const readEntryHovered: CreditsReader = (state) => isButtonHovered(state.hover, 'controlsEntry');
const readCloseHovered: CreditsReader = (state) => isButtonHovered(state.hover, 'controlsClose');
const readClosePressed: CreditsReader = (state) => isButtonPressed(state.hover, 'controlsClose');

const REGION_SOURCES: Readonly<Record<CreditsRegion, readonly CreditsReader[]>> = {
  cells: [readEntries, readTopRow],
  scrollBar: [readEntries, readTopRow],
  controls: [readControlsOpen],
  backButton: [readBackHovered, readBackPressed],
  controlsEntry: [readEntryHovered],
  controlsClose: [readCloseHovered, readClosePressed, readControlsOpen],
};

export function getChangedRegions(
  previous: CreditsState | null,
  next: CreditsState,
): readonly CreditsRegion[] {
  return filterChangedRegions(REGION_SOURCES, previous, next);
}
