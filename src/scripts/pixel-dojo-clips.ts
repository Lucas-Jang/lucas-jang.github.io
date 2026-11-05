import { previousClips } from "./pixel-dojo-library";
import { coreClips } from "./pixel-dojo-core";
export { standing, shift, sampleClip, type Clip, type Pair } from "./pixel-dojo-library";
export const clips = [...previousClips, ...coreClips];
