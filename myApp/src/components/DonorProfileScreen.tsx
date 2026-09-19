import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, type RelativePathString } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ChangePasswordModal from "./ChangePasswordModal";
import DeleteAccountModal from "./DeleteAccountModal";
import EditLocationModal, { type ProfileLocation } from "./EditLocationModal";
import EditNameModal from "./EditNameModal";
import EditPhoneModal from "./EditPhoneModal";
import ProfilePictureActionModal from "./ProfilePictureActionModal";
import { useAuth } from "../context/AuthContext";
import { fieldErrorsFrom } from "../lib/apiClient";
import { availabilityErrorMessage, setDonorAvailability } from "../lib/donors";
import { describeWriteError } from "../lib/errors";
import { formatDate } from "../lib/format";
import { formatPakistaniPhone } from "../lib/phone";
import {
  initialsFrom,
  deleteAccount,
  removeProfilePicture,
  sendPasswordResetLink,
  updateDonorLocation,
  updateFullName,
  updatePhone,
  uploadProfilePicture,
} from "../lib/profile";
import { pickProfilePhoto } from "../utils/photoPicker";
import { colors } from "../theme/colors";
import { donorProfileStyles as styles } from "../styles/donorProfileStyles";

type ProfileField = { icon: "mail" | "call" | "location-on"; label: string; value: string; editable: boolean };

/**
 * One editor's in-flight and failure state.
 *
 * The three editors share a single slot because only one modal is open at a
 * time, so their field errors and messages cannot collide — three sets of the
 * same three atoms would be state that is never simultaneously occupied.
 */
type EditState = {
  isSaving: boolean;
  fieldErrors: Record<string, string>;
  message: string | null;
};

const NO_EDIT: EditState = { isSaving: false, fieldErrors: {}, message: null };

function AccountRow({ field, onPress, value }: { field: ProfileField; onPress: () => void; value?: string }) {
  return (
    <Pressable onPress={field.editable ? onPress : undefined} style={styles.row}>
      <View style={styles.rowIcon}><MaterialIcons name={field.icon} size={20} color={colors.text} /></View>
      <View style={styles.rowCopy}><Text style={styles.rowLabel}>{field.label}</Text><Text numberOfLines={1} style={styles.rowValue}>{value ?? field.value}</Text></View>
      {field.editable && <View style={styles.rowAction}><Text style={styles.editText}>Edit</Text><MaterialIcons name="chevron-right" size={20} color={colors.mutedText} /></View>}
    </Pressable>
  );
}

export default function DonorProfileScreen() {
  const router = useRouter();
  const { state, applyProfile, logout } = useAuth();
  const [pulse] = useState(() => new Animated.Value(0));

  const [isEditNameVisible, setIsEditNameVisible] = useState(false);
  const [isEditPhoneVisible, setIsEditPhoneVisible] = useState(false);
  const [isEditLocationVisible, setIsEditLocationVisible] = useState(false);
  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [isPhotoActionsVisible, setIsPhotoActionsVisible] = useState(false);
  const [isDeleteAccountVisible, setIsDeleteAccountVisible] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const [edit, setEdit] = useState<EditState>(NO_EDIT);

  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const profile = state.status === "signedIn" && state.role === "donor" ? state.profile : null;

  const fullName = profile?.full_name ?? "—";
  const phone = profile?.phone ? formatPakistaniPhone(profile.phone) : "—";
  const email = profile?.email ?? "";
  const available = profile?.is_available ?? false;

  const accountFields: ProfileField[] = [
    { icon: "mail", label: "Email Address", value: email || "—", editable: false },
    { icon: "call", label: "Phone Number", value: phone, editable: true },
    {
      icon: "location-on",
      label: "Location & Area",
      // DonorOut carries the label but never the coordinates, so this is all
      // the app can show — see EditLocationModal for what that means in practice.
      value: profile?.area_label ?? "Not set",
      editable: true,
    },
  ];

  /**
   * Run one profile edit against the backend.
   *
   * The modal closes only if the write succeeded: a 422 keeps the sheet open
   * with the offending field marked, and anything else keeps it open with the
   * backend's message, so nothing is discarded before it has been saved.
   */
  async function runEdit(action: () => Promise<void>, fallbackMessage: string) {
    if (edit.isSaving) return;

    setEdit({ isSaving: true, fieldErrors: {}, message: null });

    try {
      await action();
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error);
      setEdit({
        isSaving: false,
        fieldErrors,
        // A 422 renders against the field that caused it, so the general slot
        // stays empty rather than printing the same sentence twice.
        message: Object.keys(fieldErrors).length
          ? null
          : describeWriteError(error, fallbackMessage),
      });
      return;
    }

    setEdit(NO_EDIT);
  }

  /** Every editor resets the shared slot on the way out. */
  function closeEditor(close: () => void) {
    if (edit.isSaving) return;
    setEdit(NO_EDIT);
    close();
  }

  async function handleLogout() {
    // Signs out for real: clears the token from the api client and the session
    // from SecureStore, so a restart doesn't land back in the account.
    await logout();
    router.replace("/login" as RelativePathString);
  }

  async function handleSaveName(name: string) {
    await runEdit(async () => {
      const updated = await updateFullName("donor", name);
      applyProfile(updated);
      setIsEditNameVisible(false);
    }, "Couldn't save your name.");
  }

  async function handleSavePhone(nextPhone: string) {
    await runEdit(async () => {
      const updated = await updatePhone("donor", nextPhone);
      applyProfile(updated);
      setIsEditPhoneVisible(false);
    }, "Couldn't save your phone number.");
  }

  async function handleSaveLocation(location: ProfileLocation) {
    // Destructured so the null check narrows to plain numbers: the modal only
    // enables Save with both coordinates captured, so this is a guard rather
    // than a state the donor can reach — but the narrowing has to survive into
    // the async closure below, which a property access on `location` does not.
    const { latitude, longitude, areaLabel } = location;
    if (latitude === null || longitude === null) return;

    await runEdit(async () => {
      const updated = await updateDonorLocation({ latitude, longitude, areaLabel });
      applyProfile(updated);
      setIsEditLocationVisible(false);
    }, "Couldn't save your location.");
  }

  async function handleSendResetLink() {
    if (isSendingReset || !email) return;

    setIsSendingReset(true);
    setResetError(null);

    try {
      await sendPasswordResetLink("donor", email);
      setResetSent(true);
    } catch (error) {
      setResetError(describeWriteError(error, "Could not send the reset link. Please try again."));
    } finally {
      setIsSendingReset(false);
    }
  }

  /**
   * Pick a photo, then upload it.
   *
   * The picker's own guards run before the upload starts, so a HEIC or an
   * oversized image is turned away without spending a 5 MB request on it. On
   * any failure the old picture stays: nothing was written, and `profile_pic_url`
   * still holds whatever it held — so this deliberately does not clear it.
   */
  async function handlePickPhoto() {
    if (isUploadingPhoto || !profile) return;

    const picked = await pickProfilePhoto();
    // Backing out of the picker is not a failure, so it leaves no error behind
    // for the donor to dismiss.
    if (picked.status === "cancelled") return;
    if (picked.status === "error") {
      setPhotoError(picked.message);
      return;
    }

    setIsUploadingPhoto(true);
    setPhotoError(null);

    try {
      const updated = await uploadProfilePicture("donor", picked.photo);
      applyProfile(updated);
    } catch (error) {
      setPhotoError(describeWriteError(error, "Couldn't upload that photo."));
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function handlePhotoOptions() {
    if (isUploadingPhoto || !profile) return;
    setIsPhotoActionsVisible(true);
  }

  async function handleRemovePhoto() {
    if (isUploadingPhoto || !profile?.profile_pic_url) return;

    setIsUploadingPhoto(true);
    setPhotoError(null);
    try {
      const updated = await removeProfilePicture("donor");
      applyProfile(updated);
    } catch (error) {
      setPhotoError(describeWriteError(error, "Couldn't remove your photo."));
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleDeleteAccount() {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await deleteAccount("donor");
      await logout();
      router.replace("/login" as RelativePathString);
    } catch (error) {
      setDeleteAccountError(describeWriteError(error, "Couldn't delete your account. Please try again."));
    } finally {
      setIsDeletingAccount(false);
    }
  }

  /**
   * The availability toggle, against the same endpoint Donor Home uses.
   *
   * Not optimistic here, unlike the home screen's pill: the pill is that
   * screen's primary control and has to feel instant, whereas this is a
   * settings row where waiting for the server is the less surprising choice —
   * the switch only moves once the change is real.
   */
  async function handleToggleAvailability() {
    if (isTogglingAvailability || !profile) return;

    setIsTogglingAvailability(true);
    setAvailabilityError(null);

    try {
      const updated = await setDonorAvailability(!available);
      applyProfile(updated);
    } catch (error) {
      setAvailabilityError(availabilityErrorMessage(error));
    } finally {
      setIsTogglingAvailability(false);
    }
  }

  useEffect(() => {
    if (!available) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [available, pulse]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {profile?.profile_pic_url ? (
                  <Image source={{ uri: profile.profile_pic_url }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{initialsFrom(profile?.full_name ?? null)}</Text>
                )}
                {/* Over the picture rather than beside it: the thing being
                    waited on is this image, and a spinner elsewhere on the
                    screen leaves the avatar looking unchanged. */}
                {isUploadingPhoto ? (
                  <View style={styles.avatarBusy}>
                    <ActivityIndicator color={colors.surface} />
                  </View>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel="Manage profile photo"
                accessibilityState={{ disabled: isUploadingPhoto }}
                disabled={isUploadingPhoto}
                onPress={handlePhotoOptions}
                style={styles.cameraButton}
              >
                <MaterialIcons name="photo-camera" size={16} color={colors.surface} />
              </Pressable>
            </View>
            {photoError ? (
              <Text accessibilityRole="alert" style={styles.photoError}>{photoError}</Text>
            ) : null}
            <View style={styles.nameRow}>
              <Text style={styles.name}>{fullName}</Text>
              <Pressable accessibilityLabel="Edit full name" onPress={() => setIsEditNameVisible(true)} style={styles.nameEditButton}>
                <MaterialIcons name="edit" size={15} color={colors.crimson} />
              </Pressable>
            </View>
            <View style={styles.badges}>
              <View style={styles.bloodBadge}><MaterialIcons name="bloodtype" size={16} color={colors.crimson} /><Text style={styles.bloodText}>{profile?.blood_type ?? "—"} Donor</Text></View>
              {/* The badge states what the backend knows. Claiming verification
                  on an unverified account is the kind of thing a donor only
                  finds out about when a hospital refuses their donation. */}
              <View style={profile?.is_email_verified ? styles.verifiedBadge : styles.unverifiedBadge}>
                <MaterialIcons name={profile?.is_email_verified ? "verified" : "error-outline"} size={16} color={profile?.is_email_verified ? colors.emeraldText : colors.amberText} />
                <Text style={profile?.is_email_verified ? styles.verifiedText : styles.unverifiedText}>
                  {profile?.is_email_verified ? "Email Verified" : "Email Not Verified"}
                </Text>
              </View>
            </View>
            {profile ? <Text style={styles.memberSince}>Member since {formatDate(profile.created_at)}</Text> : null}
          </View>

          <View style={styles.content}>
            <Pressable disabled={isTogglingAvailability} onPress={handleToggleAvailability} style={[styles.availabilityCard, isTogglingAvailability && styles.availabilityBusy]}>
              <View style={styles.availabilityCopy}>
                <View style={styles.availabilityIcon}>
                  <MaterialIcons name="volunteer-activism" size={18} color={colors.emeraldText} />
                  <Animated.View style={[styles.availabilityPulse, !available && styles.availabilityPulseOff, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] }]} />
                  <View style={[styles.availabilityCore, !available && styles.availabilityCoreOff]} />
                </View>
                <View style={{ flex: 1 }}><Text style={styles.availabilityText}>{available ? "Available for Donation" : "Unavailable for Donation"}</Text><Text style={styles.availabilitySubtext}>{available ? "Turn off if you're temporarily unable to donate" : "You will not receive urgent dispatch alerts"}</Text></View>
              </View>
              {isTogglingAvailability ? (
                <ActivityIndicator size="small" color={colors.crimson} />
              ) : (
                <View style={[styles.switch, !available && styles.switchOff]}><View style={[styles.switchThumb, available && styles.switchThumbOn]} /></View>
              )}
            </Pressable>
            {availabilityError ? (
              <Text accessibilityRole="alert" style={styles.availabilityError}>{availabilityError}</Text>
            ) : null}

            <View style={styles.section}><Text style={styles.sectionLabel}>Account Information</Text><View style={styles.sectionCard}>{accountFields.map((field, index) => <View key={field.label}>{index > 0 && <View style={styles.divider} />}<AccountRow field={field} onPress={field.label === "Phone Number" ? () => setIsEditPhoneVisible(true) : field.label === "Location & Area" ? () => setIsEditLocationVisible(true) : () => undefined} value={field.value} /></View>)}<View style={styles.divider} /><Pressable onPress={() => { setResetError(null); setResetSent(false); setIsChangePasswordVisible(true); }} style={styles.row}><View style={styles.rowIcon}><MaterialIcons name="lock" size={20} color={colors.text} /></View><View style={styles.rowCopy}><Text style={styles.rowValue}>Change Password</Text></View><MaterialIcons name="chevron-right" size={20} color={colors.mutedText} /></Pressable></View></View>
            <View style={styles.actions}><Pressable onPress={handleLogout} style={styles.logout}><MaterialIcons name="logout" size={20} color={colors.crimson} /><Text style={styles.logoutText}>Log Out</Text></Pressable><Pressable onPress={() => setIsDeleteAccountVisible(true)}><Text style={styles.deleteText}>Delete Account</Text></Pressable></View>
          </View>
        </ScrollView>

        <View style={styles.bottomTabs}>
          <Pressable onPress={() => router.replace("/home" as RelativePathString)} style={styles.tab}><MaterialIcons name="water-drop" size={22} color="#6b7280" /><Text style={styles.tabText}>Requests</Text></Pressable>
          <Pressable onPress={() => router.push("/history" as RelativePathString)} style={styles.tab}><MaterialIcons name="history" size={22} color="#6b7280" /><Text style={styles.tabText}>History</Text></Pressable>
          <Pressable style={styles.tab}><MaterialIcons name="person" size={22} color={colors.crimson} /><Text style={[styles.tabText, styles.tabActive]}>Profile</Text></Pressable>
        </View>

        <EditNameModal currentName={fullName} error={edit.message} fieldErrors={edit.fieldErrors} isSubmitting={edit.isSaving} onClose={() => closeEditor(() => setIsEditNameVisible(false))} onSave={handleSaveName} visible={isEditNameVisible} />
        <EditPhoneModal currentPhone={profile?.phone ?? ""} error={edit.message} fieldErrors={edit.fieldErrors} isSubmitting={edit.isSaving} onClose={() => closeEditor(() => setIsEditPhoneVisible(false))} onSave={handleSavePhone} visible={isEditPhoneVisible} />
        {/* Coordinates are deliberately absent: the backend never sends them
            back, so the modal starts with the saved label and no fix. */}
        <EditLocationModal
          currentLocation={{ latitude: null, longitude: null, areaLabel: profile?.area_label ?? "" }}
          error={edit.message}
          fieldErrors={edit.fieldErrors}
          isSubmitting={edit.isSaving}
          onClose={() => closeEditor(() => setIsEditLocationVisible(false))}
          onSave={handleSaveLocation}
          visible={isEditLocationVisible}
        />
        <ChangePasswordModal
          email={email}
          error={resetError}
          isSending={isSendingReset}
          isSent={resetSent}
          onClose={() => { setResetError(null); setResetSent(false); setIsChangePasswordVisible(false); }}
          onSendResetLink={handleSendResetLink}
          visible={isChangePasswordVisible}
        />
        <ProfilePictureActionModal hasPicture={Boolean(profile?.profile_pic_url)} onChangePhoto={() => { setIsPhotoActionsVisible(false); void handlePickPhoto(); }} onClose={() => setIsPhotoActionsVisible(false)} onRemovePicture={() => { setIsPhotoActionsVisible(false); void handleRemovePhoto(); }} visible={isPhotoActionsVisible} />
        <DeleteAccountModal error={deleteAccountError} isDeleting={isDeletingAccount} onClose={() => { setDeleteAccountError(null); setIsDeleteAccountVisible(false); }} onDelete={handleDeleteAccount} visible={isDeleteAccountVisible} />
      </View>
    </SafeAreaView>
  );
}
