import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export default function TopBar({ totalUsers }) {
  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <View style={styles.dot} />
        <Text style={styles.brandText}>Amigos Dr Candido</Text>
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillText}>🌐 <Text style={styles.pillNum}>{totalUsers}</Text></Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.teal, flexShrink: 0 },
  brandText: { fontWeight: '700', fontSize: 13, color: COLORS.ink1, flexShrink: 1 },
  pill: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 11, color: COLORS.ink2 },
  pillNum: { color: COLORS.teal, fontFamily: 'monospace' },
});
