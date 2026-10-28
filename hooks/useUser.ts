"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getStore,
  initializeUser,
  subscribeStore,
} from "@/utils/firebase/firebaseHelpers";
import { getStoredPlayerName } from "@/utils/identity";

export function useUser() {
  const store = useSyncExternalStore(subscribeStore, getStore, getStore);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const localName = getStoredPlayerName();
    if (localName && !getStore().user.playerName) {
      getStore().user.playerName = localName;
    }
    void initializeUser().finally(() => setBooted(true));
  }, []);

  return {
    ...store.user,
    loading: store.loading,
    booted: booted || !!store.user.userFetched,
  };
}
