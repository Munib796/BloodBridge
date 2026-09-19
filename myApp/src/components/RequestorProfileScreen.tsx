import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, type RelativePathString } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ChangePasswordModal from "./ChangePasswordModal";
import DeleteAccountModal from "./DeleteAccountModal";
import EditNameModal from "./EditNameModal";
import EditPhoneModal from "./EditPhoneModal";
import BrandLogo from "./BrandLogo";
import ProfilePictureActionModal from "./ProfilePictureActionModal";
import { useAuth } from "../context/AuthContext";
import { fieldErrorsFrom } from "../lib/apiClient";
import { describeWriteError } from "../lib/errors";
import {
  initialsFrom,
  deleteAccount,
  removeProfilePicture,
  sendPasswordResetLink,
  updateFullName,
  updatePhone,
  uploadProfilePicture,
} from "../lib/profile";
import { pickProfilePhoto } from "../utils/photoPicker";
import { requestorProfileStyles as styles } from "../styles/requestorProfileStyles";
import { colors } from "../theme/colors";

type ProfileField = { icon: "mail" | "call"; label: string; value: string; action: string; editable: boolean };

/**
 * One editor's in-flight and failure state, shared by the two editors because
 * only one modal is open at a time — see the same shape on the donor's screen.
 */
type EditState = {
  isSaving: boolean;
  fieldErrors: Record<string, string>;
  message: string | null;
};

const NO_EDIT: EditState = { isSaving: false, fieldErrors: {}, message: null };

function AccountRow({ field, onPress, value }: { field: ProfileField; onPress?: () => void; value?: string }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={styles.row}>
      <View style={styles.rowInner}>
        <View style={styles.rowIcon}>
          <MaterialIcons name={field.icon} size={18} color="#475569" />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowLabel}>{field.label}</Text>
          <Text numberOfLines={1} style={styles.rowValue}>{value ?? field.value}</Text>
        </View>
      </View>
      {field.editable && <View style={styles.rowAction}>
        <Text style={styles.editText}>{field.action}</Text>
        <MaterialIcons name="chevron-right" size={18} color={colors.mutedText} />
      </View>}
    </Pressable>
  );
}

export default function RequestorProfileScreen() {
  const router = useRouter();
  const { state, applyProfile, logout } = useAuth();

  const [isEditNameVisible, setIsEditNameVisible] = useState(false);
  const [isEditPhoneVisible, setIsEditPhoneVisible] = useState(false);
  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [isPhotoActionsVisible, setIsPhotoActionsVisible] = useState(false);
  const [isDeleteAccountVisible, setIsDeleteAccountVisible] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const [edit, setEdit] = useState<EditState>(NO_EDIT);

  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const profile = state.status === "signedIn" && state.role === "requestor" ? state.profile : null;

  const fullName = profile?.full_name ?? "—";
  const email = profile?.email ?? "";

  const fields: ProfileField[] = [
    { icon: "mail", label: "Email Address", value: email || "—", action: "Edit", editable: false },
    { icon: "call", label: "Phone Number", value: profile?.phone ?? "—", action: "Edit", editable: true },
  ];

  /** See the donor screen for why the slot is shared and when the sheet closes. */
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
        message: Object.keys(fieldErrors).length
          ? null
          : describeWriteError(error, fallbackMessage),
      });
      return;
    }

    setEdit(NO_EDIT);
  }

  function closeEditor(close: () => void) {
    if (edit.isSaving) return;
    setEdit(NO_EDIT);
    close();
  }

  async function handleLogout() {
    // Clears the token and the stored session, so a restart doesn't land back
    // inside the account.
    await logout();
    router.replace("/login" as RelativePathString);
  }

  async function handleSaveName(name: string) {
    await runEdit(async () => {
      const updated = await updateFullName("requestor", name);
      applyProfile(updated);
      setIsEditNameVisible(false);
    }, "Couldn't save your name.");
  }

  async function handleSavePhone(nextPhone: string) {
    await runEdit(async () => {
      const updated = await updatePhone("requestor", nextPhone);
      applyProfile(updated);
      setIsEditPhoneVisible(false);
    }, "Couldn't save your phone number.");
  }

  async function handleSendResetLink() {
    if (isSendingReset || !email) return;

    setIsSendingReset(true);
    setResetError(null);

    try {
      await sendPasswordResetLink("requestor", email);
      setResetSent(true);
    } catch (error) {
      setResetError(describeWriteError(error, "Could not send the reset link. Please try again."));
    } finally {
      setIsSendingReset(false);
    }
  }

  /** See the donor screen: same picker guards, same "old picture stays" rule. */
  async function handlePickPhoto() {
    if (isUploadingPhoto || !profile) return;

    const picked = await pickProfilePhoto();
    if (picked.status === "cancelled") return;
    if (picked.status === "error") {
      setPhotoError(picked.message);
      return;
    }

    setIsUploadingPhoto(true);
    setPhotoError(null);

    try {
      const updated = await uploadProfilePicture("requestor", picked.photo);
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
      const updated = await removeProfilePicture("requestor");
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
      await deleteAccount("requestor");
      await logout();
      router.replace("/login" as RelativePathString);
    } catch (error) {
      setDeleteAccountError(describeWriteError(error, "Couldn't delete your account. Please try again."));
    } finally {
      setIsDeletingAccount(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.brandWrap}>
            <BrandLogo size={32} style={styles.logo} />
            <View style={styles.brandCopy}>
              <Text style={styles.brand}>BloodBridge</Text>
              <Text style={styles.portal}>Requestor Portal</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {profile?.profile_pic_url ? (
                  <Image source={{ uri: profile.profile_pic_url }} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{initialsFrom(profile?.full_name ?? null)}</Text>
                )}
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
                <MaterialIcons name="photo-camera" size={15} color={colors.surface} />
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
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account Information</Text>
            <View style={styles.sectionCard}>
              {fields.map((field, index) => (
                <View key={field.label}>
                  {index > 0 && <View style={styles.divider} />}
                  <AccountRow field={field} onPress={field.label === "Phone Number" ? () => setIsEditPhoneVisible(true) : undefined} value={field.value} />
                </View>
              ))}
                <View style={styles.divider} />
                <Pressable onPress={() => { setResetError(null); setResetSent(false); setIsChangePasswordVisible(true); }} style={styles.row}>
                  <View style={styles.rowInner}>
                    <View style={styles.rowIcon}>
                      <MaterialIcons name="lock" size={18} color="#475569" />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowValue}>Change Password</Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={colors.mutedText} />
                </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={handleLogout} style={styles.logoutButton}>
              <MaterialIcons name="logout" size={20} color={colors.crimson} />
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
            <View style={styles.deleteAccountWrap}>
              <Pressable onPress={() => setIsDeleteAccountVisible(true)}>
                <Text style={styles.deleteAccountText}>Delete Account</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <View style={styles.bottomTabs}>
          <Pressable
            onPress={() => router.replace("/requestor-home" as RelativePathString)}
            style={styles.tab}
          >
            <MaterialIcons name="water-drop" size={22} color="#94a3b8" />
            <Text style={styles.tabText}>Requests</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/requestor-history" as RelativePathString)}
            style={styles.tab}
          >
            <MaterialIcons name="history" size={22} color="#94a3b8" />
            <Text style={styles.tabText}>History</Text>
          </Pressable>

          <Pressable style={styles.tab}>
            <MaterialIcons name="person" size={22} color={colors.crimson} />
            <Text style={[styles.tabText, styles.tabTextActive]}>Profile</Text>
          </Pressable>
        </View>

        <EditNameModal currentName={fullName} error={edit.message} fieldErrors={edit.fieldErrors} isSubmitting={edit.isSaving} onClose={() => closeEditor(() => setIsEditNameVisible(false))} onSave={handleSaveName} visible={isEditNameVisible} />
        <EditPhoneModal currentPhone={profile?.phone ?? ""} error={edit.message} fieldErrors={edit.fieldErrors} isSubmitting={edit.isSaving} onClose={() => closeEditor(() => setIsEditPhoneVisible(false))} onSave={handleSavePhone} visible={isEditPhoneVisible} />
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
