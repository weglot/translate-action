export interface TranslateOptions {
    apiKey: string;
    lFrom: string;
    lTo: string;
    requestUrl: string;
    strings: string[];
    version: string;
}
export declare function translateStrings(opts: TranslateOptions): Promise<string[]>;
