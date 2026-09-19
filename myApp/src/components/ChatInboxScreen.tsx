import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { colors } from "../theme/colors";
import { chatInboxStyles as styles } from "../styles/chatInboxStyles";
import type { ChatThreadSummary } from "../lib/apiTypes";
import { describeApiFailure, type ApiFailure } from "../lib/errors";
import { fetchThreads } from "../lib/chat";
import { formatTimeAgo } from "../lib/format";

type ThreadsState =
  | { status: "loading" }
  | { status: "ready"; threads: ChatThreadSummary[] }
  | { status: "error"; error: ApiFailure };

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Loading conversations…</Text>
    </View>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: ApiFailure;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name="cloud-off" size={30} color={colors.crimson} />
      </View>
      <Text style={styles.errorTitle}>Couldn't Load Messages</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <MaterialIcons name="refresh" size={16} color={colors.surface} />
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialIcons name="chat-bubble-outline" size={30} color={colors.crimson} />
      </View>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptyText}>
        Once a donor or requestor replies to a match, the conversation will appear here.
      </Text>
    </View>
  );
}

function ThreadRow({ thread }: { thread: ChatThreadSummary }) {
  const router = useRouter();
  const counterparty = thread.counterparty_name ?? "Coordinator";
  const role = thread.counterparty_role === "donor" ? "Donor" : thread.counterparty_role === "requestor" ? "Requestor" : thread.counterparty_role === "organization" ? "Organization" : "Contact";
  const context = thread.hospital_name ?? thread.area_label ?? "Location not specified";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/chat",
          params: {
            matchId: thread.match_id,
            otherParticipantName: counterparty,
            requestBloodType: thread.blood_type_needed,
            urgency: thread.urgency_level.toUpperCase(),
            hospitalName: context,
          },
        })
      }
      style={styles.threadRow}
    >
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarText}>{counterparty.slice(0, 2).toUpperCase()}</Text>
      </View>

      <View style={styles.threadBody}>
        <View style={styles.threadHeader}>
          <Text style={styles.threadName}>{counterparty}</Text>
          <Text style={styles.threadTime}>{thread.last_message_at ? formatTimeAgo(thread.last_message_at) : "just now"}</Text>
        </View>

        <Text style={styles.threadRole}>{role}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.bloodPill}>{thread.blood_type_needed}</Text>
          <Text style={styles.metaText}>{thread.urgency_level.toUpperCase()}</Text>
          <Text style={styles.metaText}>·</Text>
          <Text style={styles.metaText} numberOfLines={1}>{context}</Text>
        </View>

        <Text style={styles.preview} numberOfLines={2}>
          {thread.last_message_preview ?? "Start the conversation."}
        </Text>
      </View>

      <MaterialIcons name="chevron-right" size={18} color="#94a3b8" />
    </Pressable>
  );
}

export default function ChatInboxScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadsState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const loadThreads = useCallback(async () => {
    try {
      const nextThreads = await fetchThreads();
      setThreads({ status: "ready", threads: nextThreads });
    } catch (error) {
      setThreads({
        status: "error",
        error: describeApiFailure(error, "Something went wrong loading your messages."),
      });
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadThreads();
    } finally {
      setRefreshing(false);
    }
  }, [loadThreads]);

  const onRetry = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setThreads((current) => (current.status === "ready" ? current : { status: "loading" }));

        try {
          const nextThreads = await fetchThreads();
          if (!cancelled) {
            setThreads({ status: "ready", threads: nextThreads });
          }
        } catch (error) {
          if (!cancelled) {
            setThreads({
              status: "error",
              error: describeApiFailure(error, "Something went wrong loading your messages."),
            });
          }
        }
      }

      void load();

      return () => {
        cancelled = true;
      };
    }, [reloadToken]),
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="chevron-left" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.subtitle}>Conversations</Text>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.crimson}
              colors={[colors.crimson]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {threads.status === "loading" ? <LoadingState /> : null}
          {threads.status === "error" ? <ErrorState error={threads.error} onRetry={onRetry} /> : null}
          {threads.status === "ready" && threads.threads.length === 0 ? <EmptyState /> : null}
          {threads.status === "ready" && threads.threads.length > 0
            ? threads.threads.map((thread) => <ThreadRow key={thread.id} thread={thread} />)
            : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
