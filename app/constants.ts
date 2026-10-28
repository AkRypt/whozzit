export const constants = {
  siteUrl: "https://whozzit.vercel.app",
  lobbyCodeLength: 5,
  defaultTimerSeconds: 30,
  minTimerSeconds: 10,
  maxTimerSeconds: 120,
  minPlayers: 3,
  maxPlayers: 16,
};

export const WZ = {
  userId: "whozzit_userId",
  playerName: "whozzit_playerName",
  lobbyCode: "whozzit_lobbyCode",
};

export const GAME_STATE = {
  LOBBY: "lobby",
  VOTING: "voting",
  RESULTS: "results",
  FINISHED: "finished",
} as const;

export type GameState = (typeof GAME_STATE)[keyof typeof GAME_STATE];

export const PLAY_MODE = {
  ONLINE: "online",
  HOTSEAT: "hotseat",
} as const;

export type PlayMode = (typeof PLAY_MODE)[keyof typeof PLAY_MODE];

/** Namespaced for shared Firebase project (akxh-games). */
export const WZ_TABLES = {
  USERS: "whozzit_users",
  LOBBIES: "whozzit_lobbies",
  WORDS: "whozzit_words",
  PACKS: "whozzit_packs",
} as const;

export const PACK_META: Record<
  string,
  { label: string; blurb: string; nsfw?: boolean }
> = {
  spicy: { label: "Spicy", blurb: "Flirty teases" },
  romantic: { label: "Romantic", blurb: "Soft dating energy" },
  adult_18: { label: "Adult 18+", blurb: "Explicit NSFW", nsfw: true },
  philosophy: { label: "Philosophy", blurb: "Deep / weird" },
  parenthood: { label: "Parenthood", blurb: "Kids & family futures" },
  finance: { label: "Finance", blurb: "Money habits" },
  chaotic: { label: "Chaotic", blurb: "Party chaos" },
  soft_roast: { label: "Soft Roast", blurb: "Light insult comedy" },
};
