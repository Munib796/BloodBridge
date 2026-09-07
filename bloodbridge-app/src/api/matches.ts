import { apiClient } from "@/api/client";
import type { RequestMatch } from "@/api/types";

export async function acceptRequest(
  requestId: string,
  unitsCommitted: number,
  eta: string
): Promise<RequestMatch> {
  const { data } = await apiClient.post<RequestMatch>(`/request-matches/${requestId}/accept`, {
    units_committed: unitsCommitted,
    eta,
  });
  return data;
}

export async function fetchMyMatches(): Promise<RequestMatch[]> {
  const { data } = await apiClient.get<RequestMatch[]>("/request-matches/mine");
  return data;
}

export async function updateMatchEta(matchId: string, eta: string): Promise<RequestMatch> {
  const { data } = await apiClient.patch<RequestMatch>(`/request-matches/${matchId}/eta`, { eta });
  return data;
}

export async function cancelMatch(matchId: string, reason?: string): Promise<RequestMatch> {
  const { data } = await apiClient.patch<RequestMatch>(`/request-matches/${matchId}/cancel`, {
    reason,
  });
  return data;
}

export async function completeMatch(matchId: string): Promise<RequestMatch> {
  const { data } = await apiClient.patch<RequestMatch>(`/request-matches/${matchId}/complete`);
  return data;
}
