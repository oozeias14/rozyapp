import React from 'react';
import { Modal, View, Text, Image, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { COLORS, S, roleLabel, roleStyle } from '../theme';

export default function PersonModal({ visible, person, sponsor, onClose }) {
  if (!person) return null;

  const socials = [
    person.instagram && { key: 'instagram', label: 'Instagram', value: person.instagram, icon: '📸', url: `https://instagram.com/${person.instagram.replace('@', '')}` },
    person.facebook && { key: 'facebook', label: 'Facebook', value: person.facebook, icon: '📘', url: `https://facebook.com/${encodeURIComponent(person.facebook)}` },
    person.tiktok && { key: 'tiktok', label: 'TikTok', value: person.tiktok, icon: '🎵', url: `https://tiktok.com/${person.tiktok}` },
    person.whatsapp && { key: 'whatsapp', label: 'WhatsApp', value: 'Conversar', icon: '💬', url: `https://wa.me/${person.whatsapp}` },
  ].filter(Boolean);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View style={styles.ring}>
              <View style={styles.avatarBig}>
                {person.photo_url ? (
                  <Image source={{ uri: person.photo_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={{ fontSize: 26, color: COLORS.violet }}>{initials(person.name)}</Text>
                )}
              </View>
            </View>
            <Text style={styles.name}>{person.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, alignItems: 'center' }}>
              <Text style={S.idBadge}>#{person.id}</Text>
              <Text style={[S.roleBadge, roleStyle(person.role)]}>{roleLabel(person.role)}</Text>
            </View>
            {sponsor && <Text style={[S.muted, { marginTop: 6 }]}>Indicado por <Text style={{ fontWeight: '700' }}>{sponsor.name}</Text> (#{sponsor.id})</Text>}
          </View>

          <Text style={S.cardTitle}>Redes sociais — seguir</Text>
          {socials.length === 0 && <Text style={S.muted}>Este membro ainda não cadastrou redes sociais.</Text>}
          {socials.map((s) => (
            <TouchableOpacity key={s.key} style={styles.socialRow} onPress={() => Linking.openURL(s.url)}>
              <View style={styles.socialIcon}><Text>{s.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: COLORS.ink2 }}>{s.label}</Text>
                <Text style={{ fontWeight: '700', color: COLORS.ink1 }}>{s.value}</Text>
              </View>
              <Text style={{ color: COLORS.teal, fontSize: 11, fontWeight: '700' }}>Abrir</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[S.btn, S.btnGhost, { marginTop: 8 }]} onPress={onClose}>
            <Text style={S.btnTextGhost}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,5,10,0.77)' },
  sheet: { backgroundColor: COLORS.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  handle: { width: 36, height: 4, backgroundColor: COLORS.line, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  ring: { width: 90, height: 90, borderRadius: 45, padding: 3, backgroundColor: COLORS.teal },
  avatarBig: { flex: 1, borderRadius: 45, backgroundColor: COLORS.violetDim, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  name: { color: COLORS.ink1, fontSize: 17, fontWeight: '700', marginTop: 10 },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, backgroundColor: COLORS.panel2, borderRadius: 12, marginBottom: 8 },
  socialIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: COLORS.panel, alignItems: 'center', justifyContent: 'center' },
});
