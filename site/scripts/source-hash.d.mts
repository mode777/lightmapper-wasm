export const SHARED_FILES: string[];
export function sourceFilesFor(id: string): string[];
export function sourceHash(id: string): string;
export function readPreviewVersion(): number;
export function readScenarioIds(): string[];
export function readThumbnailSettings(): { width: number; height: number; dpr: number; quality: number };
