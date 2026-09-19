import { MaterialIcons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

import { colors } from "../theme/colors";
import { profilePictureActionModalStyles as styles } from "../styles/profilePictureActionModalStyles";

type ProfilePictureActionModalProps = {
  visible: boolean;
  hasPicture: boolean;
  onClose: () => void;
  onChangePhoto: () => void;
  onRemovePicture: () => void;
};

export default function ProfilePictureActionModal({ visible, hasPicture, onClose, onChangePhoto, onRemovePicture }: ProfilePictureActionModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close profile picture actions" onPress={onClose} style={styles.dismissArea} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close profile picture actions" onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconWrap}><MaterialIcons name="account-circle" size={22} color={colors.crimson} /></View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Profile Picture</Text>
                <Text style={styles.subtitle}>Keep your profile recognizable to the BloodBridge community.</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onChangePhoto} style={styles.primaryButton}>
                <MaterialIcons name="photo-camera" size={18} color={colors.surface} />
                <Text style={styles.primaryText}>{hasPicture ? "Change Photo" : "Add Photo"}</Text>
              </Pressable>
              {hasPicture ? (
                <Pressable accessibilityRole="button" onPress={onRemovePicture} style={styles.removeButton}>
                  <MaterialIcons name="delete-outline" size={18} color={colors.crimson} />
                  <Text style={styles.removeText}>Remove Picture</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}