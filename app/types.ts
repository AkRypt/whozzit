import type { GameState, PlayMode } from "./constants";

export type Player = {
  userId: string;
  name: string;
  isHost?: boolean;
};

export type RoundVotes = Record<string, string>;

export type CurrentRound = {
  question: string;
  packId: string;
  startedAt: number;
  endsAt: number;
  votes: RoundVotes;
  /** Pass-and-play: whose turn to vote secretly */
  hotseatVoterId?: string | null;
};

export type Lobby = {
  lobbyCode: string;
  playMode: PlayMode;
  hostId: string;
  gameState: GameState;
  players: Player[];
  enabledPacks?: string[] | null;
  timerSeconds?: number;
  round?: number;
  currentRound?: CurrentRound | null;
  usedQuestions?: string[];
  createdAt?: unknown;
  lobbyFetched?: boolean;
};

export type UserData = {
  userId?: string;
  playerName?: string;
  playerLobbyCode?: string | null;
  userFetched?: boolean;
};
