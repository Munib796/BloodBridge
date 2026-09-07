import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors } from "@/theme/colors";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={[styles.input, !!error && styles.inputError, style]}
        {...rest}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.primary,
  },
  error: {
    color: colors.primary,
    fontSize: 13,
    marginTop: 4,
  },
});
