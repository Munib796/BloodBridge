import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import type { Notification } from "../lib/apiTypes";
import { describeApiFailure, type ApiFailure } from "../lib/errors";
import { fetchNotifications, markAllRead, markNotificationRead } from "../lib/notifications";
import { formatTimeAgo } from "../lib/format";
import { colors } from "../theme/colors";
import { notificationInboxStyles as styles } from "../styles/notificationInboxStyles";

type NotificationsState =
  | { status: "loading" }
  | { status: "ready"; notifications: Notification[] }
  | { status: "error"; error: ApiFailure };

function LoadingState() {
  return <View style={styles.loadingState}><ActivityIndicator color={colors.crimson} /><Text style={styles.loadingText}>Loading notifications…</Text></View>;
}

function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry: () => void }) {
  return <View style={styles.errorState}><View style={styles.errorIcon}><MaterialIcons name="cloud-off" size={30} color={colors.crimson} /></View><Text style={styles.errorTitle}>Couldn&apos;t Load Notifications</Text><Text style={styles.errorText}>{error.message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}><MaterialIcons name="refresh" size={16} color={colors.surface} /><Text style={styles.retryText}>Try Again</Text></Pressable></View>;
}

function EmptyState() {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><MaterialIcons name="notifications-none" size={30} color={colors.crimson} /></View><Text style={styles.emptyTitle}>No notifications yet</Text><Text style={styles.emptyText}>Updates about requests, matches, and messages will appear here.</Text></View>;
}

function notificationIcon(type: Notification["type"]): keyof typeof MaterialIcons.glyphMap {
  if (type === "new_chat_message") return "chat-bubble-outline";
  if (type === "new_nearby_request") return "location-on";
  if (type === "donor_cancelled" || type === "requestor_cancelled") return "cancel";
  if (type === "request_expired" || type === "donor_eat_passed") return "schedule";
  return "notifications";
}

export default function NotificationInboxScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const [notifications, setNotifications] = useState<NotificationsState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async (cancelledRef?: { current: boolean }) => {
    try {
      const next = await fetchNotifications();
      if (!cancelledRef?.current) setNotifications({ status: "ready", notifications: next });
    } catch (error) {
      if (!cancelledRef?.current) setNotifications({ status: "error", error: describeApiFailure(error, "Something went wrong loading your notifications.") });
    }
  }, []);

  useFocusEffect(useCallback(() => {
    const cancelled = { current: false };
    setNotifications((current) => current.status === "ready" ? current : { status: "loading" });
    void load(cancelled);
    return () => { cancelled.current = true; };
  }, [load, reloadToken]));

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleMarkAllRead() {
    if (notifications.status !== "ready" || !notifications.notifications.some((item) => !item.read_at)) return;
    await markAllRead();
    setNotifications({ status: "ready", notifications: notifications.notifications.map((item) => ({ ...item, read_at: new Date().toISOString() })) });
  }

  async function handlePress(item: Notification) {
    if (!item.read_at) {
      try {
        const updated = await markNotificationRead(item.id);
        setNotifications((current) => current.status === "ready" ? { status: "ready", notifications: current.notifications.map((row) => row.id === item.id ? updated : row) } : current);
      } catch {
        // Navigation remains useful even if marking read fails.
      }
    }

    if (!item.blood_request_id && item.type !== "new_chat_message") return;
    if (item.type === "new_chat_message" && item.request_match_id) {
      router.push({ pathname: "/chat", params: { matchId: item.request_match_id } });
      return;
    }
    if (!item.blood_request_id) return;
    const path = state.status === "signedIn" && state.role === "donor" ? "/request/[id]" : "/requestor/request/[id]";
    router.push({ pathname: path, params: { id: item.blood_request_id } } as never);
  }

  return <SafeAreaView style={styles.safeArea}><StatusBar style="dark" /><View style={styles.screen}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.backButton}><MaterialIcons name="chevron-left" size={22} color={colors.text} /></Pressable><View style={styles.headerText}><Text style={styles.title}>Notifications</Text><Text style={styles.subtitle}>Recent activity</Text></View><Pressable accessibilityRole="button" onPress={() => void handleMarkAllRead()} style={styles.markAllButton}><Text style={styles.markAllText}>Mark all read</Text></Pressable></View><ScrollView style={styles.content} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.crimson} colors={[colors.crimson]} />} showsVerticalScrollIndicator={false}>{notifications.status === "loading" ? <LoadingState /> : null}{notifications.status === "error" ? <ErrorState error={notifications.error} onRetry={() => setReloadToken((token) => token + 1)} /> : null}{notifications.status === "ready" && notifications.notifications.length === 0 ? <EmptyState /> : null}{notifications.status === "ready" ? notifications.notifications.map((item) => { const unread = !item.read_at; return <Pressable key={item.id} accessibilityRole="button" onPress={() => void handlePress(item)} style={[styles.row, unread && styles.unreadRow]}><View style={[styles.iconWrap, unread && styles.unreadIconWrap]}><MaterialIcons name={notificationIcon(item.type)} size={20} color={unread ? colors.crimson : colors.mutedText} /></View><View style={styles.rowBody}><View style={styles.rowHeader}><Text style={[styles.rowTitle, unread && styles.unreadTitle]}>{item.title}</Text><Text style={styles.rowTime}>{formatTimeAgo(item.created_at)}</Text></View><Text style={[styles.rowBodyText, unread && styles.unreadBody]}>{item.body}</Text></View>{unread ? <View style={styles.unreadDot} /> : null}</Pressable>; }) : null}</ScrollView></View></SafeAreaView>;
}
