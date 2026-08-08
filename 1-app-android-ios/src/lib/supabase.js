import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// CONEXÃO COM O SUPABASE E MOCK LOCAL DE TESTES
// Mude USE_MOCK para false quando quiser se conectar ao banco real.
// ============================================================
const USE_MOCK = false;

const SUPABASE_URL = 'https://sewwoxhttmhjayufrqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3dveGh0dG1oamF5dWZycWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDUyNjMsImV4cCI6MjEwMDc4MTI2M30.xXcEz_5gtKllyJTlhSWGBNkXAaxc2ceVXEdF5hdQaqQ';

const realClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// --- SEED DE DADOS MOCK (Para testes 100% locais offline) ---
const initialProfiles = [
  { id: 1, auth_id: 'admin-uid', name: 'Rozy Costa', email: 'oozeias2024@gmail.com', username: 'rozycosta', role: 'admin', live_enabled: true },
  { id: 2, auth_id: 'coord-uid-1', name: 'Coord Roberto', email: 'roberto@gmail.com', username: 'roberto', role: 'coord', live_enabled: true },
  { id: 3, auth_id: 'user-uid-1', name: 'Membro Alice', email: 'alice@gmail.com', username: 'alice', role: 'user', live_enabled: true }
];

const initialOwnerProfile = {
  id: 1,
  name: 'Dr. Candido',
  bio: '⚖️ Advogado e especialista em regularização fundiária\n🌱 Voz de quem vive e produz no DF\n📍 Pré-candidato a Deputado Distrital',
  instagram: '@drcandidoteles',
  photo_url: null,
  facebook: '',
  tiktok: '',
  whatsapp: '',
  youtube: '',
  instagram_redirects: 0,
  profile_redirects: 0
};

const initialMeetings = [
  { id: 101, title: 'Encontro com Produtores Rurais', date: '2026-08-05', time: '18:00', location: 'Chácara São José - DF', lat: -15.794, lng: -47.882, created_by: 2, status: 'agendada' },
  { id: 102, title: 'Palestra Regularização Fundiária', date: '2026-08-10', time: '19:30', location: 'Auditório Principal', lat: null, lng: null, created_by: 1, status: 'agendada' }
];

const initialMessages = [
  { id: 1, text: 'Olá a todos! Sejam bem-vindos ao aplicativo Órbita. Vamos juntos fortalecer nossa rede de apoio.', from_id: 1, created_at: new Date().toISOString() }
];

// --- IMPLEMENTAÇÃO DO CLIENTE MOCK RN ---
class LocalDataStore {
  constructor() {
    this.storageKey = 'orbita_mock_db';
    this.profiles = [...initialProfiles];
    this.meetings = [...initialMeetings];
    this.messages = [...initialMessages];
    this.owner_profile = [{ ...initialOwnerProfile }];
    this.app_settings = [{ id: 1, app_domain: 'amigosdrcandido.com.br' }];
    this.live_comments = [];
    this.session = null;
    this.load();
  }

  load() {
    AsyncStorage.getItem(this.storageKey)
      .then(saved => {
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.profiles) {
            this.profiles = parsed.profiles.map(p => {
              if (!p.username) {
                p.username = p.email ? p.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') : `user${p.id}`;
              }
              return p;
            });
          }
          if (parsed.meetings) this.meetings = parsed.meetings;
          if (parsed.messages) this.messages = parsed.messages;
          if (parsed.owner_profile) this.owner_profile = Array.isArray(parsed.owner_profile) ? parsed.owner_profile : [parsed.owner_profile];
          if (parsed.app_settings) this.app_settings = Array.isArray(parsed.app_settings) ? parsed.app_settings : [parsed.app_settings];
          if (parsed.live_comments) this.live_comments = parsed.live_comments;
          if (parsed.session) this.session = parsed.session;
          
          // Triga state change callback do auth pra atualizar a view no RN
          if (this.session && mockClient.auth.onStateChangeCallbacks.length > 0) {
            mockClient.auth.onStateChangeCallbacks.forEach(cb => cb('SIGNED_IN', this.session));
          }
        }
        
        // Corrige/atualiza o perfil do proprietário (owner_profile) para Dr. Candido
        if (this.owner_profile && this.owner_profile[0] && this.owner_profile[0].name !== 'Dr. Candido') {
          this.owner_profile[0].name = 'Dr. Candido';
          this.save();
        }

        // Corrige automaticamente o domínio padrão caso o cache antigo esteja carregado
        if (this.app_settings && this.app_settings[0] && (this.app_settings[0].app_domain === 'orbita.app' || this.app_settings[0].app_domain === 'amigosdarozy.com.br')) {
          this.app_settings[0].app_domain = 'amigosdrcandido.com.br';
          this.save();
        }

        // Corrige/atualiza incondicionalmente o username e nome do admin principal no banco local
        if (this.profiles && this.profiles.length > 0) {
          const adminIndex = this.profiles.findIndex(p => p.id === 1);
          if (adminIndex !== -1) {
            let dirty = false;
            if (this.profiles[adminIndex].username !== 'rozycosta') {
              this.profiles[adminIndex].username = 'rozycosta';
              dirty = true;
            }
            if (this.profiles[adminIndex].name !== 'Rozy Costa') {
              this.profiles[adminIndex].name = 'Rozy Costa';
              dirty = true;
            }
            if (dirty) this.save();
          }
        }
      })
      .catch(e => console.log('Erro ao carregar AsyncStorage:', e));
  }

  save() {
    const dataToSave = {
      profiles: this.profiles,
      meetings: this.meetings,
      messages: this.messages,
      owner_profile: this.owner_profile,
      app_settings: this.app_settings,
      live_comments: this.live_comments,
      session: this.session
    };
    AsyncStorage.setItem(this.storageKey, JSON.stringify(dataToSave)).catch(e => console.log('Erro ao salvar AsyncStorage:', e));
  }
}

const mockStore = new LocalDataStore();

class MockQueryBuilder {
  constructor(table, store) {
    this.table = table;
    this.store = store;
    this.filters = [];
    this.orderCol = null;
    this.orderAsc = true;
    this.isSingle = false;
    this.isMaybeSingle = false;
    this.updatePatch = null;
    this.isDelete = false;
    this.isInsert = false;
    this.insertRow = null;
  }

  select(fields) { return this; }
  eq(column, value) { this.filters.push({ column, value }); return this; }
  order(column, options = {}) {
    this.orderCol = column;
    this.orderAsc = options.ascending !== false;
    return this;
  }
  maybeSingle() { this.isMaybeSingle = true; return this; }
  single() { this.isSingle = true; return this; }

  insert(row) {
    this.isInsert = true;
    this.insertRow = row;
    return this;
  }

  update(patch) {
    this.updatePatch = patch;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  // Execução da query (SELECT, INSERT, UPDATE, DELETE)
  then(onfulfilled) {
    let list = [...(this.store[this.table] || [])];
    let result = null;
    let error = null;

    if (this.isInsert) {
      const newId = list.length > 0 ? Math.max(...list.map(x => x.id || 0)) + 1 : 1;
      const finalRow = this.table === 'profiles' ? { live_enabled: true, ...this.insertRow } : this.insertRow;
      const newRow = { 
        id: newId, 
        created_at: new Date().toISOString(),
        ...finalRow 
      };
      list.push(newRow);
      this.store[this.table] = list;
      this.store.save();

      // Trigger de canal realtime de comentários se inseriu comentário
      if (this.table === 'live_comments' && mockClient.realtimeCallback) {
        mockClient.realtimeCallback({
          new: newRow
        });
      }
      result = [newRow];
    } else if (this.updatePatch) {
      if (this.table === 'owner_profile') {
        this.store.owner_profile = [{ ...this.store.owner_profile[0], ...this.updatePatch }];
        this.store.save();
        result = this.store.owner_profile;
      } else {
        let updatedRows = [];
        list = list.map(item => {
          let match = true;
          for (const f of this.filters) {
            if (item[f.column] != f.value) match = false;
          }
          if (match) {
            const updated = { ...item, ...this.updatePatch };
            updatedRows.push(updated);
            return updated;
          }
          return item;
        });
        this.store[this.table] = list;
        this.store.save();
        result = updatedRows;
      }
    } else if (this.isDelete) {
      let remaining = [];
      for (const item of list) {
        let match = true;
        for (const f of this.filters) {
          if (item[f.column] != f.value) match = false;
        }
        if (!match) {
          remaining.push(item);
        }
      }
      this.store[this.table] = remaining;
      this.store.save();
      result = { success: true };
    } else {
      // Filtros do SELECT
      for (const f of this.filters) {
        list = list.filter(item => item[f.column] == f.value);
      }

      // Ordenação
      if (this.orderCol) {
        list.sort((a, b) => {
          let valA = a[this.orderCol];
          let valB = b[this.orderCol];
          if (typeof valA === 'string') {
            return this.orderAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          return this.orderAsc ? valA - valB : valB - valA;
        });
      }

      // Relacionamento de mensagens
      if (this.table === 'messages') {
        list = list.map(item => {
          const sender = this.store.profiles.find(p => p.id === item.from_id);
          return {
            ...item,
            profiles: { name: sender?.name || 'Coordenação' }
          };
        });
      }

      // Relacionamento de live_comments
      if (this.table === 'live_comments') {
        list = list.map(item => {
          const sender = this.store.profiles.find(p => p.id === item.profile_id);
          return {
            ...item,
            profiles: { name: sender?.name || 'Membro' }
          };
        });
      }

      result = list;
      if (this.isSingle || this.isMaybeSingle) {
        result = list.length > 0 ? list[0] : null;
      }
    }

    return Promise.resolve(onfulfilled({ data: result, error }));
  }
}

const mockClient = {
  realtimeCallback: null,

  from(table) {
    return new MockQueryBuilder(table, mockStore);
  },

  async rpc(func, args) {
    if (func === 'increment_instagram_redirects') {
      mockStore.owner_profile.instagram_redirects = (mockStore.owner_profile.instagram_redirects || 0) + 1;
      mockStore.save();
      return { error: null };
    }
    if (func === 'increment_profile_redirects') {
      mockStore.owner_profile.profile_redirects = (mockStore.owner_profile.profile_redirects || 0) + 1;
      mockStore.save();
      return { error: null };
    }
    if (func === 'find_slot') {
      return { data: args.ref_id, error: null };
    }
    return { error: null };
  },

  auth: {
    onStateChangeCallbacks: [],

    async getSession() {
      return { data: { session: mockStore.session }, error: null };
    },

    onAuthStateChange(callback) {
      this.onStateChangeCallbacks.push(callback);
      if (mockStore.session) {
        callback('SIGNED_IN', mockStore.session);
      } else {
        callback('SIGNED_OUT', null);
      }
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              this.onStateChangeCallbacks = this.onStateChangeCallbacks.filter(c => c !== callback);
            }
          }
        }
      };
    },

    async signUp({ email, password }) {
      const input = (email || '').trim().toLowerCase();
      const exists = mockStore.profiles.some(p => p.email.toLowerCase() === input);
      if (exists) {
        return { data: { user: null }, error: new Error('E-mail já cadastrado.') };
      }
      const mockUid = 'user-' + Math.random().toString(36).substring(2, 11);
      const user = { id: mockUid, email };
      return { data: { user }, error: null };
    },

    async signInWithPassword({ email, password }) {
      const input = (email || '').trim().toLowerCase();
      const user = mockStore.profiles.find(p => p.email.toLowerCase() === input || (p.username && p.username.toLowerCase() === input));
      if (!user) {
        return { data: { session: null }, error: new Error('Cadastro não encontrado.') };
      }
      if (password !== '123456') {
        return { data: { session: null }, error: new Error('Senha incorreta. Use 123456 para testes locais.') };
      }
      const session = {
        user: { id: user.auth_id, email: user.email },
        access_token: 'mock-local-token'
      };
      mockStore.session = session;
      mockStore.save();

      this.onStateChangeCallbacks.forEach(cb => cb('SIGNED_IN', session));
      return { data: { session, user: session.user }, error: null };
    },

    async signOut() {
      mockStore.session = null;
      mockStore.save();
      this.onStateChangeCallbacks.forEach(cb => cb('SIGNED_OUT', null));
      return { error: null };
    },

    async updateUser({ password }) {
      return { data: {}, error: null };
    }
  },

  storage: {
    from(bucket) {
      return {
        async upload(path, file, opts) {
          return { data: { path }, error: null };
        },
        getPublicUrl(path) {
          let url = 'https://picsum.photos/300/300';
          if (path.includes('presence_list')) {
            url = 'https://picsum.photos/400/600';
          }
          return { data: { publicUrl: url } };
        }
      };
    }
  },

  channel(chan) {
    return {
      on(event, filter, callback) {
        mockClient.realtimeCallback = callback;
        return this;
      },
      subscribe() {
        return this;
      }
    };
  },

  removeChannel(chan) {
    mockClient.realtimeCallback = null;
  }
};

export const supabase = USE_MOCK ? mockClient : realClient;

export const MAX_PHOTO_BYTES = 200 * 1024; // 200 KB
