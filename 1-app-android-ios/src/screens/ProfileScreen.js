import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, TextInput, Alert, StyleSheet, ActivityIndicator, ScrollView, Share, Linking, Modal } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase, MAX_PHOTO_BYTES } from '../lib/supabase';
import { COLORS, S } from '../theme';
import TopBar from '../components/TopBar';
import { updateProfile, changeOwnPassword, fetchAppSettings, fetchTotalUsersCount } from '../lib/api';

export default function ProfileScreen({ profile, onProfileUpdated, onOpenAdmin, onLogout }) {
  const [uploading, setUploading] = useState(false);
  const [instagram, setInstagram] = useState(profile.instagram || '');
  const [facebook, setFacebook] = useState(profile.facebook || '');
  const [tiktok, setTiktok] = useState(profile.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || profile.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [appDomain, setAppDomain] = useState('amigosdrcandido.com.br');
  const [totalUsers, setTotalUsers] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalProvider, setModalProvider] = useState('instagram');
  const [modalUsernameMain, setModalUsernameMain] = useState('');
  const [modalUsernameCustom, setModalUsernameCustom] = useState('');
  const [selectedType, setSelectedType] = useState('main');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalSuccess, setModalSuccess] = useState(false);

  function openLinkModal(provider) {
    // Generate a default mock username if they don't have one
    const defaultUser = profile.username || profile.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    const defaultPhone = profile.whatsapp || '5561999999999';
    
    let mockVal = defaultUser;
    if (provider === 'facebook') mockVal = profile.name;
    if (provider === 'whatsapp') mockVal = defaultPhone;

    setModalProvider(provider);
    setModalUsernameMain(mockVal);
    setModalUsernameCustom('');
    setSelectedType('main');
    setModalSubmitting(false);
    setModalSuccess(false);
    setModalVisible(true);
  }

  function confirmLink() {
    let finalVal = '';
    if (selectedType === 'main') {
      finalVal = modalUsernameMain;
    } else if (selectedType === 'alt1') {
      finalVal = modalProvider === 'instagram' ? 'dr.candido' : modalProvider === 'facebook' ? 'Dr. Cândido Oficial' : modalProvider === 'tiktok' ? 'dr.candido.oficial' : '5561999999999';
    } else if (selectedType === 'alt2') {
      finalVal = modalProvider === 'instagram' ? 'rozycosta' : modalProvider === 'facebook' ? 'Rozy Costa' : modalProvider === 'tiktok' ? 'rozycosta.original' : '5561888888888';
    } else if (selectedType === 'custom') {
      finalVal = modalUsernameCustom.trim();
      if (!finalVal) {
        Alert.alert('Aviso', 'Por favor, digite o nome de usuário!');
        return;
      }
    }

    let cleanedVal = finalVal;
    if (modalProvider === 'instagram' || modalProvider === 'tiktok') {
      if (cleanedVal.startsWith('@')) {
        cleanedVal = cleanedVal.substring(1);
      }
    }

    setModalSubmitting(true);
    setTimeout(() => {
      setModalSubmitting(false);
      setModalSuccess(true);

      setTimeout(() => {
        if (modalProvider === 'instagram') setInstagram(cleanedVal);
        else if (modalProvider === 'facebook') setFacebook(cleanedVal);
        else if (modalProvider === 'tiktok') setTiktok(cleanedVal);
        else if (modalProvider === 'whatsapp') setWhatsapp(cleanedVal);

        setModalVisible(false);
      }, 800);
    }, 1500);
  }

  function getProviderColor(provider) {
    if (provider === 'instagram') return '#E1306C';
    if (provider === 'facebook') return '#1877F2';
    if (provider === 'tiktok') return '#25F4EE';
    if (provider === 'whatsapp') return '#25D366';
    return COLORS.teal;
  }
  function getProviderIcon(provider) {
    if (provider === 'instagram') return '📸';
    if (provider === 'facebook') return '👥';
    if (provider === 'tiktok') return '🎵';
    if (provider === 'whatsapp') return '📞';
    return '💬';
  }
  function getProviderName(provider) {
    if (provider === 'instagram') return 'Instagram';
    if (provider === 'facebook') return 'Facebook';
    if (provider === 'tiktok') return 'TikTok';
    if (provider === 'whatsapp') return 'WhatsApp';
    return '';
  }

  useEffect(() => {
    (async () => {
      const [settings, count] = await Promise.all([fetchAppSettings(), fetchTotalUsersCount()]);
      if (settings) setAppDomain(settings.app_domain);
      setTotalUsers(count);
    })();
  }, []);

  const referralLink = `https://${appDomain}/${profile.username || profile.id}`;
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
      Alert.alert('Imagem muito grande', `Essa foto tem ${(asset.fileSize / 1024).toFixed(0)} KB. O limite é 200 KB. Escolha uma foto menor.`);
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      if (blob.size > MAX_PHOTO_BYTES) {
        Alert.alert('Imagem muito grande', `Essa foto tem ${(blob.size / 1024).toFixed(0)} KB. O limite é 200 KB.`);
        setUploading(false);
        return;
      }
      const ext = asset.uri.split('.').pop().toLowerCase();
      const path = `${profile.auth_id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
      if (uploadError) {
        if (uploadError.message && uploadError.message.toLowerCase().includes('exceed')) {
          Alert.alert('Imagem muito grande', 'O servidor recusou o arquivo: limite de 200 KB por foto.');
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

  async function copyLink() {
    await Clipboard.setStringAsync(referralLink);
    Alert.alert('Copiado', 'Link de indicação copiado.');
  }

  async function shareWhatsApp() {
    const msg = `Venha fazer parte do Amigos Dr. Cândido! Cadastre-se pelo meu link de indicação: ${referralLink}`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`);
      }
    } catch (e) {
      await Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`);
    }
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
        <Text style={styles.hint}>Toque para escolher uma foto da galeria (máx. 200 KB)</Text>
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={{ fontSize: 13, color: COLORS.teal, fontWeight: '600', marginTop: 2, marginBottom: 4 }}>@{profile.username || 'sem_usuario'}</Text>
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
        <View style={styles.inputRow}>
          <TextInput style={[S.input, { flex: 1, marginBottom: 0 }]} value={instagram} onChangeText={setInstagram} placeholder="@usuario" placeholderTextColor={COLORS.ink3} autoCapitalize="none" autoCorrect={false} />
        </View>

        <Text style={S.label}>Facebook</Text>
        <View style={styles.inputRow}>
          <TextInput style={[S.input, { flex: 1, marginBottom: 0 }]} value={facebook} onChangeText={setFacebook} placeholder="Seu nome no Facebook" placeholderTextColor={COLORS.ink3} autoCorrect={false} />
        </View>

        <Text style={S.label}>TikTok</Text>
        <View style={styles.inputRow}>
          <TextInput style={[S.input, { flex: 1, marginBottom: 0 }]} value={tiktok} onChangeText={setTiktok} placeholder="@usuario" placeholderTextColor={COLORS.ink3} autoCapitalize="none" autoCorrect={false} />
        </View>

        <Text style={S.label}>WhatsApp</Text>
        <View style={styles.inputRow}>
          <TextInput style={[S.input, { flex: 1, marginBottom: 0 }]} value={whatsapp} onChangeText={setWhatsapp} placeholder="5561999999999" placeholderTextColor={COLORS.ink3} keyboardType="phone-pad" />
        </View>

        <TouchableOpacity style={[S.btn, S.btnTeal]} onPress={saveSocials}>
          <Text style={S.btnTextDark}>Salvar redes sociais</Text>
        </TouchableOpacity>
      </View>

      <Text style={S.cardTitle}>Link de indicação</Text>
      <View style={S.card}>
        <View style={[styles.linkBox, { flexDirection: 'row', alignItems: 'center' }]}>
          <TouchableOpacity style={{ flex: 1 }} onPress={copyLink}>
            <Text style={styles.linkText} numberOfLines={1}>{referralLink}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 4 }} onPress={shareWhatsApp}>
            <FontAwesome name="whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>

          <TouchableOpacity style={{ paddingLeft: 6, paddingVertical: 4 }} onPress={copyLink}>
            <Text style={{ fontSize: 16 }}>📋</Text>
          </TouchableOpacity>
        </View>
        <Text style={S.muted}>Toque no link acima para copiar o seu endereço de indicação direta.</Text>
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

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={[styles.iconContainer, { backgroundColor: getProviderColor(modalProvider) }]}>
              <Text style={{ fontSize: 32, color: '#fff' }}>{getProviderIcon(modalProvider)}</Text>
            </View>
            <Text style={styles.modalTitle}>Vincular {getProviderName(modalProvider)}</Text>
            <Text style={styles.modalDesc}>
              {modalProvider === 'whatsapp' 
                ? 'Verifique e autorize o número do seu celular para contato direto.' 
                : `Autorize Amigos Dr Candido a obter seu @ do ${getProviderName(modalProvider)} de forma simulada e segura.`}
            </Text>

            <View style={styles.sandboxSelection}>
              <Text style={{ fontSize: 11, marginBottom: 10, color: COLORS.ink3, textAlign: 'center' }}>
                Selecione a conta ativa detectada:
              </Text>
              
              <TouchableOpacity 
                style={[styles.accountItem, selectedType === 'main' && styles.accountItemActive]} 
                onPress={() => setSelectedType('main')}
              >
                <View style={[styles.avatarCircleSm, { borderColor: getProviderColor(modalProvider) }]}>
                  <Text style={{ fontSize: 16 }}>{getProviderIcon(modalProvider)}</Text>
                </View>
                <View style={styles.accountDetails}>
                  <Text style={styles.accountHandle}>
                    {(modalProvider === 'instagram' || modalProvider === 'tiktok') 
                      ? (modalUsernameMain.startsWith('@') ? modalUsernameMain : '@' + modalUsernameMain) 
                      : modalUsernameMain}
                  </Text>
                  <Text style={styles.accountInfo}>Sua conta ativa neste dispositivo</Text>
                </View>
                <View style={[styles.radioDot, selectedType === 'main' && styles.radioDotActive]}>
                  {selectedType === 'main' && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.teal }} />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.accountItem, selectedType === 'alt1' && styles.accountItemActive]} 
                onPress={() => setSelectedType('alt1')}
              >
                <View style={[styles.avatarCircleSm, { borderColor: getProviderColor(modalProvider) }]}>
                  <Text style={{ fontSize: 16 }}>{getProviderIcon(modalProvider)}</Text>
                </View>
                <View style={styles.accountDetails}>
                  <Text style={styles.accountHandle}>
                    {modalProvider === 'instagram' ? '@dr.candido' : modalProvider === 'facebook' ? 'Dr. Cândido Oficial' : modalProvider === 'tiktok' ? '@dr.candido.oficial' : '5561999999999'}
                  </Text>
                  <Text style={styles.accountInfo}>Outra conta salva</Text>
                </View>
                <View style={[styles.radioDot, selectedType === 'alt1' && styles.radioDotActive]}>
                  {selectedType === 'alt1' && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.teal }} />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.accountItem, selectedType === 'alt2' && styles.accountItemActive]} 
                onPress={() => setSelectedType('alt2')}
              >
                <View style={[styles.avatarCircleSm, { borderColor: getProviderColor(modalProvider) }]}>
                  <Text style={{ fontSize: 16 }}>{getProviderIcon(modalProvider)}</Text>
                </View>
                <View style={styles.accountDetails}>
                  <Text style={styles.accountHandle}>
                    {modalProvider === 'instagram' ? '@rozycosta' : modalProvider === 'facebook' ? 'Rozy Costa' : modalProvider === 'tiktok' ? '@rozycosta.original' : '5561888888888'}
                  </Text>
                  <Text style={styles.accountInfo}>Outra conta salva</Text>
                </View>
                <View style={[styles.radioDot, selectedType === 'alt2' && styles.radioDotActive]}>
                  {selectedType === 'alt2' && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.teal }} />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.accountItem, selectedType === 'custom' && styles.accountItemActive]} 
                onPress={() => setSelectedType('custom')}
              >
                <View style={styles.avatarCircleSm}>
                  <Text style={{ fontSize: 16 }}>✏️</Text>
                </View>
                <View style={styles.accountDetails}>
                  <Text style={styles.accountHandle}>Digitar outra conta...</Text>
                  <Text style={styles.accountInfo}>Preencher um nome de usuário personalizado</Text>
                </View>
                <View style={[styles.radioDot, selectedType === 'custom' && styles.radioDotActive]}>
                  {selectedType === 'custom' && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.teal }} />
                  )}
                </View>
              </TouchableOpacity>

              {selectedType === 'custom' && (
                <TextInput
                  style={[S.input, { marginTop: 4, marginBottom: 0 }]}
                  value={modalUsernameCustom}
                  onChangeText={setModalUsernameCustom}
                  placeholder={modalProvider === 'whatsapp' ? '5561999999999' : 'usuario_personalizado'}
                  placeholderTextColor={COLORS.ink3}
                  keyboardType={modalProvider === 'whatsapp' ? 'phone-pad' : 'default'}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            </View>

            <TouchableOpacity 
              style={[
                styles.modalSubmitBtn, 
                { backgroundColor: modalSuccess ? '#25D366' : getProviderColor(modalProvider) }
              ]} 
              onPress={confirmLink}
              disabled={modalSubmitting || modalSuccess}
            >
              {modalSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>
                  {modalSuccess ? '✓ Vinculado!' : 'Confirmar Vínculo'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)} disabled={modalSubmitting || modalSuccess}>
              <Text style={styles.modalCancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photoRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: COLORS.teal, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: COLORS.panel2, marginBottom: 8 },
  photoImg: { width: '100%', height: '100%' },
  hint: { color: COLORS.ink3, fontSize: 10, marginBottom: 8, textAlign: 'center' },
  name: { color: COLORS.ink1, fontSize: 17, fontWeight: '700' },
  bigCode: { fontFamily: 'monospace', fontSize: 34, fontWeight: '700', color: COLORS.teal, letterSpacing: 1 },
  linkBox: { backgroundColor: 'rgba(0, 242, 254, 0.03)', borderWidth: 1.5, borderColor: 'rgba(0, 242, 254, 0.25)', borderRadius: 12, padding: 12, marginBottom: 8 },
  linkText: { color: COLORS.teal, fontFamily: 'monospace', fontSize: 11.5 },
  inputRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  inlineBtn: {
    position: 'absolute',
    right: 6,
    backgroundColor: COLORS.tealDim,
    borderColor: 'rgba(61, 217, 179, 0.3)',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  inlineBtnText: {
    color: COLORS.teal,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: COLORS.ink1,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalDesc: {
    color: COLORS.ink3,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  sandboxSelection: {
    width: '100%',
    marginBottom: 20,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.panel2,
    borderColor: COLORS.line,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    width: '100%',
  },
  accountItemActive: {
    borderColor: COLORS.teal,
    backgroundColor: COLORS.tealDim,
  },
  avatarCircleSm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginRight: 10,
  },
  accountDetails: {
    flex: 1,
    alignItems: 'flex-start',
  },
  accountHandle: {
    color: COLORS.ink1,
    fontSize: 14.5,
    fontWeight: '600',
  },
  accountInfo: {
    color: COLORS.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotActive: {
    borderColor: COLORS.teal,
  },
  modalSubmitBtn: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  modalSubmitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalCancelBtn: {
    padding: 10,
  },
  modalCancelBtnText: {
    color: COLORS.ink3,
    fontSize: 13,
    fontWeight: '600',
  },
});
