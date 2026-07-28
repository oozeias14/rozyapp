import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView, Image } from 'react-native';
import { supabase } from '../lib/supabase';

// Depois de configurar o site (pasta 2-site-versao-web), troque esta URL
// pelo endereço real dele. É pra lá que o link de "criar nova senha" do
// e-mail vai levar a pessoa — o app nativo não tem como abrir essa tela
// de "definir nova senha" sozinho, então usamos o site para isso.
const PASSWORD_RESET_REDIRECT_URL = 'https://SEUDOMINIO.com';

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login'); // login | cadastro
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [refCode, setRefCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  async function handleLogin() {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { Alert.alert('Erro no login', error.message); return; }
    onLoggedIn(data.user);
  }

  async function handleCadastro() {
    if (!refCode.trim()) {
      Alert.alert('Codigo obrigatorio', 'Digite o codigo de indicacao de quem te chamou.');
      return;
    }
    setLoading(true);

    // 1) VALIDA se o codigo de indicacao existe de verdade no banco
    const { data: refUser, error: refErr } = await supabase
      .from('profiles')
      .select('id, role, coord_id')
      .eq('id', parseInt(refCode, 10))
      .maybeSingle();

    if (refErr || !refUser) {
      setLoading(false);
      Alert.alert('Codigo invalido', 'Nao encontramos nenhum cadastro com esse codigo de indicacao.');
      return;
    }

    // 2) Cria o usuario no Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) {
      setLoading(false);
      Alert.alert('Erro ao criar conta', authErr.message);
      return;
    }

    // 3) Acha a vaga certa (spillover) chamando a funcao do banco
    const { data: slotId } = await supabase.rpc('find_slot', { ref_id: refUser.id });
    const coordId = (refUser.role === 'coord' || refUser.role === 'admin') ? refUser.id : refUser.coord_id;

    // 4) Cria a linha em profiles
    const { error: profErr } = await supabase.from('profiles').insert({
      auth_id: authData.user.id,
      name,
      email,
      phone,
      role: 'user',
      coord_id: coordId,
      parent_id: slotId,
    });

    setLoading(false);
    if (profErr) { Alert.alert('Erro ao salvar cadastro', profErr.message); return; }

    Alert.alert('Cadastro feito!', slotId !== refUser.id
      ? `Voce entrou na rede via indicacao (vaga automatica #${slotId}).`
      : 'Seu cadastro foi concluido.');
    onLoggedIn(authData.user);
  }

  async function handleForgotPassword() {
    if (!forgotEmail.trim()) { Alert.alert('Digite seu e-mail'); return; }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    });
    setForgotLoading(false);
    if (error) { Alert.alert('Erro ao enviar', error.message); return; }
    Alert.alert(
      'E-mail enviado ✅',
      'Enviamos um link para ' + forgotEmail.trim() + '. Abra esse link (ele vai abrir no navegador) para criar uma nova senha.'
    );
    setForgotOpen(false);
    setForgotEmail('');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, mode === 'login' && styles.tabOn]} onPress={() => { setMode('login'); setForgotOpen(false); }}>
          <Text style={mode === 'login' ? styles.tabTextOn : styles.tabText}>Entrar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'cadastro' && styles.tabOn]} onPress={() => { setMode('cadastro'); setForgotOpen(false); }}>
          <Text style={mode === 'cadastro' ? styles.tabTextOn : styles.tabText}>Cadastrar</Text>
        </TouchableOpacity>
      </View>

      {mode === 'cadastro' && (
        <>
          <Text style={styles.label}>★ Codigo de indicacao (obrigatorio)</Text>
          <TextInput style={styles.input} placeholder="Ex: 2" keyboardType="numeric" value={refCode} onChangeText={setRefCode} placeholderTextColor="#56627A" />
          <Text style={styles.label}>Nome completo</Text>
          <TextInput style={styles.input} placeholder="Seu nome" value={name} onChangeText={setName} placeholderTextColor="#56627A" />
          <Text style={styles.label}>Telefone</Text>
          <TextInput style={styles.input} placeholder="(61) 9 9999-9999" value={phone} onChangeText={setPhone} placeholderTextColor="#56627A" />
        </>
      )}

      <Text style={styles.label}>E-mail</Text>
      <TextInput style={styles.input} placeholder="voce@email.com" autoCapitalize="none" value={email} onChangeText={setEmail} placeholderTextColor="#56627A" />
      <Text style={styles.label}>Senha</Text>
      <TextInput style={styles.input} placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} placeholderTextColor="#56627A" />

      <TouchableOpacity
        style={styles.btn}
        disabled={loading}
        onPress={mode === 'login' ? handleLogin : handleCadastro}
      >
        <Text style={styles.btnText}>{loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar minha conta'}</Text>
      </TouchableOpacity>

      {mode === 'login' && !forgotOpen && (
        <TouchableOpacity onPress={() => setForgotOpen(true)} style={{ marginTop: 4 }}>
          <Text style={styles.forgotLink}>Esqueceu a senha?</Text>
        </TouchableOpacity>
      )}

      {mode === 'login' && forgotOpen && (
        <View style={styles.forgotBox}>
          <Text style={styles.label}>Digite seu e-mail para receber uma nova senha</Text>
          <TextInput style={styles.input} placeholder="voce@email.com" autoCapitalize="none" value={forgotEmail} onChangeText={setForgotEmail} placeholderTextColor="#56627A" />
          <TouchableOpacity style={[styles.btn, styles.btnViolet]} disabled={forgotLoading} onPress={handleForgotPassword}>
            <Text style={styles.btnTextLight}>{forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setForgotOpen(false)} style={{ marginTop: 4 }}>
            <Text style={styles.forgotLink}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, backgroundColor: '#05070B', flexGrow: 1 },
  logoImg: { width: 170, height: 170, alignSelf: 'center', marginBottom: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#1A2235', borderRadius: 12, padding: 3, marginBottom: 18 },
  tab: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: '#3DD9B3' },
  tabText: { color: '#8A94A8', fontWeight: '600' },
  tabTextOn: { color: '#051A14', fontWeight: '700' },
  label: { color: '#8A94A8', fontSize: 11, marginBottom: 4, marginLeft: 2, textTransform: 'uppercase' },
  input: { backgroundColor: '#1A2235', borderWidth: 1, borderColor: '#232C40', color: '#F0F4FA', padding: 12, borderRadius: 12, marginBottom: 12 },
  btn: { backgroundColor: '#3DD9B3', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#051A14', fontWeight: '700' },
  btnViolet: { backgroundColor: '#7B6CF4' },
  btnTextLight: { color: '#fff', fontWeight: '700' },
  forgotLink: { color: '#8A94A8', fontSize: 12.5, textAlign: 'center', textDecorationLine: 'underline' },
  forgotBox: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#232C40', paddingTop: 16 },
});
