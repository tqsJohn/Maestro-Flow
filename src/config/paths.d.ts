export declare const paths: {
    readonly home: string;
    readonly config: string;
    readonly extensions: string;
    readonly data: string;
    readonly logs: string;
    readonly cliHistory: string;
    readonly project: (root: string) => {
        root: string;
        workflow: string;
        templates: string;
    };
    readonly ensure: (...dirs: string[]) => void;
};
