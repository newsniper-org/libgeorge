import { CardId, CityId, PlayerId } from "./ids.js";

export type PlayerCommand =
  | { kind: "request_basic_income"; by: PlayerId }
  | { kind: "build_house"; by: PlayerId; city: CityId; count: number }
  | { kind: "sell_house"; by: PlayerId; city: CityId; count: number }
  | { kind: "play_lotto"; by: PlayerId; guess: "odd" | "even" }
  | { kind: "lotto_continue"; by: PlayerId; choice: "yes" | "no" }
  | { kind: "use_card"; by: PlayerId; card: CardId }
  ;

export type EnvInput =
  | { kind: "dice"; d1: number; d2: number }
  | { kind: "lotto_result"; outcome: "odd" | "even" }
  ;
