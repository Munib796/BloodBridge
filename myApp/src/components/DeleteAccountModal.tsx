import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";

import { colors } from "../theme/colors";
import { deleteAccountModalStyles as styles } from "../styles/deleteAccountModalStyles";

type DeleteAccountModalProps = {
  visible: boolean;
  isDeleting: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: () => void;
};

export default function DeleteAccountModal({ visible, isDeleting, error, onClose, onDelete }: DeleteAccountModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close delete account dialog" onPress={onClose} style={styles.dismissArea} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close delete account dialog" onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.content}>
            <View style={styles.iconWrap}><MaterialIcons name="delete-outline" size={25} color={colors.crimson} /></View>
            <Text style={styles.title}>Delete Account</Text>
            <Text style={styles.subtitle}>Your account will be deactivated and your personal profile details will be removed. Historical emergency records will be preserved without your identity.</Text>
            <View style={styles.notice}><MaterialIcons name="warning-amber" size={17} color={colors.amberText} /><Text style={styles.noticeText}>This action cannot be undone. You will be signed out immediately.</Text></View>
            {error ? <View style={styles.errorBox}><MaterialIcons name="error-outline" size={16} color={colors.crimson} /><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></View> : null}
            <Pressable accessibilityRole="button" disabled={isDeleting} onPress={onDelete} style={[styles.deleteButton, isDeleting && styles.busy]}>
              {isDeleting ? <ActivityIndicator color={colors.surface} /> : <><MaterialIcons name="delete-outline" size={18} color={colors.surface} /><Text style={styles.deleteButtonText}>Delete Account</Text></>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={isDeleting} onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Keep My Account</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}