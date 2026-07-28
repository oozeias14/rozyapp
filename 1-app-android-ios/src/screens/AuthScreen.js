import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView, Image } from 'react-native';
import { supabase } from '../lib/supabase';

// Depois de configurar o site (pasta 2-site-versao-web), troque esta URL
// pelo endereço real dele. É pra lá que o link de "criar nova senha" do
// e-mail vai levar a pessoa — o app nativo não tem como abrir essa tela
// de "definir nova senha" sozinho, então usamos o site para isso.
const PASSWORD_RESET_REDIRECT_URL = 'https://SEUDOMINIO.com';

function translateError(err) {
  if (!err) return '';
  const msg = typeof err === 'string' ? err : (err.message || String(err));
  const lower = msg.toLowerCase();
  
  if (lower.includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor do Supabase. Verifique sua conexão com a internet ou se o seu projeto está pausado/desativado no painel da Supabase (se for plano gratuito, reative-o lá).';
  }
  if (lower.includes('invalid login credentials')) {
    return 'E-mail, nome de usuário ou senha incorretos.';
  }
  if (lower.includes('user already registered') || lower.includes('email already exists') || lower.includes('profiles_email_key')) {
    return 'Este e-mail já está cadastrado por outro usuário.';
  }
  if (lower.includes('profiles_username_key')) {
    return 'Nome de usuário já cadastrado. Tente outro.';
  }
  if (lower.includes('password should be at least')) {
    return 'A senha deve conter pelo menos 6 caracteres.';
  }
  if (lower.includes('invalid email')) {
    return 'Por favor, insira um e-mail válido.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Este e-mail ainda não foi verificado. Por favor, confirme-o na sua caixa de entrada.';
  }
  if (lower.includes('rate limit exceeded') || lower.includes('too many requests')) {
    return 'Muitas solicitações de cadastro em pouco tempo. Por favor, aguarde alguns minutos antes de tentar novamente.';
  }
  return msg;
}

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login'); // login | cadastro
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [refCode, setRefCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  async function handleLogin() {
    setLoading(true);
    let loginEmail = email.trim();
    if (loginEmail && !loginEmail.includes('@')) {
      // É um nome de usuário! Busca o e-mail correspondente
      const { data: foundProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('username', loginEmail.toLowerCase())
        .maybeSingle();
      if (foundProfile) {
        loginEmail = foundProfile.email;
      } else {
        setLoading(false);
        Alert.alert('Erro', 'Cadastro não encontrado para este nome de usuário.');
        return;
      }
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setLoading(false);
    if (error) { Alert.alert('Erro no login', translateError(error)); return; }
    onLoggedIn(data.user);
  }

  async function handleCadastro() {
    if (!username.trim()) {
      Alert.alert('Usuário obrigatório', 'Escolha um nome de usuário para o seu perfil.');
      return;
    }
    if (username.includes(' ')) {
      Alert.alert('Erro no usuário', 'O nome de usuário não pode conter espaços.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      Alert.alert('Erro no usuário', 'Use apenas letras, números, sublinhas (_) ou traços (-).');
      return;
    }

    setLoading(true);

    // Verifica se é o primeiríssimo usuário
    const { data: allProfiles } = await supabase.from('profiles').select('id').limit(1);
    const isFirstUser = !allProfiles || allProfiles.length === 0;

    let refUserId = null;
    let refUser = null;

    if (!isFirstUser) {
      let parsedRef = refCode.trim();
      if (!parsedRef) {
        parsedRef = 'rozycosta';
      }

      if (/^\d+$/.test(parsedRef)) {
        refUserId = parseInt(parsedRef, 10);
      } else {
        const { data: found } = await supabase.from('profiles').select('id').eq('username', parsedRef.toLowerCase()).maybeSingle();
        if (found) {
          refUserId = found.id;
        } else {
          setLoading(false);
          Alert.alert('Indicação inválida', 'Não encontramos nenhuma indicação ativa com este nome de usuário.');
          return;
        }
      }

      // Verifica se o seu próprio username já existe
      const { data: dupUser } = await supabase.from('profiles').select('id').eq('username', username.trim().toLowerCase()).maybeSingle();
      if (dupUser) {
        setLoading(false);
        Alert.alert('Usuário indisponível', 'Este nome de usuário já está em uso.');
        return;
      }

      const { data: fetchedRefUser, error: refErr } = await supabase
        .from('profiles')
        .select('id, role, coord_id')
        .eq('id', refUserId)
        .maybeSingle();

      if (refErr || !fetchedRefUser) {
        setLoading(false);
        Alert.alert('Código inválido', 'Não encontramos nenhum cadastro ativo com este código.');
        return;
      }
      refUser = fetchedRefUser;
    }

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) {
      setLoading(false);
      Alert.alert('Erro ao criar conta', translateError(authErr));
      return;
    }

    let slotId = null;
    let coordId = null;
    let userRole = 'user';

    if (isFirstUser) {
      userRole = 'admin';
    } else {
      const { data: foundSlot } = await supabase.rpc('find_slot', { ref_id: refUser.id });
      slotId = foundSlot;
      coordId = (refUser.role === 'coord' || refUser.role === 'admin') ? refUser.id : refUser.coord_id;
    }

    const { error: profErr } = await supabase.from('profiles').insert({
      auth_id: authData.user.id,
      name,
      email,
      phone,
      role: userRole,
      coord_id: coordId,
      parent_id: slotId,
      username: username.trim().toLowerCase(),
    });

    setLoading(false);
    if (profErr) { Alert.alert('Erro ao salvar cadastro', translateError(profErr)); return; }

    if (isFirstUser) {
      Alert.alert('Parabéns!', 'Você cadastrou a primeira conta e entrou como o Administrador Raiz!');
    } else {
      Alert.alert('Cadastro feito!', slotId !== refUser.id
        ? `Você entrou na rede via indicação (vaga automática #${slotId}).`
        : 'Seu cadastro foi concluído.');
    }
    onLoggedIn(authData.user);
  }

  async function handleForgotPassword() {
    if (!forgotEmail.trim()) { Alert.alert('Digite seu e-mail'); return; }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    });
    setForgotLoading(false);
    if (error) { Alert.alert('Erro ao enviar', translateError(error)); return; }
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
          <Text style={styles.label}>Indicação ( Nome de Usuário ) - Opcional</Text>
          <TextInput style={styles.input} placeholder="Ex: roberto" value={refCode} onChangeText={setRefCode} placeholderTextColor="#56627A" autoCapitalize="none" />
          <Text style={styles.label}>Nome completo</Text>
          <TextInput style={styles.input} placeholder="Seu nome" value={name} onChangeText={setName} placeholderTextColor="#56627A" />
          <Text style={styles.label}>Nome de usuário (sem espaços, para seu link e login)</Text>
          <TextInput style={styles.input} placeholder="Ex: joaosilva" autoCapitalize="none" value={username} onChangeText={(text) => setUsername(text.replace(/\s/g, '').toLowerCase())} placeholderTextColor="#56627A" />
          <Text style={styles.label}>Telefone</Text>
          <TextInput style={styles.input} placeholder="(61) 9 9999-9999" value={phone} onChangeText={setPhone} placeholderTextColor="#56627A" />
        </>
      )}

      <Text style={styles.label}>{mode === 'login' ? 'E-mail ou Nome de usuário' : 'E-mail'}</Text>
      <TextInput style={styles.input} placeholder={mode === 'login' ? 'voce@email.com ou seu_usuario' : 'voce@email.com'} autoCapitalize="none" value={email} onChangeText={setEmail} placeholderTextColor="#56627A" />
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
