import { LAPTOP_SCREEN, TABLET_SCREEN } from './components/Devices';

/** Where the devices sit, shared by the scenes that cut between them. */

export interface Box {
  left: number;
  top: number;
  width: number;
}

export const LAPTOP_CENTER: Box = { left: 370, top: 225, width: 1180 };
export const LAPTOP_SIDE: Box = { left: 100, top: 300, width: 1000 };
export const TABLET_SIDE: Box = { left: 1150, top: 390, width: 700 };

/** The screen's origin in the frame, and its scale from CSS pixels. */
export const laptopScreen = (b: Box) => {
  const bezel = Math.round(b.width * 0.018);
  return { x: b.left + bezel, y: b.top + bezel, s: (b.width - bezel * 2) / LAPTOP_SCREEN[0] };
};

export const tabletScreen = (b: Box) => {
  const bezel = Math.round(b.width * 0.032);
  return { x: b.left + bezel, y: b.top + bezel, s: (b.width - bezel * 2) / TABLET_SCREEN[0] };
};

/** The laptop follows the tablet: same centre, zoomed so the tablet's whole view fits. */
export const FOLLOW_CAM = (() => {
  const z = Math.min(LAPTOP_SCREEN[0] / TABLET_SCREEN[0], LAPTOP_SCREEN[1] / TABLET_SCREEN[1]);
  return { x: (LAPTOP_SCREEN[0] - TABLET_SCREEN[0] * z) / 2, y: (LAPTOP_SCREEN[1] - TABLET_SCREEN[1] * z) / 2, z };
})();
