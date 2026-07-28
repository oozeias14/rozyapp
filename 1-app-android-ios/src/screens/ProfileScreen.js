import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, TextInput, Alert, StyleSheet, ActivityIndicator, ScrollView, Share, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { supabase, MAX_PHOTO_BYTES } from '../lib/supabase';
import { COLORS, S } from '../theme';
import TopBar from '../components/TopBar';
import { updateProfile, changeOwnPassword, fetchAppSettings, fetchAllProfiles } from '../lib/api';

export default function ProfileScreen({ profile, onProfileUpdated, onOpenAdmin, onLogout }) {
  const [uploading, setUploading] = useState(false);
  const [instagram, setInstagram] = useState(profile.instagram || '');
  const [facebook, setFacebook] = useState(profile.facebook || '');
  const [tiktok, setTiktok] = useState(profile.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || '');
  const [newPassword, setNewPassword] = useState('');
  const [appDomain, setAppDomain] = useState('orbita.app');
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    (async () => {
      const [settings, all] = await Promise.all([fetchAppSettings(), fetchAllProfiles()]);
      if (settings) setAppDomain(settings.app_domain);
      setTotalUsers(all.length);
    })();
  }, []);

  const referralLink = `https://${appDomain || 'orbita.app'}/r/${profile.id}`;
  const isStaff = profile.role === 'admin' || profile.role === 'coord';

  async function pickAndUploadPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso à galeria para escolher uma foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];

    if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
      Alert.alert('Imagem muito grande', `Essa foto tem ${(asset.fileSize / 1024 / 1024).toFixed(2)} MB. O limite é 1 MB. Escolha uma foto menor.`);
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      if (blob.size > MAX_PHOTO_BYTES) {
        Alert.alert('Imagem muito grande', `Essa foto tem ${(blob.size / 1024 / 1024).toFixed(2)} MB. O limite é 1 MB.`);
        setUploading(false);
        return;
      }
      const ext = asset.uri.split('.').pop().toLowerCase();
      const path = `${profile.auth_id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
      if (uploadError) {
        if (uploadError.message && uploadError.message.toLowerCase().includes('exceed')) {
          Alert.alert('Imagem muito grande', 'O servidor recusou o arquivo: limite de 1 MB por foto.');
        } else {
          Alert.alert('Erro ao enviar foto', uploadError.message);
        }
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const photoUrl = pub.publicUrl + `?t=${Date.now()}`;
      await updateProfile(profile.id, { photo_url: photoUrl });
      onProfileUpdated({ ...profile, photo_url: photoUrl });
      Alert.alert('Pronto', 'Foto de perfil atualizada.');
    } catch (e) {
      Alert.alert('Erro inesperado', String(e.message || e));
    } finally {
      setUploading(false);
    }
  }

  async function saveSocials() {
    try {
      await updateProfile(profile.id, { instagram, facebook, tiktok, whatsapp });
      onProfileUpdated({ ...profile, instagram, facebook, tiktok, whatsapp });
      Alert.alert('Salvo', 'Redes sociais atualizadas.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  async function copyCode() {
    await Clipboard.setStringAsync(String(profile.id));
    Alert.alert('Copiado', 'Código de indicação copiado.');
  }

  async function shareWhatsApp() {
    const text = `Entre no Amigos da Rozy Costa! Use meu código de indicação: ${profile.id} (digite esse número no cadastro do app)`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }

  async function shareGeneric() {
    try {
      await Share.share({ message: `Entre no Amigos da Rozy Costa! Meu código de indicação: ${profile.id}` });
    } catch (e) {}
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) { Alert.alert('Senha muito curta', 'Use ao menos 6 caracteres.'); return; }
    try {
      await changeOwnPassword(newPassword);
      setNewPassword('');
      Alert.alert('Pronto', 'Sua senha foi alterada.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  return (
    <ScrollView style={S.screen}>
      <TopBar totalUsers={totalUsers} />

      <View style={[S.card, { alignItems: 'center' }]}>
        <TouchableOpacity onPress={pickAndUploadPhoto} style={styles.photoRing} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={COLORS.teal} />
          ) : profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.photoImg} />
          ) : (
            <Text style={{ fontSize: 26 }}>📷</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.hint}>Toque para escolher uma foto da galeria (máx. 1 MB)</Text>
        <Text style={styles.name}>{profile.name}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
          <Text style={S.idBadge}>#{profile.id}</Text>
          <Text style={[S.roleBadge, profile.role === 'admin' ? S.roleAdmin : profile.role === 'coord' ? S.roleCoord : S.roleUser]}>
            {profile.role === 'admin' ? 'Admin' : profile.role === 'coord' ? 'Coord' : 'Membro'}
          </Text>
        </View>
        <Text style={[S.muted, { marginTop: 8 }]}>{profile.email}</Text>
      </View>

      <Text style={S.cardTitle}>Editar redes sociais</Text>
      <View style={S.card}>
        <Text style={S.label}>Instagram</Text>
        <TextInput style={S.input} value={instagram} onChangeText={setInstagram} placeholder="@usuario" placeholderTextColor={COLORS.ink3} />
        <Text style={S.label}>Facebook</Text>
        <TextInput style={S.input} value={facebook} onChangeText={setFacebook} placeholder="Seu nome no Facebook" placeholderTextColor={COLORS.ink3} />
        <Text style={S.label}>TikTok</Text>
        <TextInput style={S.input} value={tiktok} onChangeText={setTiktok} placeholder="@usuario" placeholderTextColor={COLORS.ink3} />
        <Text style={S.label}>WhatsApp</Text>
        <TextInput style={S.input} value={whatsapp} onChangeText={setWhatsapp} placeholder="5561999999999" placeholderTextColor={COLORS.ink3} keyboardType="phone-pad" />
        <TouchableOpacity style={[S.btn, S.btnTeal]} onPress={saveSocials}>
          <Text style={S.btnTextDark}>Salvar redes sociais</Text>
        </TouchableOpacity>
      </View>

      <Text style={S.cardTitle}>Seu código de indicação</Text>
      <View style={[S.card, { alignItems: 'center' }]}>
        <Text style={styles.bigCode}>#{profile.id}</Text>
        <Text style={[S.muted, { textAlign: 'center', marginTop: 4 }]}>Peça para a pessoa digitar este número no campo "Código de indicação" na tela de Cadastro.</Text>
        <TouchableOpacity style={[S.btn, S.btnGhost, { marginTop: 10, paddingHorizontal: 20 }]} onPress={copyCode}>
          <Text style={S.btnTextGhost}>Copiar código</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity style={[S.btn, S.btnTeal, { flex: 1, marginBottom: 0 }]} onPress={shareWhatsApp}>
          <Text style={S.btnTextDark}>🟢 WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.btn, S.btnViolet, { flex: 1, marginBottom: 0 }]} onPress={shareGeneric}>
          <Text style={S.btnTextLight}>📸 Instagram</Text>
        </TouchableOpacity>
      </View>

      <Text style={S.cardTitle}>Link e QR Code (opcional)</Text>
      <View style={S.card}>
        <View style={styles.linkBox}>
          <Text style={styles.linkText} numberOfLines={1}>{referralLink}</Text>
        </View>
        <Text style={[S.muted, { marginBottom: 10 }]}>O link só vai abrir de verdade quando o app tiver um domínio próprio publicado — enquanto isso, use o código acima.</Text>
        <View style={{ alignItems: 'center', paddingVertical: 6 }}>
          <QRCode value={referralLink} size={140} backgroundColor={COLORS.panel} color={COLORS.ink1} />
        </View>
      </View>

      <Text style={S.cardTitle}>Alterar minha senha</Text>
      <View style={S.card}>
        <Text style={S.label}>Nova senha</Text>
        <TextInput style={S.input} value={newPassword} onChangeText={setNewPassword} placeholder="Mínimo 6 caracteres" placeholderTextColor={COLORS.ink3} secureTextEntry />
        <TouchableOpacity style={[S.btn, S.btnViolet]} onPress={handleChangePassword}>
          <Text style={S.btnTextLight}>Alterar senha</Text>
        </TouchableOpacity>
      </View>

      {isStaff && (
        <TouchableOpacity style={[S.btn, S.btnViolet]} onPress={onOpenAdmin}>
          <Text style={S.btnTextLight}>⚙️ Abrir painel {profile.role === 'admin' ? 'Admin' : 'Coordenador'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[S.btn, S.btnGhost]} onPress={onLogout}>
        <Text style={S.btnTextGhost}>Sair da conta</Text>
      </TouchableOpacity>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photoRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: COLORS.teal, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: COLORS.panel2, marginBottom: 8 },
  photoImg: { width: '100%', height: '100%' },
  hint: { color: COLORS.ink3, fontSize: 10, marginBottom: 8, textAlign: 'center' },
  name: { color: COLORS.ink1, fontSize: 17, fontWeight: '700' },
  bigCode: { fontFamily: 'monospace', fontSize: 34, fontWeight: '700', color: COLORS.teal, letterSpacing: 1 },
  linkBox: { backgroundColor: COLORS.panel2, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 10, marginBottom: 8 },
  linkText: { color: COLORS.teal, fontFamily: 'monospace', fontSize: 11.5 },
});
