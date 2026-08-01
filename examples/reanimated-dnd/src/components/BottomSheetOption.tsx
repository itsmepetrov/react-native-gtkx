// PORTED from react-native-reanimated-dnd's example app (MIT).
//
// One change, and it is this repo's lint rather than the platform:
// upstream types the option `value` as `any`, which
// `@typescript-eslint/no-explicit-any` rejects here. A type parameter says
// the same thing — the component never looks inside a value, it hands it
// back — and keeps every call site identical.
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"

interface Option<TValue> {
  label: string
  value: TValue
  key?: string
}

interface BottomSheetOptionProps<TValue> {
  options: readonly Option<TValue>[]
  selectedOption: TValue | string
  onSelect: (option: Option<TValue>) => void
}

export function BottomSheetOption<TValue>({
  options,
  selectedOption,
  onSelect,
}: BottomSheetOptionProps<TValue>) {
  return (
    <View>
      {options.map((option, index) => {
        const isSelected =
          option.value === selectedOption || option.key === selectedOption

        return (
          <TouchableOpacity
            key={option.key ?? String(option.value ?? index)}
            style={[styles.option, isSelected && styles.selectedOption]}
            onPress={() => onSelect(option)}
          >
            <Text
              style={[
                styles.optionText,
                isSelected && styles.selectedOptionText,
              ]}
            >
              {option.label}
            </Text>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    borderColor: "#1A1C26",
    borderRadius: 8,
    backgroundColor: "#12141C",
    marginBottom: 8,
  },
  selectedOption: {
    borderColor: "#FF3B30",
    backgroundColor: "rgba(255, 59, 48, 0.1)",
  },
  optionText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  selectedOptionText: {
    color: "#FF3B30",
  },
  checkmark: {
    fontSize: 16,
    color: "#FF3B30",
    fontWeight: "600",
  },
})
