export declare function extractLeafStrings(obj: unknown, pathSegments?: string[]): {
    paths: string[][];
    values: string[];
};
export declare function applyTranslations(obj: Record<string, unknown>, paths: string[][], translatedValues: string[]): Record<string, unknown>;
export declare function readJson(filePath: string): Promise<Record<string, unknown>>;
export declare function writeJson(filePath: string, obj: Record<string, unknown>): Promise<void>;
