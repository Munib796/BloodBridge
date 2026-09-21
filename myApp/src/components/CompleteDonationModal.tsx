import { MaterialIcons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";

import { colors } from "../theme/colors";
import { completeDonationModalStyles as styles } from "../styles/completeDonationModalStyles";

type CompleteDonationModalProps = {
  visible: boolean;
  unitsLabel: string;
  patientName: string;
  onClose: () => void;
  onConfirm: () => void;
};

export default function CompleteDonationModal({
  visible,
  unitsLabel,
  patientName,
  onClose,
  onConfirm,
}: CompleteDonationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close dialog" onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.iconWrap}>
            <MaterialIcons name="check-circle-outline" size={30} color={colors.secondary} />
          </View>
          <Text style={styles.title}>Confirm Donation Completed</Text>
          <Text style={styles.body}>
            Mark your {unitsLabel} donation for {patientName} as completed? Only confirm once you have donated.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={onConfirm} style={styles.confirmButton}>
              <MaterialIcons name="check-circle" size={18} color={colors.surface} />
              <Text style={styles.confirmText}>Confirm Completed</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Not Yet</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
