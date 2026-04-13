/** Remaining context % at which WARNING is emitted */
export declare const WARNING_THRESHOLD = 35;
/** Remaining context % at which CRITICAL is emitted */
export declare const CRITICAL_THRESHOLD = 25;
/** Ignore bridge metrics older than this (seconds) */
export declare const STALE_SECONDS = 60;
/** Minimum tool uses between repeated warnings */
export declare const DEBOUNCE_CALLS = 5;
/** Claude Code reserves ~16.5% for autocompact buffer */
export declare const AUTO_COMPACT_BUFFER_PCT = 16.5;
/** Bridge file prefix in os.tmpdir() */
export declare const BRIDGE_PREFIX = "maestro-ctx-";
/** Delegate notification file prefix in os.tmpdir() */
export declare const NOTIFY_PREFIX = "maestro-notify-";
/** Coordinator tracker bridge file prefix in os.tmpdir() */
export declare const COORD_BRIDGE_PREFIX = "maestro-coord-";
/** Max ms to wait for stdin before exiting (Windows pipe safety) */
export declare const STDIN_TIMEOUT_MS = 3000;
/**
 * ASCII faces by severity level.
 *
 *   ^_^  — plenty of context (used < 50%)
 *   -_-  — getting used      (used 50–65%)
 *   O_O  — running low       (used 65–80%)
 *   X_X  — critical          (used >= 80%)
 */
export declare const FACES: {
    readonly happy: "^_^";
    readonly neutral: "-_-";
    readonly alert: "O_O";
    readonly critical: "X_X";
};
export type FaceLevel = keyof typeof FACES;
/** Map used% to face level */
export declare function getFaceLevel(usedPct: number): FaceLevel;
/** ANSI color codes by face level */
export declare const FACE_COLORS: Record<FaceLevel, string>;
export declare const ANSI_RESET = "\u001B[0m";
export declare const ANSI_DIM = "\u001B[2m";
export declare const ANSI_BOLD = "\u001B[1m";
export declare const ANSI_CYAN = "\u001B[36m";
