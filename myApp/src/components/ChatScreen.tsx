import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useAuth } from "../context/AuthContext";
import type { ChatMessage } from "../lib/apiTypes";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  buildChatSocketUrl,
  currentChatToken,
  describeChatLoadError,
  describeChatSendError,
  fetchMessages,
  isChatSocketErrorFrame,
  sendMessageRest,
} from "../lib/chat";
import type { ApiFailure } from "../lib/errors";
import { colors } from "../theme/colors";
import { chatStyles as styles } from "../styles/chatStyles";

/** A message this screen sent but hasn't had confirmed yet — either it's in
 *  flight (over the socket or REST) or the send failed and is waiting for a
 *  tap to retry. Rendered inline with real messages, oldest-sent first. */
type PendingMessage = {
  tempId: string;
  content: string;
  createdAt: string;
  status: "sending" | "failed";
};

type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

/** Reconnect backoff: quick at first (a dropped wifi packet), levelling off
 *  so a genuinely down backend doesn't get hammered. */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

function singleParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function formatMessageTime(sentAt: string) {
  return new Date(sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Loading conversation…</Text>
    </View>
  );
}

function ErrorState({
  error,
  onRetry,
  onBack,
}: {
  error: ApiFailure;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name="cloud-off" size={30} color={colors.crimson} />
      </View>
      <Text style={styles.errorTitle}>Couldn't Load This Conversation</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      <View style={styles.errorActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.slateSoft }, pressed && styles.pressed]}
        >
          <MaterialIcons name="arrow-back" size={16} color={colors.text} />
          <Text style={[styles.retryText, { color: colors.text }]}>Back</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <MaterialIcons name="refresh" size={16} color={colors.surface} />
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const params = useLocalSearchParams<{
    matchId?: string | string[];
    otherParticipantName?: string | string[];
    requestBloodType?: string | string[];
    urgency?: string | string[];
    hospitalName?: string | string[];
  }>();

  const matchId = singleParam(params.matchId);
  const otherParticipantName = singleParam(params.otherParticipantName) ?? "Coordinator";
  const requestBloodType = singleParam(params.requestBloodType) ?? "—";
  const urgency = singleParam(params.urgency) ?? "Routine";
  const hospitalName = singleParam(params.hospitalName) ?? "Not hospital-backed";

  const myId = state.status === "signedIn" ? state.profile.id : null;

  const scrollViewRef = useRef<ScrollView>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const mounted = useRef(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draftText, setDraftText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiFailure | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const urgencyStyle =
    urgency.toLowerCase() === "critical"
      ? styles.contextValueCritical
      : urgency.toLowerCase() === "urgent"
        ? styles.contextValueUrgent
        : styles.contextValue;

  const scrollToEnd = useCallback((animated: boolean) => {
    requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({ animated }));
  }, []);

  // --- History ---------------------------------------------------------

  const loadHistory = useCallback(async (): Promise<boolean> => {
    if (!matchId) return false;
    setLoading(true);
    setLoadError(null);
    try {
      const history = await fetchMessages(matchId);
      if (!mounted.current) return false;
      setMessages(history);
      scrollToEnd(false);
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      setLoadError(describeChatLoadError(error));
      return false;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [matchId, scrollToEnd]);

  // --- Reconciling a message that arrived back over the socket ---------
  // A message this screen sent shows up again through the same broadcast
  // every other participant gets — the socket doesn't echo it back any
  // differently. So "sending" pending items are resolved here rather than
  // from the send call itself: the first pending item with matching content
  // is the one that just landed, oldest first, since sends complete in order
  // on one socket.
  const resolvePendingFor = useCallback((incoming: ChatMessage) => {
    if (incoming.sender_id !== myId) return false;
    let resolved = false;
    setPending((current) => {
      const index = current.findIndex(
        (item) => item.status === "sending" && item.content === incoming.content,
      );
      if (index === -1) return current;
      resolved = true;
      return current.filter((_, i) => i !== index);
    });
    return resolved;
  }, [myId]);

  const appendMessage = useCallback((incoming: ChatMessage) => {
    setMessages((current) => {
      if (current.some((message) => message.id === incoming.id)) return current;
      return [...current, incoming];
    });
    scrollToEnd(true);
  }, [scrollToEnd]);

  // --- Socket lifecycle --------------------------------------------------

  const connectSocket = useCallback(() => {
    if (!matchId) return;
    const token = currentChatToken();
    if (!token) {
      setConnectionState("offline");
      return;
    }

    setConnectionState((prev) => (prev === "connected" ? prev : reconnectAttempt.current > 0 ? "reconnecting" : "connecting"));

    const socket = new WebSocket(buildChatSocketUrl(matchId, token));
    socketRef.current = socket;

    socket.onopen = () => {
      if (!mounted.current) return;
      reconnectAttempt.current = 0;
      setConnectionState("connected");
    };

    socket.onmessage = (event) => {
      if (!mounted.current) return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (isChatSocketErrorFrame(payload)) {
        // The flood guard or a rejected send. Not fatal to the connection —
        // just tell the sender their last message didn't land.
        setSendError(payload.error);
        return;
      }
      const incoming = payload as ChatMessage;
      if (!resolvePendingFor(incoming)) {
        appendMessage(incoming);
        return;
      }
      appendMessage(incoming);
    };

    socket.onclose = (event) => {
      socketRef.current = null;
      if (!mounted.current) return;

      // 4401: the token was rejected — a fresh connect will fail the same
      // way, so this is a dead end rather than something to retry into.
      if (event.code === 4401) {
        setConnectionState("offline");
        return;
      }

      setConnectionState("reconnecting");
      const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS_MS.length - 1)];
      reconnectAttempt.current += 1;
      reconnectTimer.current = setTimeout(() => {
        if (mounted.current) connectSocket();
      }, delay);
    };

    socket.onerror = () => {
      // onclose always follows onerror for a WebSocket, so reconnection is
      // scheduled there — this only exists so a rejected connection doesn't
      // surface as an unhandled promise rejection in the RN console.
    };
  }, [appendMessage, matchId, resolvePendingFor]);

  useEffect(() => {
    mounted.current = true;
    reconnectAttempt.current = 0;
    setMessages([]);
    setPending([]);
    setSendError(null);

    void loadHistory().then((ok) => {
      if (ok && mounted.current) connectSocket();
    });

    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close(1000, "screen closed");
      socketRef.current = null;
    };
    // Reconnecting is intentionally tied only to matchId — loadHistory and
    // connectSocket are stable per matchId via their own useCallback deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // --- Sending -------------------------------------------------------------

  const sendPending = useCallback(async (item: PendingMessage) => {
    if (!matchId) return;
    const socket = socketRef.current;

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ content: item.content }));
        // Left as "sending": resolved when the broadcast echo arrives via
        // resolvePendingFor. If the socket drops before that happens, onclose
        // does not touch pending items — they simply stay "sending" until the
        // next reconnect, which is when a lost send would in fact be lost, so
        // marking it failed here would be premature.
        return;
      } catch {
        // Fall through to REST.
      }
    }

    try {
      const saved = await sendMessageRest(matchId, item.content);
      if (!mounted.current) return;
      setPending((current) => current.filter((p) => p.tempId !== item.tempId));
      appendMessage(saved);
    } catch (error) {
      if (!mounted.current) return;
      setSendError(describeChatSendError(error));
      setPending((current) =>
        current.map((p) => (p.tempId === item.tempId ? { ...p, status: "failed" } : p)),
      );
    }
  }, [appendMessage, matchId]);

  function handleSendMessage() {
    const trimmed = draftText.trim();
    if (!trimmed || !matchId) return;

    const item: PendingMessage = {
      tempId: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      content: trimmed,
      createdAt: new Date().toISOString(),
      status: "sending",
    };

    setPending((current) => [...current, item]);
    setDraftText("");
    setSendError(null);
    scrollToEnd(true);
    void sendPending(item);
  }

  function handleRetry(item: PendingMessage) {
    setPending((current) =>
      current.map((p) => (p.tempId === item.tempId ? { ...p, status: "sending" } : p)),
    );
    void sendPending({ ...item, status: "sending" });
  }

  // --- Render --------------------------------------------------------------

  const timeline = useMemo(
    () => [
      ...messages.map((message) => ({ kind: "sent" as const, message })),
      ...pending.map((item) => ({ kind: "pending" as const, item })),
    ],
    [messages, pending],
  );

  if (!matchId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState
          error={{ kind: "client", message: "This conversation could not be found." }}
          onRetry={() => router.back()}
          onBack={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 92 : 0}
      >
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <MaterialIcons name="chevron-left" size={22} color={colors.text} />
            </Pressable>

            <View style={styles.headerText}>
              <Text style={styles.title}>{otherParticipantName}</Text>
              <Text style={styles.subtitle}>Emergency match chat</Text>
            </View>
          </View>

          {connectionState === "reconnecting" ? (
            <View style={styles.reconnectBanner}>
              <MaterialIcons name="sync" size={14} color={colors.amberText} />
              <Text style={styles.reconnectText}>Reconnecting...</Text>
            </View>
          ) : connectionState === "offline" ? (
            <View style={styles.reconnectBanner}>
              <MaterialIcons name="wifi-off" size={14} color={colors.amberText} />
              <Text style={styles.reconnectText}>Not connected — messages will send when you're back online.</Text>
            </View>
          ) : null}

          <View style={styles.contextStrip}>
            <View style={styles.contextPill}>
              <Text style={styles.contextLabel}>Blood</Text>
              <Text style={styles.contextValue}>{requestBloodType}</Text>
            </View>

            <View style={styles.contextPill}>
              <Text style={styles.contextLabel}>Urgency</Text>
              <Text style={[styles.contextValue, urgencyStyle]}>{urgency}</Text>
            </View>

            <View style={styles.contextPillWide}>
              <Text style={styles.contextLabel}>Hospital</Text>
              <Text style={styles.contextValue}>{hospitalName}</Text>
            </View>
          </View>

          {loading ? (
            <LoadingState />
          ) : loadError ? (
            <ErrorState
              error={loadError}
              onRetry={() => {
                void loadHistory().then((ok) => {
                  if (ok && mounted.current) connectSocket();
                });
              }}
              onBack={() => router.back()}
            />
          ) : timeline.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="chat-bubble-outline" size={28} color={colors.crimson} />
              </View>
              <Text style={styles.emptyTitle}>Start the conversation...</Text>
              <Text style={styles.emptyText}>Share travel timing, hospital updates, or any urgent details here.</Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={styles.content}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
            >
              {timeline.map((row) => {
                if (row.kind === "sent") {
                  const message = row.message;
                  const isSentMessage = message.sender_id === myId;

                  return (
                    <View
                      key={message.id}
                      style={[styles.messageRow, isSentMessage ? styles.sentRow : styles.receivedRow]}
                    >
                      {!isSentMessage ? (
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{getInitials(otherParticipantName)}</Text>
                        </View>
                      ) : null}

                      <View style={[styles.bubble, isSentMessage ? styles.sentBubble : styles.receivedBubble]}>
                        <Text style={[styles.messageText, isSentMessage && styles.sentText]}>
                          {message.content}
                        </Text>
                        <Text style={[styles.time, isSentMessage && styles.sentTime]}>
                          {formatMessageTime(message.sent_at)}
                        </Text>
                      </View>
                    </View>
                  );
                }

                const item = row.item;
                const failed = item.status === "failed";

                return (
                  <View key={item.tempId} style={[styles.messageRow, styles.sentRow]}>
                    <Pressable
                      disabled={!failed}
                      onPress={() => handleRetry(item)}
                      style={[
                        styles.bubble,
                        styles.sentBubble,
                        failed ? styles.bubbleFailed : styles.bubblePending,
                      ]}
                    >
                      <Text style={[styles.messageText, styles.sentText]}>{item.content}</Text>
                      <Text style={[styles.time, styles.sentTime]}>
                        {failed ? "Tap to retry" : "Sending…"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {sendError ? (
            <View style={styles.sendErrorBanner}>
              <MaterialIcons name="error-outline" size={13} color={colors.crimson} />
              <Text style={styles.sendErrorText}>{sendError}</Text>
              <Pressable onPress={() => setSendError(null)}>
                <MaterialIcons name="close" size={14} color={colors.crimson} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <View style={styles.inputShell}>
              <TextInput
                value={draftText}
                onChangeText={(nextText) => setDraftText(nextText.slice(0, MAX_CHAT_MESSAGE_LENGTH))}
                placeholder="Type a message"
                placeholderTextColor={colors.mutedText}
                multiline
                maxLength={MAX_CHAT_MESSAGE_LENGTH}
                style={styles.input}
              />
            </View>

            <Pressable
              onPress={handleSendMessage}
              disabled={!draftText.trim()}
              style={[styles.sendButton, !draftText.trim() && styles.sendButtonDisabled]}
            >
              <MaterialIcons name="send" size={18} color={draftText.trim() ? colors.surface : "#94a3b8"} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
