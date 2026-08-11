import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, Linking, RefreshControl, StyleSheet, Share } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { COLORS, S } from '../theme';
import TopBar from '../components/TopBar';
import { fetchAllProfiles, fetchOwnerProfile, incrementInstagramRedirects, incrementProfileRedirects } from '../lib/api';

export default function OwnerScreen({ profile, onOpenAdminOwner }) {
  const [owner, setOwner] = useState(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = profile.role === 'admin';

  const load = useCallback(async () => {
    const [o, all] = await Promise.all([fetchOwnerProfile(), fetchAllProfiles()]);
    setOwner(o);
    setTotalUsers(all.length);
  }, []);

  useEffect(() => {
    load();
    // Incrementa contador de visitas ao perfil de forma assíncrona e silenciosa
    incrementProfileRedirects().catch(err => console.log('Erro ao computar redirecionamento de perfil:', err));
  }, [load]);

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function handleSocialPress(social) {
    if (social.key === 'instagram') {
      incrementInstagramRedirects().catch(err => console.log('Erro ao computar redirecionamento Instagram:', err));
    }
    Linking.openURL(social.url).catch(err => console.log('Erro ao abrir link social:', err));
  }

  if (!owner) return null;

  const socials = [
    owner.instagram && { key: 'instagram', label: 'Instagram', value: owner.instagram, icon: <FontAwesome name="instagram" size={18} color="#fff" />, color: '#C13584', url: `https://instagram.com/${owner.instagram.replace('@', '')}` },
    owner.facebook && { key: 'facebook', label: 'Facebook', value: owner.facebook, icon: '📘', color: '#1877F2', url: `https://facebook.com/${encodeURIComponent(owner.facebook)}` },
    owner.tiktok && { key: 'tiktok', label: 'TikTok', value: owner.tiktok, icon: '🎵', color: '#010101', url: `https://tiktok.com/${owner.tiktok}` },
    owner.whatsapp && { key: 'whatsapp', label: 'WhatsApp', value: `Falar com ${owner.name}`, icon: <FontAwesome name="whatsapp" size={18} color="#fff" />, color: '#25D366', url: `https://wa.me/${owner.whatsapp}` },
    owner.youtube && { key: 'youtube', label: 'YouTube', value: 'Canal oficial', icon: '▶️', color: '#FF0000', url: owner.youtube },
  ].filter(Boolean);

  return (
    <ScrollView style={S.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} />}>
      <TopBar totalUsers={totalUsers} />

      {isAdmin && (
        <TouchableOpacity style={[S.btn, S.btnViolet, { marginBottom: 12 }]} onPress={onOpenAdminOwner}>
          <Text style={S.btnTextLight}>✏️ Editar esta página (Admin)</Text>
        </TouchableOpacity>
      )}

      {/* Cartão de Visita Premium */}
      <View style={styles.cardGradient}>
        <View style={styles.cardHeader}>
          {owner.photo_url ? (
            <Image source={{ uri: owner.photo_url }} style={styles.photo} />
          ) : (
            <Image source={require('../../assets/candido.jpg')} style={styles.photo} />
          )}
          <View style={styles.headerText}>
            <Text style={styles.cardBadge}>⚖️ ADVOGADO</Text>
            <Text style={styles.name}>{owner.name}</Text>
            <Text style={styles.subtext}>Especialista Fundiário</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <Text style={styles.bio}>{owner.bio}</Text>
      </View>

      <Text style={S.cardTitle}>Siga nas redes sociais</Text>
      {socials.length === 0 && <Text style={[S.muted, { textAlign: 'center', padding: 20 }]}>Redes sociais serão configuradas pelo Admin.</Text>}
      {socials.map((s) => (
        <TouchableOpacity key={s.key} style={styles.socialRow} onPress={() => handleSocialPress(s)}>
          <View style={[styles.socialIcon, { backgroundColor: s.color }]}>
            {typeof s.icon === 'string' ? <Text>{s.icon}</Text> : s.icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: COLORS.ink2 }}>{s.label}</Text>
            <Text style={{ fontWeight: '700', color: COLORS.ink1 }}>{s.value}</Text>
          </View>
          <Text style={{ color: COLORS.teal, fontSize: 11, fontWeight: '700' }}>{s.key === 'whatsapp' ? 'Abrir' : 'Seguir'}</Text>
        </TouchableOpacity>
      ))}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cardGradient: {
    backgroundColor: '#161C2C',
    borderWidth: 1.5,
    borderColor: COLORS.violet,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: COLORS.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    alignItems: 'center',
  },
  cardBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.teal,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  subtext: {
    color: COLORS.ink2,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.line,
    marginVertical: 14,
    width: '100%',
  },
  photo: { width: 100, height: 100, borderRadius: 50, borderWidth: 2.5, borderColor: COLORS.teal, marginBottom: 12 },
  photoPlaceholder: { backgroundColor: COLORS.violetDim, alignItems: 'center', justifyContent: 'center' },
  name: { color: COLORS.ink1, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  bio: { color: COLORS.ink1, fontSize: 13, lineHeight: 20, marginBottom: 20, textAlign: 'center' },
  shareBtn: {
    backgroundColor: COLORS.violet,
    borderRadius: 12,
    padding: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, backgroundColor: COLORS.panel2, borderRadius: 12, marginBottom: 8 },
  socialIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});

