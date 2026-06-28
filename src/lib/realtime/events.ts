// Shared realtime contract types for the single private channel `game:{id}`.
// These are the source-of-truth payload shapes that the server RPCs broadcast
// (via realtime.send in supabase/migrations/0001_init.sql) and that downstream
// hooks/components consume. Keep these in lockstep with the SQL.

// -----------------------------------------------------------------------------
// Game state machine
// -----------------------------------------------------------------------------
export type GameState =
  | "lobby"
  | "question_open"
  | "locked"
  | "reveal"
  | "scoreboard"
  | "ended";

// -----------------------------------------------------------------------------
// Channel naming
// -----------------------------------------------------------------------------
// One private channel per game. Realtime Authorization gates it to members.
export const GAME_CHANNEL_PREFIX = "game:" as const;
export function gameChannel(gameId: string): string {
  return `${GAME_CHANNEL_PREFIX}${gameId}`;
}

// -----------------------------------------------------------------------------
// Broadcast event names (the `event` of each realtime.send call)
// -----------------------------------------------------------------------------
export const GAME_EVENTS = {
  phase: "phase",
  question: "question",
  vote: "vote",
  reveal: "reveal",
  scoreboard: "scoreboard",
  lock: "lock",
} as const;
export type GameEventName = (typeof GAME_EVENTS)[keyof typeof GAME_EVENTS];

// Tally map: choice_key -> count. Always aggregate-only (never who voted).
export type VoteCounts = Record<string, number>;

// Public choice as broadcast/snapshotted (no presentational theme, no answer).
export type PublicChoice = { key: string; label: string; image_url?: string | null };

// -----------------------------------------------------------------------------
// Broadcast payloads
// -----------------------------------------------------------------------------

// `phase` — fired on every state transition. Fields present depend on state:
// question_open includes deadline; locked/reveal/scoreboard/ended may omit it.
export type PhaseEvent = {
  state: GameState;
  position?: number;
  deadline?: string | null; // ISO timestamptz; authoritative absolute deadline
  answers_open_at?: string | null; // ISO; choices unlock / answer timer start
  server_now?: string; // ISO timestamptz for client clock-offset estimation
};

// `question` — public question payload (NEVER contains correct_key).
export type QuestionEvent = {
  position: number;
  eyebrow: string | null;
  text: string;
  choices: PublicChoice[];
  time_limit_seconds: number;
  media_url?: string | null;
};

// `vote` — live aggregate tally (debounced server-side). Aggregate-only.
export type VoteEvent = {
  counts: VoteCounts;
  total: number;
};

// `reveal` — the ONLY message that carries correct_key.
export type RevealEvent = {
  correct_key: string;
  counts: VoteCounts;
  total: number;
  correct_count: number;
  leaderboard: LeaderboardEntry[];
};

// `scoreboard` — leaderboard between questions / at game end.
export type ScoreboardEvent = {
  leaderboard: LeaderboardEntry[];
};

// `lock` — host toggled whether new players can still join (registration lock).
export type LockEvent = {
  registration_locked: boolean;
  server_now?: string; // ISO timestamptz for client clock-offset estimation
};

// Discriminated map of event name -> payload (for typed channel.on handlers).
export type GameEventPayloadMap = {
  phase: PhaseEvent;
  question: QuestionEvent;
  vote: VoteEvent;
  reveal: RevealEvent;
  scoreboard: ScoreboardEvent;
  lock: LockEvent;
};

// -----------------------------------------------------------------------------
// Roster + leaderboard shared shapes
// -----------------------------------------------------------------------------
export type RosterEntry = {
  player_id: string;
  nickname: string;
  avatar_color: string | null;
  avatar_initial: string | null;
  is_connected: boolean;
};

export type LeaderboardEntry = {
  player_id: string;
  nickname: string;
  avatar_color: string | null;
  avatar_initial: string | null;
  total_points: number;
  correct_count: number;
  streak: number;
};

// This player's own answer for the current round. Scoring fields stay null
// until the round is revealed (server enforces this in get_game_snapshot).
export type MyAnswer = {
  choice_key: string;
  is_correct: boolean | null;
  awarded_points: number | null;
};

// -----------------------------------------------------------------------------
// GameSnapshot — authoritative recovery payload from get_game_snapshot RPC
// -----------------------------------------------------------------------------
export type SnapshotQuestion = {
  position: number;
  eyebrow: string | null;
  text: string;
  choices: PublicChoice[];
  time_limit_seconds: number;
  media_url?: string | null;
};

export type GameSnapshot = {
  state: GameState;
  current_position: number;
  current_question: SnapshotQuestion | null; // null in lobby
  phase_deadline: string | null; // ISO timestamptz
  server_now: string; // ISO timestamptz; for clock-offset estimation
  registration_locked?: boolean; // host stopped new joins
  has_next?: boolean; // a next quiz is queued → after ending, can continue same game
  answers_open_at?: string | null; // ISO; choices unlock / answer timer start
  correct_key: string | null; // only set once the current round is revealed
  my_answer: MyAnswer | null;
  vote: VoteEvent | null;
  roster: RosterEntry[];
  leaderboard: LeaderboardEntry[];
};

// Result shape of submit_answer RPC.
export type SubmitAnswerResult = {
  accepted: boolean;
  choice_key: string;
  response_ms: number;
};

// Result shape of create_game RPC (returns a single-row table).
export type CreateGameResult = {
  game_id: string;
  pin: string;
  host_secret: string;
};
