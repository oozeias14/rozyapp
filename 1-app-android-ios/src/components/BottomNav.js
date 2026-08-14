import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export default function BottomNav({ active, onChange, profile, hasNewMuralMessage }) {
  const isStaff = profile?.role === 'admin' || profile?.role === 'coord';

  const tabs = [
    { key: 'owner', label: 'Dr. Candido', icon: '📋' },
    { key: 'home', label: 'Mural', icon: '🏠' },
    { key: 'network', label: 'Rede', icon: '🔗' },
    { key: 'agenda', label: 'Eventos', icon: '📅' },
    isStaff && { key: 'mass_signup', label: 'Cadastro', icon: '➕' },
    { key: 'profile', label: 'Perfil', icon: '👤' },
  ].filter(Boolean);

  return (
    <View style={styles.bar}>
      {tabs.map((t) => (
        <TouchableOpacity key={t.key} style={styles.item} onPress={() => onChange(t.key)}>
          <View style={{ position: 'relative' }}>
            <Text style={{ fontSize: 17 }}>{t.icon}</Text>
            {t.key === 'home' && hasNewMuralMessage && (
              <View style={{
                position: 'absolute',
                top: 0,
                right: -2,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: '#FF3B30',
                borderWidth: 1,
                borderColor: 'rgba(18,24,38,0.97)',
              }} />
            )}
          </View>
          <Text style={[styles.label, active === t.key && styles.labelOn]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: 'rgba(18,24,38,0.97)', paddingVertical: 8, paddingBottom: 14 },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  label: { fontSize: 9, fontWeight: '600', color: COLORS.ink3, marginTop: 2 },
  labelOn: { color: COLORS.teal },
});
