export declare function extractLeafStrings(obj: unknown, path?: string[]): {
    paths: string[][];
    values: string[];
};
export declare function setAtPath(obj: Record<string, unknown>, path: string[], value: unknown): void;
export declare function applyTranslations(obj: Record<string, unknown>, paths: string[][], translatedValues: string[]): Record<string, unknown>;
