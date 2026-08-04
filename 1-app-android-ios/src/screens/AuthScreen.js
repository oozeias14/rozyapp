import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView, Image, Linking } from 'react-native';
import { supabase } from '../lib/supabase';

// Depois de configurar o site (pasta 2-site-versao-web), troque esta URL
// pelo endereço real dele. É pra lá que o link de "criar nova senha" do
// e-mail vai levar a pessoa — o app nativo não tem como abrir essa tela
// de "definir nova senha" sozinho, então usamos o site para isso.
const PASSWORD_RESET_REDIRECT_URL = 'https://SEUDOMINIO.com';

function translateError(err) {
  if (!err) return '';
  let msg = '';
  if (typeof err === 'string') {
    msg = err;
  } else {
    msg = err.message || err.error_description || err.error || String(err);
    if (msg === '[object Object]' || msg === '{}') {
      try {
        const keys = Object.keys(err);
        if (keys.length > 0) {
          msg = keys.map(k => `${k}: ${err[k]}`).join(', ');
        } else {
          msg = 'Erro interno do servidor (Verifique se as configurações de SMTP/Porta do Resend no seu Supabase estão corretas).';
        }
      } catch(e) {
        msg = String(err);
      }
    }
  }
  const lower = msg.toLowerCase();
  
  if (lower.includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor do Supabase. Verifique sua conexão com a internet ou se o seu projeto está pausado/desativado no painel da Supabase (se for plano gratuito, reative-o lá).';
  }
  if (lower.includes('authretryablefetcherror')) {
    return 'Erro de conexão no servidor de autenticação. Por favor, verifique se a Porta do SMTP nas configurações do Supabase está como 587 (STARTTLS) e se a senha do Resend está correta.';
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
  if (lower.includes('password should be at least') || lower.includes('signup requires a valid password')) {
    return 'A senha deve conter pelo menos 6 caracteres.';
  }
  if (lower.includes('invalid email') || lower.includes('signup requires a valid email')) {
    return 'Por favor, insira um e-mail válido.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Este e-mail ainda não foi verificado. Por favor, confirme-o na sua caixa de entrada.';
  }
  if (lower.includes('rate limit exceeded') || lower.includes('too many requests')) {
    return 'Muitas solicitações de cadastro em pouco tempo. Por favor, aguarde alguns minutos antes de tentar novamente.';
  }
  if (lower.includes('network request failed')) {
    return 'Falha na conexão de rede. Verifique se está conectado à internet.';
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

  const [isUsernameManual, setIsUsernameManual] = useState(false);

  function generateBaseUsername(fullName) {
    const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (parts.length === 1) {
      return normalize(parts[0]);
    }
    return normalize(parts[0]) + normalize(parts[1]);
  }

  function handleNameChange(val) {
    setName(val);
    if (!isUsernameManual) {
      setUsername(generateBaseUsername(val));
    }
  }

  function handleUsernameChange(val) {
    const cleaned = val.replace(/\s/g, '').toLowerCase();
    setUsername(cleaned);
    if (!cleaned) {
      setIsUsernameManual(false);
    } else {
      setIsUsernameManual(true);
    }
  }

  async function handleLogin() {
    setLoading(true);
    try {
      let loginEmail = email.trim();
      if (loginEmail && !loginEmail.includes('@')) {
        // É um nome de usuário! Busca o e-mail correspondente
        const { data: foundProfile, error: profileError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', loginEmail.toLowerCase())
          .maybeSingle();

        if (profileError) {
          setLoading(false);
          Alert.alert('Erro ao buscar usuário', translateError(profileError));
          return;
        }

        if (foundProfile) {
          loginEmail = foundProfile.email;
        } else {
          setLoading(false);
          Alert.alert('Erro no login', 'Este nome de usuário não existe.');
          return;
        }
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      setLoading(false);
      if (error) { Alert.alert('Erro no login', translateError(error)); return; }
      onLoggedIn(data.user);
    } catch (err) {
      setLoading(false);
      Alert.alert('Erro inesperado', err.message);
    }
  }

  async function handleCadastro() {
    // Clean and sanitize spaces from inputs
    const cleanedUsername = username.trim().toLowerCase().replace(/\s/g, '');
    const cleanedRefCode = refCode.trim().replace(/\s/g, '');
    const cleanedPhone = phone.trim().replace(/\s/g, '');
    const cleanedEmail = email.trim().toLowerCase();

    if (!name.trim()) {
      Alert.alert('Nome obrigatório', 'Preencha o seu nome completo.');
      return;
    }
    if (!cleanedUsername) {
      Alert.alert('Usuário obrigatório', 'Escolha um nome de usuário para o seu perfil.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanedUsername)) {
      Alert.alert('Erro no usuário', 'Use apenas letras, números, sublinhas (_) ou traços (-).');
      return;
    }

    if (!cleanedPhone) {
      Alert.alert('WhatsApp obrigatório', 'Preencha o campo de WhatsApp.');
      return;
    }

    if (!cleanedEmail) {
      Alert.alert('E-mail obrigatório', 'Preencha o campo de e-mail.');
      return;
    }
    if (email.includes(' ')) {
      Alert.alert('E-mail inválido', 'O e-mail não pode conter espaços.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      Alert.alert('E-mail inválido', 'Verifique o formato digitado (ex: nome@email.com).');
      return;
    }

    setLoading(true);

    // 1) Encontra uma versão sequencial do username livre no banco
    let finalUsername = cleanedUsername;
    let suffix = 1;
    let usernameTaken = true;

    while (usernameTaken) {
      const { data: dupUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', finalUsername)
        .maybeSingle();

      if (dupUser) {
        finalUsername = `${cleanedUsername}${suffix}`;
        suffix++;
      } else {
        usernameTaken = false;
      }
    }

    // O usuário 'rozycosta' é o Administrador Raiz do sistema
    const isFirstUser = finalUsername === 'rozycosta';

    let refUserId = null;
    let refUser = null;

    if (!isFirstUser) {
      let parsedRef = cleanedRefCode;
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

      const { data: fetchedRefUser, error: refErr } = await supabase
        .from('profiles')
        .select('id, role, coord_id, phone')
        .eq('id', refUserId)
        .maybeSingle();

      if (refErr || !fetchedRefUser) {
        setLoading(false);
        Alert.alert('Código inválido', 'Não encontramos nenhum cadastro ativo com este código.');
        return;
      }
      refUser = fetchedRefUser;
    }

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email: cleanedEmail, password: '123456' });
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
      email: cleanedEmail,
      phone: cleanedPhone,
      role: userRole,
      coord_id: coordId,
      parent_id: slotId,
      referrer_id: isFirstUser ? null : refUser.id,
      username: finalUsername,
    });

    setLoading(false);
    if (profErr) { Alert.alert('Erro ao salvar cadastro', translateError(profErr)); return; }

    // Fetch the admin's phone number dynamically from owner_profile
    let adminPhone = '';
    const { data: ownerProfile } = await supabase
      .from('owner_profile')
      .select('whatsapp')
      .eq('id', 1)
      .maybeSingle();

    if (ownerProfile) {
      adminPhone = ownerProfile.whatsapp;
    }

    const messageText = `Olá! Acabei de fazer meu cadastro no Amigos Dr Candido. *Meu usuário:* ${finalUsername} *Minha senha padrão:* 123456`;

    let waPhone = adminPhone.replace(/\D/g, '');
    if (waPhone.length === 10 || waPhone.length === 11) {
      waPhone = '55' + waPhone;
    }

    if (isFirstUser) {
      await supabase.from('owner_profile').update({ whatsapp: cleanedPhone }).eq('id', 1);
      Alert.alert('Parabéns!', 'Você cadastrou a primeira conta e entrou como o Administrador Raiz!');
    } else {
      if (waPhone) {
        Alert.alert(
          'Cadastro feito com sucesso!',
          `Seu nome de usuário é: ${finalUsername}\nSua senha padrão é: 123456.\n\nClique em OK para mandar uma mensagem no WhatsApp do Administrador.`,
          [
            {
              text: 'OK',
              onPress: () => {
                Linking.openURL(`https://wa.me/${waPhone}?text=${encodeURIComponent(messageText)}`).catch(err => {
                  console.log('Erro ao abrir WhatsApp:', err);
                });
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Cadastro feito com sucesso!',
          `Seu nome de usuário é: ${finalUsername}\nSua senha padrão é: 123456.`
        );
      }
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
          <TextInput style={styles.input} placeholder="Seu nome" value={name} onChangeText={handleNameChange} placeholderTextColor="#56627A" />

          <Text style={styles.label}>WhatsApp</Text>
          <TextInput style={styles.input} placeholder="(61) 9 9999-9999" value={phone} onChangeText={setPhone} placeholderTextColor="#56627A" />
        </>
      )}

      <Text style={styles.label}>{mode === 'login' ? 'E-mail ou Nome de usuário' : 'E-mail'}</Text>
      <TextInput style={styles.input} placeholder={mode === 'login' ? 'voce@email.com ou seu_usuario' : 'voce@email.com'} autoCapitalize="none" value={email} onChangeText={setEmail} placeholderTextColor="#56627A" />
      {mode === 'login' && (
        <>
          <Text style={styles.label}>Senha</Text>
          <TextInput style={styles.input} placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} placeholderTextColor="#56627A" />
        </>
      )}

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
  container: { padding: 24, paddingTop: 25, backgroundColor: '#05070B', flexGrow: 1 },
  logoImg: { width: 350, height: 350, alignSelf: 'center', marginTop: -15, marginBottom: -10 },
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
