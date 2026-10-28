"use client";

import { useSyncExternalStore } from "react";
import { getStore, subscribeStore } from "@/utils/firebase/firebaseHelpers";

export default function useLobby() {
  const store = useSyncExternalStore(subscribeStore, getStore, getStore);
  return store.lobby;
}
