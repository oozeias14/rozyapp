import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import TopBar from '../components/TopBar';
import { COLORS, S } from '../theme';
import { fetchTotalUsersCount } from '../lib/api';

export default function MassSignupScreen({ profile }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Indicator search states
  const [refSearch, setRefSearch] = useState('');
  const [selectedRef, setSelectedRef] = useState(null);
  const [foundIndicators, setFoundIndicators] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const count = await fetchTotalUsersCount();
        setTotalUsers(count);
      } catch (e) {
        console.log(e);
      }
    })();
  }, []);

  // Search indicators
  useEffect(() => {
    if (selectedRef) {
      setFoundIndicators([]);
      setShowDropdown(false);
      return;
    }
    if (refSearch.trim().length < 3) {
      setFoundIndicators([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const query = refSearch.trim();
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, username, role, coord_id')
          .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(6);

        if (!error && data) {
          setFoundIndicators(data);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Error searching indicators:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [refSearch, selectedRef]);

  function handlePhoneChange(val) {
    let cleaned = val.replace(/\D/g, '');
    if (cleaned.length > 11) cleaned = cleaned.slice(0, 11);
    
    if (cleaned.length > 10) {
      setPhone(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`);
    } else if (cleaned.length > 6) {
      setPhone(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`);
    } else if (cleaned.length > 2) {
      setPhone(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`);
    } else {
      setPhone(cleaned);
    }
  }

  function generateBaseUsername(fullName) {
    const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (parts.length === 0) return '';
    if (parts.length === 1) return normalize(parts[0]);
    return normalize(parts[0]) + normalize(parts[1]);
  }

  async function handleCadastro() {
    if (!selectedRef) {
      Alert.alert('Aviso', 'Por favor, busque e selecione um indicador.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Aviso', 'Preencha o nome completo.');
      return;
    }
    const cleanedPhone = phone.trim().replace(/\D/g, '');
    if (!cleanedPhone) {
      Alert.alert('Aviso', 'Preencha o WhatsApp.');
      return;
    }
    // Email is auto-generated below after username generation

    setLoading(true);

    try {
      // 1) Verify WhatsApp uniqueness
      const { data: dupPhone } = await supabase
        .from('profiles')
        .select('id')
        .eq('whatsapp', cleanedPhone)
        .maybeSingle();

      if (dupPhone) {
        Alert.alert('Erro', 'Este número de WhatsApp já está sendo usado por outra conta.');
        setLoading(false);
        return;
      }

      // 2) Generate username
      const baseUsername = generateBaseUsername(name);
      let finalUsername = baseUsername;
      let suffix = 1;
      let usernameTaken = true;

      while (usernameTaken) {
        const { data: dupUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', finalUsername)
          .maybeSingle();

        if (dupUser) {
          finalUsername = `${baseUsername}${suffix}`;
          suffix++;
        } else {
          usernameTaken = false;
        }
      }

      const cleanedEmail = `${finalUsername}@amigosdrcandido.com.br`;

      // 3) Supabase Signup using a temporary client with session persistence disabled
      const tempSupabase = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
        email: cleanedEmail,
        password: '123456'
      });

      if (authErr) {
        Alert.alert('Erro ao criar autenticação', authErr.message);
        setLoading(false);
        return;
      }

      // 4) Find slot in tree
      const { data: foundSlot, error: slotErr } = await supabase.rpc('find_slot', { ref_id: selectedRef.id });
      if (slotErr) {
        Alert.alert('Erro ao posicionar na árvore', slotErr.message);
        setLoading(false);
        return;
      }

      const coordId = (selectedRef.role === 'coord' || selectedRef.role === 'admin') ? selectedRef.id : selectedRef.coord_id;

      // 5) Insert Profile
      const { error: profErr } = await supabase.from('profiles').insert({
        auth_id: authData.user.id,
        name: name.trim(),
        email: cleanedEmail,
        phone: cleanedPhone,
        whatsapp: cleanedPhone,
        role: 'user',
        coord_id: coordId,
        parent_id: foundSlot,
        referrer_id: selectedRef.id,
        username: finalUsername
      });

      if (profErr) {
        Alert.alert('Erro ao salvar perfil', profErr.message);
        setLoading(false);
        return;
      }

      // Success Callback
      setSuccessData({
        name: name.trim(),
        username: finalUsername,
        password: '123456'
      });

      // Clear fields
      setName('');
      setPhone('');
      setEmail('');
      
      const newCount = await fetchTotalUsersCount();
      setTotalUsers(newCount);

    } catch (err) {
      Alert.alert('Erro inesperado', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={S.screen} keyboardShouldPersistTaps="handled">
      <TopBar totalUsers={totalUsers} />

      <View style={[S.card, { borderColor: 'rgba(123, 108, 244, 0.25)', borderWidth: 1.5, padding: 18, marginTop: 10 }]}>
        <Text style={[S.cardTitle, { color: COLORS.violet, fontSize: 13, marginBottom: 14 }]}>⚡ Cadastro em Massa de Membros</Text>

        {/* Search Indicator */}
        <Text style={S.label}>Buscar Indicador *</Text>
        <View style={{ zIndex: 10, position: 'relative', marginBottom: 14 }}>
          <TextInput
            style={S.input}
            placeholder="Digite ao menos 3 letras do nome ou username..."
            placeholderTextColor={COLORS.ink3}
            value={refSearch}
            onChangeText={(text) => {
              setRefSearch(text);
              if (selectedRef) setSelectedRef(null);
            }}
          />
          {selectedRef && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedText}>✓ {selectedRef.name} (@{selectedRef.username})</Text>
              <TouchableOpacity onPress={() => { setSelectedRef(null); setRefSearch(''); }}>
                <Text style={{ color: COLORS.warn, fontWeight: '700', marginLeft: 8 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {showDropdown && foundIndicators.length > 0 && (
            <View style={styles.dropdown}>
              {foundIndicators.map((ind) => (
                <TouchableOpacity
                  key={ind.id}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedRef(ind);
                    setRefSearch(`@${ind.username} - ${ind.name}`);
                    setShowDropdown(false);
                  }}
                >
                  <Text style={{ color: COLORS.ink1, fontSize: 13 }}>
                    <Text style={{ fontWeight: '700' }}>@{ind.username}</Text> - {ind.name}
                  </Text>
                  <Text style={styles.idBadge}>#{ind.id}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {showDropdown && foundIndicators.length === 0 && (
            <View style={styles.dropdown}>
              <Text style={{ color: COLORS.ink3, fontSize: 12, padding: 12 }}>Nenhum indicador encontrado.</Text>
            </View>
          )}
        </View>

        <Text style={S.label}>Nome Completo do Novo Membro *</Text>
        <TextInput
          style={S.input}
          placeholder="Nome Completo"
          placeholderTextColor={COLORS.ink3}
          value={name}
          onChangeText={setName}
        />

        <Text style={S.label}>WhatsApp *</Text>
        <TextInput
          style={S.input}
          placeholder="(61) 99999-9999"
          placeholderTextColor={COLORS.ink3}
          value={phone}
          onChangeText={handlePhoneChange}
          keyboardType="phone-pad"
        />

        {/* Email input removed - auto-generated from username */}

        <TouchableOpacity style={[S.btn, S.btnTeal, { marginTop: 10 }]} onPress={handleCadastro} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#051A14" />
          ) : (
            <Text style={S.btnTextDark}>Cadastrar Membro</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Success Modal */}
      <Modal visible={!!successData} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 44, marginBottom: 12, textAlign: 'center' }}>🎉</Text>
            <Text style={styles.modalTitle}>Cadastro Realizado!</Text>

            <View style={styles.detailsBox}>
              <Text style={styles.detailsText}>Nome: <Text style={{ color: COLORS.ink1, fontWeight: '700' }}>{successData?.name}</Text></Text>
              <Text style={styles.detailsText}>Usuário: <Text style={{ color: COLORS.teal, fontWeight: '700' }}>@{successData?.username}</Text></Text>
              <Text style={styles.detailsText}>Senha padrão: <Text style={{ color: COLORS.ink1, fontWeight: '700' }}>{successData?.password}</Text></Text>
            </View>

            <Text style={styles.modalDesc}>
              O membro foi cadastrado e posicionado na rede. Informe os dados de acesso acima.
            </Text>

            <TouchableOpacity style={[S.btn, S.btnGhost, { width: '100%', marginBottom: 0 }]} onPress={() => setSuccessData(null)}>
              <Text style={S.btnTextGhost}>Fechar e Próximo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  selectedBadge: {
    position: 'absolute',
    right: 10,
    top: 9,
    backgroundColor: COLORS.tealDim,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(61, 217, 179, 0.3)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedText: {
    color: COLORS.teal,
    fontSize: 11,
    fontWeight: '700',
  },
  dropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderWidth: 1.5,
    borderRadius: 12,
    zIndex: 1000,
    maxHeight: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  idBadge: {
    fontSize: 9,
    color: COLORS.ink2,
    backgroundColor: COLORS.panel2,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.line,
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    color: COLORS.teal,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  detailsBox: {
    backgroundColor: COLORS.panel2,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  detailsText: {
    fontSize: 12.5,
    color: COLORS.ink2,
    marginBottom: 5,
  },
  modalDesc: {
    color: COLORS.ink2,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
});
