"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LinkoraClient } from "../../../../packages/sdk/src/client";

const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID || "CDUMMY";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org";

interface TransferEventDetail {
  tokenAddress: string;
  balance?: string | number;
  amount?: string | number;
  recipient?: string;
}

export interface CreatorTokenState {
  token: string | null;
  balance: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  mint: (...args: unknown[]) => Promise<never>;
}

/** Loads a wallet's linked creator token and listens for app-level token transfers. */
export function useCreatorToken(address: string | null): CreatorTokenState {
  const clientRef = useRef<LinkoraClient | null>(null);
  const requestRef = useRef(0);
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  if (!clientRef.current) clientRef.current = new LinkoraClient({ contractId, rpcUrl });

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!address) {
      setToken(null);
      setBalance(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const profile = await clientRef.current!.getProfile(address);
      if (requestId === requestRef.current) {
        const nextToken = profile?.creator_token || null;
        setToken(nextToken);
      }
    } catch (cause) {
      if (requestId === requestRef.current) {
        setError(cause instanceof Error ? cause : new Error("Failed to load creator token."));
        setToken(null);
        setBalance(null);
      }
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
    return () => {
      requestRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    setBalance(null);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const onTransfer = (event: Event) => {
      const detail = (event as CustomEvent<TransferEventDetail>).detail;
      if (!detail || detail.tokenAddress !== token) return;
      if (detail.balance !== undefined) {
        setBalance(String(detail.balance));
      } else if (detail.recipient === address && detail.amount !== undefined) {
        setBalance((current) => String(Number(current ?? 0) + Number(detail.amount)));
      }
    };
    window.addEventListener("linkora:creator-token-transfer", onTransfer);
    return () => window.removeEventListener("linkora:creator-token-transfer", onTransfer);
  }, [address, token]);

  const mint = useCallback(async (): Promise<never> => {
    throw new Error("Creator token minting is not implemented yet.");
  }, []);

  return { token, balance, isLoading, error, refresh, mint };
}
