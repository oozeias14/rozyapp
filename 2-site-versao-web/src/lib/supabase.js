import { createClient } from '@supabase/supabase-js';

// ============================================================
// CONEXÃO COM O SUPABASE E MOCK LOCAL DE TESTES
// Mude USE_MOCK para false quando quiser se conectar ao banco real.
// ============================================================
const USE_MOCK = false; 

const SUPABASE_URL = 'https://sewwoxhtmhjayufrqfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3dveGh0dG1oamF5dWZycWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDUyNjMsImV4cCI6MjEwMDc4MTI2M30.xXcEz_5gtKllyJTlhSWGBNkXAaxc2ceVXEdF5hdQaqQ';

const realClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- SEED DE DADOS MOCK (Para testes 100% locais offline) ---
const initialProfiles = [
  { id: 1, auth_id: 'admin-uid', name: 'Admin oozeias', email: 'oozeias2024@gmail.com', role: 'admin', live_enabled: true },
  { id: 2, auth_id: 'coord-uid-1', name: 'Coord Roberto', email: 'roberto@gmail.com', role: 'coord', live_enabled: true },
  { id: 3, auth_id: 'user-uid-1', name: 'Membro Alice', email: 'alice@gmail.com', role: 'user', live_enabled: true }
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

// --- IMPLEMENTAÇÃO DO CLIENTE MOCK ---
class LocalDataStore {
  constructor() {
    this.storageKey = 'orbita_mock_db';
    this.profiles = [...initialProfiles];
    this.meetings = [...initialMeetings];
    this.messages = [...initialMessages];
    this.owner_profile = [{ ...initialOwnerProfile }];
    this.app_settings = [{ id: 1, app_domain: 'orbita.app' }];
    this.live_comments = [];
    this.session = null;
    this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.profiles) this.profiles = parsed.profiles;
        if (parsed.meetings) this.meetings = parsed.meetings;
        if (parsed.messages) this.messages = parsed.messages;
        if (parsed.owner_profile) this.owner_profile = Array.isArray(parsed.owner_profile) ? parsed.owner_profile : [parsed.owner_profile];
        if (parsed.app_settings) this.app_settings = Array.isArray(parsed.app_settings) ? parsed.app_settings : [parsed.app_settings];
        if (parsed.live_comments) this.live_comments = parsed.live_comments;
        if (parsed.session) this.session = parsed.session;
      }
      
      // Corrige automaticamente o nome para sem acento caso o cache antigo esteja carregado
      if (this.owner_profile && this.owner_profile[0] && (this.owner_profile[0].name === 'Dr. Cândido' || this.owner_profile[0].name === 'Dr. C\u00e2ndido')) {
        this.owner_profile[0].name = 'Dr. Candido';
        this.save();
      }
    } catch (e) {
      console.log('Erro ao carregar localStorage:', e);
    }
  }

  save() {
    try {
      const dataToSave = {
        profiles: this.profiles,
        meetings: this.meetings,
        messages: this.messages,
        owner_profile: this.owner_profile,
        app_settings: this.app_settings,
        live_comments: this.live_comments,
        session: this.session
      };
      localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
    } catch (e) {
      console.log('Erro ao salvar localStorage:', e);
    }
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

  // Execução da query SELECT
  then(onfulfilled) {
    let list = [...(this.store[this.table] || [])];
    
    // Filtros
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

    let result = list;
    if (this.isSingle || this.isMaybeSingle) {
      result = list.length > 0 ? list[0] : null;
    }

    return Promise.resolve(onfulfilled({ data: result, error: null }));
  }

  async insert(row) {
    const list = this.store[this.table] || [];
    const newId = list.length > 0 ? Math.max(...list.map(x => x.id || 0)) + 1 : 1;
    const newRow = { 
      id: newId, 
      created_at: new Date().toISOString(),
      ...row 
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

    return { data: [newRow], error: null };
  }

  async update(patch) {
    let list = this.store[this.table] || [];
    if (this.table === 'owner_profile') {
      // Owner_profile é um array com um único objeto
      this.store.owner_profile = [{ ...this.store.owner_profile[0], ...patch }];
      this.store.save();
      return { data: this.store.owner_profile, error: null };
    }

    let updatedRows = [];
    list = list.map(item => {
      let match = true;
      for (const f of this.filters) {
        if (item[f.column] != f.value) match = false;
      }
      if (match) {
        const updated = { ...item, ...patch };
        updatedRows.push(updated);
        return updated;
      }
      return item;
    });
    this.store[this.table] = list;
    this.store.save();
    return { data: updatedRows, error: null };
  }

  async delete() {
    let list = this.store[this.table] || [];
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
    return { error: null };
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
      // Retorna o mesmo id indicado como slot livre na árvore
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

    async signInWithPassword({ email, password }) {
      const user = mockStore.profiles.find(p => p.email === email);
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
          // Retorna um link de placeholder de imagem bonito para testes locais
          let url = 'https://picsum.photos/300/300';
          if (path.includes('presence_list')) {
            url = 'https://picsum.photos/400/600'; // tamanho de folha A4
          }
          return { data: { publicUrl: url } };
        }
      };
    }
  },

  // Simulação simplificada de Realtime para comentários do chat local
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

export const MAX_PHOTO_BYTES = 1 * 1024 * 1024; // 1 MB

export function compressImageWeb(file, maxDimension = 500, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}
