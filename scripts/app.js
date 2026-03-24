'use strict';

const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: 'COLE_AQUI_API_KEY',
  authDomain: 'COLE_AQUI_AUTH_DOMAIN',
  projectId: 'COLE_AQUI_PROJECT_ID',
  storageBucket: 'COLE_AQUI_STORAGE_BUCKET',
  messagingSenderId: 'COLE_AQUI_MESSAGING_SENDER_ID',
  appId: 'COLE_AQUI_APP_ID'
};

const SAVE_DEBOUNCE_MS = 650;
const EMOJIS = ['📝', '✅', '🎯', '🚀', '💡', '📌', '🔥', '⭐', '🌿', '📚', '🏆', '🎨'];
const DEFAULT_FONT_THEME = 'executive';
const DEFAULT_COLOR_MODE = 'dark';
const COLOR_MODE_STORAGE_KEY = 'mytasks-color-mode';
const FONT_THEMES = {
  executive: {
    label: 'Executiva',
    body: "'Manrope', sans-serif",
    display: "'Fraunces', serif"
  },
  classic: {
    label: 'Clássica',
    body: "'Source Sans 3', sans-serif",
    display: "'Merriweather', serif"
  },
  modern: {
    label: 'Moderna',
    body: "'Space Grotesk', sans-serif",
    display: "'Space Grotesk', sans-serif"
  }
};

const STORAGE_KEY_PREFIX = getStorageKeyPrefix();
const LEGACY_SCOPED_STORAGE_KEY = getLegacyScopedStorageKey();
const LEGACY_STORAGE_KEYS = ['minhas-tarefas-v3', 'minhas-tarefas-v2'];

const loginScreenEl = document.getElementById('login-screen');
const appRootEl = document.getElementById('app-root');
const loginStatusEl = document.getElementById('login-status');
const loginHelpEl = document.getElementById('login-help');
const blocksEl = document.getElementById('blocks');
const emptyStateEl = document.getElementById('empty-state');
const pageTitleEl = document.getElementById('page-title');
const workspaceIntroEl = document.getElementById('workspace-intro');
const welcomeBadgeEl = document.getElementById('welcome-badge');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const ftb = document.getElementById('floating-toolbar');
const colorPopup = document.getElementById('color-popup');
const doneCountEl = document.getElementById('done-count');
const headerSubEl = document.getElementById('header-sub');
const progressFillEl = document.getElementById('progress-fill');
const progressLabelEl = document.getElementById('progress-label');
const saveStatusEl = document.getElementById('save-status');
const cloudStatusEl = document.getElementById('cloud-status');
const googleLoginBtn = document.getElementById('google-login-btn');
const googleLogoutBtn = document.getElementById('google-logout-btn');
const fontThemeSelectEl = document.getElementById('font-theme-select');
const loginThemeToggleBtn = document.getElementById('login-theme-toggle');
const appThemeToggleBtn = document.getElementById('app-theme-toggle');
const headerUserPhotoEl = document.getElementById('header-user-photo');
const headerUserFallbackEl = document.getElementById('header-user-fallback');
const headerUserNameEl = document.getElementById('header-user-name');
const headerUserEmailEl = document.getElementById('header-user-email');

function createDefaultState() {
  return {
    schemaVersion: 7,
    pageTitle: 'Minhas Tarefas',
    emoji: '📝',
    items: [],
    settings: {
      fontTheme: DEFAULT_FONT_THEME,
      colorMode: readColorModePreference()
    },
    updatedAt: 0
  };
}

let state = createDefaultState();
let dragInfo = null;
let lastRange = null;
let activeRichId = null;
let saveTimer = null;
let saveStatusTimer = null;
let firebaseReady = false;
let firebaseApp = null;
let auth = null;
let db = null;
let currentUser = null;
let boardDocRef = null;
let cloudSaveSeq = 0;
let applyingRemoteState = false;

const THEME_ICONS = {
  light: (
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4.2" stroke-width="1.8"></circle>' +
    '<path d="M12 2.75V5.1M12 18.9v2.35M21.25 12H18.9M5.1 12H2.75M18.54 5.46l-1.66 1.66M7.12 16.88l-1.66 1.66M18.54 18.54l-1.66-1.66M7.12 7.12 5.46 5.46" stroke-width="1.8" stroke-linecap="round"></path>' +
    '</svg>'
  ),
  dark: (
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M20.2 14.2A8.2 8.2 0 1 1 9.8 3.8a7 7 0 1 0 10.4 10.4Z" stroke-width="1.8" stroke-linejoin="round"></path>' +
    '</svg>'
  )
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function getBoardId() {
  const urlBoard = new URLSearchParams(location.search).get('board');
  const base = (urlBoard || location.pathname || 'default')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'default';
}

function getStorageKeyPrefix() {
  const scope = (location.origin + location.pathname + '-' + getBoardId())
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return 'minhas-tarefas-v6-' + (scope || 'default');
}

function getLegacyScopedStorageKey() {
  const scope = (location.origin + location.pathname)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return 'minhas-tarefas-v4-' + (scope || 'default');
}

function getStorageKeyForUser(user = currentUser) {
  const scope = user?.uid ? 'user-' + user.uid : 'guest';
  return STORAGE_KEY_PREFIX + '-' + scope;
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function setSaveStatus(text) {
  saveStatusEl.textContent = text;
}

function setCloudStatus(text) {
  cloudStatusEl.textContent = text;
}

function setAuthenticatedView(isAuthenticated) {
  loginScreenEl.hidden = isAuthenticated;
  appRootEl.hidden = !isAuthenticated;
}

function normalizeColorMode(mode) {
  return mode === 'light' ? 'light' : 'dark';
}

function readColorModePreference() {
  try {
    return normalizeColorMode(localStorage.getItem(COLOR_MODE_STORAGE_KEY) || DEFAULT_COLOR_MODE);
  } catch {
    return DEFAULT_COLOR_MODE;
  }
}

function persistColorModePreference(mode) {
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, normalizeColorMode(mode));
  } catch {}
}

function getFontTheme(themeId = state.settings?.fontTheme) {
  return FONT_THEMES[themeId] || FONT_THEMES[DEFAULT_FONT_THEME];
}

function normalizeSettings(raw) {
  return {
    fontTheme: FONT_THEMES[raw?.fontTheme] ? raw.fontTheme : DEFAULT_FONT_THEME,
    colorMode: normalizeColorMode(raw?.colorMode || readColorModePreference())
  };
}

function applyAppearance() {
  const themeId = state.settings?.fontTheme || DEFAULT_FONT_THEME;
  const colorMode = normalizeColorMode(state.settings?.colorMode);
  const theme = getFontTheme(themeId);
  document.documentElement.style.setProperty('--font-body', theme.body);
  document.documentElement.style.setProperty('--font-display', theme.display);
  document.documentElement.dataset.colorMode = colorMode;
  fontThemeSelectEl.value = themeId;
  persistColorModePreference(colorMode);

  const nextMode = colorMode === 'dark' ? 'light' : 'dark';
  const themeLabel = nextMode === 'light' ? 'Ativar modo claro' : 'Ativar modo escuro';

  [loginThemeToggleBtn, appThemeToggleBtn].filter(Boolean).forEach(button => {
    button.innerHTML = THEME_ICONS[nextMode];
    button.dataset.targetMode = nextMode;
    button.setAttribute('aria-label', themeLabel);
    button.setAttribute('title', themeLabel);
  });
}

function populateFontThemes() {
  fontThemeSelectEl.innerHTML = '';
  Object.entries(FONT_THEMES).forEach(([value, theme]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = theme.label;
    fontThemeSelectEl.appendChild(option);
  });
}

function isPlaceholderValue(value) {
  return typeof value !== 'string' || !value.trim() || /COLE_AQUI|SUBSTITUA|YOUR_/i.test(value);
}

function isFirebaseConfigured() {
  return Boolean(window.firebase)
    && !isPlaceholderValue(FIREBASE_CONFIG.apiKey)
    && !isPlaceholderValue(FIREBASE_CONFIG.authDomain)
    && !isPlaceholderValue(FIREBASE_CONFIG.projectId)
    && !isPlaceholderValue(FIREBASE_CONFIG.appId);
}

function getFirebaseErrorCode(error) {
  return String(error?.code || error?.status || '').toLowerCase();
}

function getCloudErrorMessage(error, action = 'sync') {
  const code = getFirebaseErrorCode(error);

  if (code.includes('permission-denied')) {
    return 'Firestore bloqueou o acesso. Revise as regras do projeto.';
  }

  if (code.includes('failed-precondition')) {
    return 'Firestore ainda nao esta pronto neste projeto.';
  }

  if (code.includes('unauthenticated')) {
    return 'Sua sessao expirou. Entre novamente com Google.';
  }

  if (code.includes('unavailable')) {
    return 'Firebase indisponivel no momento. Tentaremos novamente.';
  }

  if (code.includes('not-found')) {
    return 'Nao encontramos o Firestore deste projeto.';
  }

  if (action === 'save') {
    return 'Nao foi possivel enviar agora. As alteracoes continuam guardadas neste navegador.';
  }

  return 'Nao foi possivel sincronizar agora. Revise o Firestore e tente novamente.';
}

function buildPersistedPayload() {
  const updatedAt = Date.now();
  state.updatedAt = updatedAt;
  return {
    schemaVersion: 7,
    pageTitle: state.pageTitle,
    emoji: state.emoji,
    items: state.items,
    settings: deepClone(state.settings),
    updatedAt
  };
}

function persistLocalPayload(payload, user = currentUser) {
  localStorage.setItem(getStorageKeyForUser(user), JSON.stringify(payload));
}

async function saveToCloud(payload) {
  if (!boardDocRef || !currentUser) return;
  const seq = ++cloudSaveSeq;

  setCloudStatus('Sincronizando com Firebase…');

  try {
    await boardDocRef.set({
      ...payload,
      clientUpdatedAt: payload.updatedAt,
      boardId: getBoardId(),
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      ownerDisplayName: currentUser.displayName || '',
      updatedAtServer: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (seq === cloudSaveSeq) {
      setSaveStatus('Sincronizado');
      setCloudStatus('Dados salvos no Firebase.');
    }
  } catch (error) {
    console.error('Falha ao salvar no Firebase:', error);
    setSaveStatus('Salvo em cache');
    setCloudStatus(getCloudErrorMessage(error, 'save'));
  }
}

async function syncCloudState() {
  if (!boardDocRef) return;

  setCloudStatus('Buscando dados do Firebase…');

  try {
    const snapshot = await boardDocRef.get();
    const cloudRaw = snapshot.exists ? snapshot.data() : null;
    const cloudUpdatedAt = Number(cloudRaw?.clientUpdatedAt || cloudRaw?.updatedAt || 0);
    const localUpdatedAt = Number(state.updatedAt || 0);

    if (cloudRaw && cloudUpdatedAt > localUpdatedAt) {
      applyingRemoteState = true;

      try {
        state = normalizeState(cloudRaw);
        persistLocalPayload(state);
        render();
        autoResize(pageTitleEl);
        setSaveStatus('Baixado da nuvem');
        setCloudStatus('Dados carregados do Firebase.');
      } finally {
        applyingRemoteState = false;
      }

      return;
    }

    await saveStateImmediate();
    setCloudStatus('Dados sincronizados com Firebase.');
  } catch (error) {
    console.error('Falha ao sincronizar com o Firebase:', error);
    setCloudStatus(getCloudErrorMessage(error, 'sync'));
  }
}

async function syncUserProfile(user) {
  if (!db || !user) return;

  const userDocRef = db.collection('users').doc(user.uid);
  await userDocRef.set({
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    lastBoardId: getBoardId(),
    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function getUserDisplayName(user = currentUser) {
  return user?.displayName || user?.email || 'Conta Google';
}

function getUserInitial(user = currentUser) {
  const label = getUserDisplayName(user).trim();
  return (label.charAt(0) || 'U').toUpperCase();
}

function getFirstName(user = currentUser) {
  const name = (user?.displayName || '').trim();
  return name ? name.split(/\s+/)[0] : 'você';
}

function updateUserProfileUI() {
  if (!currentUser) {
    headerUserNameEl.textContent = 'Conta Google';
    headerUserEmailEl.textContent = 'Faça login para continuar';
    headerUserFallbackEl.textContent = 'U';
    headerUserFallbackEl.hidden = false;
    headerUserPhotoEl.hidden = true;
    headerUserPhotoEl.removeAttribute('src');
    return;
  }

  headerUserNameEl.textContent = getUserDisplayName();
  headerUserEmailEl.textContent = currentUser.email || 'Conta conectada';
  headerUserFallbackEl.textContent = getUserInitial();

  if (currentUser.photoURL) {
    headerUserPhotoEl.src = currentUser.photoURL;
    headerUserPhotoEl.hidden = false;
    headerUserFallbackEl.hidden = true;
  } else {
    headerUserPhotoEl.hidden = true;
    headerUserPhotoEl.removeAttribute('src');
    headerUserFallbackEl.hidden = false;
  }
}

function updateWorkspaceCopy() {
  if (!currentUser) {
    welcomeBadgeEl.textContent = 'Painel pessoal';
    workspaceIntroEl.textContent = 'Faça login com Google para abrir a aplicação e sincronizar tudo com o Firebase.';
    return;
  }

  welcomeBadgeEl.textContent = 'Olá, ' + getFirstName();
  workspaceIntroEl.textContent = 'Seu espaço está vinculado à conta Google. Tarefas e preferências visuais são sincronizadas automaticamente.';
}

function updateAuthUI() {
  const configured = isFirebaseConfigured();

  updateUserProfileUI();
  updateWorkspaceCopy();

  if (!configured) {
    setAuthenticatedView(false);
    googleLoginBtn.disabled = true;
    googleLoginBtn.textContent = 'Configurar Firebase';
    googleLogoutBtn.hidden = true;
    loginStatusEl.textContent = 'Edite o arquivo scripts/firebase-config.js para ativar o login com Google.';
    loginHelpEl.textContent = 'Depois, autorize o domínio "' + location.host + '" em Firebase Authentication > Settings > Authorized domains.';
    setSaveStatus('Configure o Firebase');
    setCloudStatus('Firebase não configurado.');
    return;
  }

  googleLoginBtn.disabled = false;
  googleLoginBtn.textContent = 'Entrar com Google';
  loginHelpEl.textContent = 'No GitHub Pages, autorize o domínio "' + location.host + '" em Firebase Authentication > Settings.';

  if (currentUser) {
    setAuthenticatedView(true);
    googleLogoutBtn.hidden = false;
    loginStatusEl.textContent = 'Sessão conectada.';
    return;
  }

  setAuthenticatedView(false);
  googleLogoutBtn.hidden = true;
  loginStatusEl.textContent = 'Use sua conta Google para abrir seu painel sincronizado.';
  setSaveStatus('Aguardando login');
  setCloudStatus('Faça login para sincronizar seus dados.');
}

async function initFirebase() {
  updateAuthUI();

  if (!isFirebaseConfigured()) return;

  try {
    firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    firebaseReady = true;

    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

    auth.onAuthStateChanged(async user => {
      currentUser = user;
      boardDocRef = user ? db.collection('users').doc(user.uid).collection('boards').doc(getBoardId()) : null;
      state = user ? loadState(user) : createDefaultState();
      render();
      autoResize(pageTitleEl);
      updateAuthUI();

      if (user) {
        setSaveStatus('Carregando seus dados…');
        setCloudStatus('Conta conectada. Preparando sincronização…');

        try {
          await syncUserProfile(user);
        } catch (error) {
          console.warn('Não foi possível atualizar o perfil do usuário no Firestore:', error);
          setCloudStatus(getCloudErrorMessage(error, 'save'));
        }

        await syncCloudState();
      } else {
        setSaveStatus(isFirebaseConfigured() ? 'Aguardando login' : 'Configure o Firebase');
      }
    });
  } catch (error) {
    console.error('Falha ao iniciar Firebase:', error);
    firebaseReady = false;
    loginStatusEl.textContent = 'Não foi possível iniciar o Firebase com a configuração atual.';
    loginHelpEl.textContent = 'Revise scripts/firebase-config.js e as permissões do projeto no console do Firebase.';
    setSaveStatus('Erro de inicialização');
    setCloudStatus('Não foi possível iniciar o Firebase.');
  }
}

async function handleGoogleLogin() {
  if (!isFirebaseConfigured()) {
    alert('Preencha o arquivo scripts/firebase-config.js antes de usar o login com Google.');
    return;
  }

  if (!firebaseReady || !auth) {
    loginStatusEl.textContent = 'O Firebase ainda está inicializando. Tente novamente em alguns segundos.';
    return;
  }

  googleLoginBtn.disabled = true;
  googleLoginBtn.textContent = 'Abrindo Google…';
  loginStatusEl.textContent = 'Conclua a autenticação na janela do Google.';
  setCloudStatus('Autenticando com Google…');

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.error('Falha no login com Google:', error);
    loginStatusEl.textContent = 'Não foi possível entrar agora.';
    alert(
      'Não foi possível entrar com Google. Verifique se o provedor Google está ativo e se o domínio "' +
      location.host +
      '" está autorizado no Firebase Authentication.'
    );
  } finally {
    googleLoginBtn.disabled = !isFirebaseConfigured();
    googleLoginBtn.textContent = isFirebaseConfigured() ? 'Entrar com Google' : 'Configurar Firebase';
  }
}

async function handleGoogleLogout() {
  if (!auth) return;

  try {
    setCloudStatus('Encerrando sessão…');
    await saveStateImmediate();
    await auth.signOut();
  } catch (error) {
    console.error('Falha ao sair da conta:', error);
  }
}

function markDirty() {
  if (applyingRemoteState) return;

  setSaveStatus('Salvando…');
  if (currentUser) {
    setCloudStatus('Alterações pendentes…');
  }

  clearTimeout(saveStatusTimer);
  queueSave();
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStateImmediate();
  }, SAVE_DEBOUNCE_MS);
}

async function saveStateImmediate() {
  clearTimeout(saveTimer);
  saveTimer = null;

  const payload = buildPersistedPayload();

  try {
    persistLocalPayload(payload);
    setSaveStatus(currentUser ? 'Salvo em cache' : 'Salvo localmente');
  } catch (error) {
    console.error('Falha ao salvar no localStorage:', error);
    setSaveStatus('Não foi possível salvar');
  }

  if (currentUser && boardDocRef) {
    await saveToCloud(payload);
  }

  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    if (saveStatusEl.textContent === 'Não foi possível salvar') return;
    setSaveStatus(currentUser ? 'Sincronizado' : 'Salvo localmente');
  }, 700);
}

function loadState(user = currentUser) {
  const keys = [getStorageKeyForUser(user)];

  if (user) {
    keys.push(LEGACY_SCOPED_STORAGE_KEY, ...LEGACY_STORAGE_KEYS);
  }

  const stored = [...new Set(keys)]
    .map(readStoredState)
    .find(Boolean);

  if (!stored) return createDefaultState();

  try {
    return normalizeState(stored);
  } catch (error) {
    console.error('Falha ao carregar dados salvos:', error);
    return createDefaultState();
  }
}

function readStoredState(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeState(raw) {
  return {
    schemaVersion: 7,
    pageTitle: typeof raw?.pageTitle === 'string' ? raw.pageTitle : createDefaultState().pageTitle,
    emoji: typeof raw?.emoji === 'string' ? raw.emoji : createDefaultState().emoji,
    items: normalizeTopItems(Array.isArray(raw?.items) ? raw.items : []),
    settings: normalizeSettings(raw?.settings),
    updatedAt: Number(raw?.updatedAt || raw?.clientUpdatedAt || 0) || 0
  };
}

function normalizeTopItems(items) {
  return items
    .map(item => normalizeItem(item, true))
    .filter(Boolean);
}

function normalizeChildren(items) {
  return items
    .map(item => normalizeItem(item, false))
    .filter(item => item && item.type === 'task');
}

function normalizePriority(priority) {
  return priority === 'soon' || priority === 'urgent' ? priority : 'normal';
}

function normalizeItem(item, allowRich) {
  if (!item || typeof item !== 'object') return null;

  if (allowRich && item.type === 'rich') {
    return {
      id: typeof item.id === 'string' ? item.id : uid(),
      type: 'rich',
      html: typeof item.html === 'string' ? item.html : ''
    };
  }

  return {
    id: typeof item.id === 'string' ? item.id : uid(),
    type: 'task',
    title: typeof item.title === 'string' ? item.title : '',
    note: typeof item.note === 'string' ? item.note : '',
    done: Boolean(item.done),
    priority: normalizePriority(item.priority),
    subitems: Array.isArray(item.subitems) ? item.subitems.map(normalizeSubitem).filter(Boolean) : [],
    children: Array.isArray(item.children) ? normalizeChildren(item.children) : []
  };
}

function normalizeSubitem(sub) {
  if (!sub || typeof sub !== 'object') return null;

  return {
    id: typeof sub.id === 'string' ? sub.id : uid(),
    text: typeof sub.text === 'string' ? sub.text : '',
    done: Boolean(sub.done)
  };
}

function createTask() {
  return {
    id: uid(),
    type: 'task',
    title: '',
    note: '',
    done: false,
    priority: 'normal',
    subitems: [],
    children: []
  };
}

function createRich() {
  return {
    id: uid(),
    type: 'rich',
    html: ''
  };
}

function walkTasks(items, callback, parentTask = null, level = 0) {
  items.forEach((item, index) => {
    if (item.type !== 'task') return;
    callback(item, parentTask, level, index);
    walkTasks(item.children, callback, item, level + 1);
  });
}

function countTaskDescendants(task) {
  let total = task.children.length;
  task.children.forEach(child => {
    total += countTaskDescendants(child);
  });
  return total;
}

function countAllTasks() {
  let total = 0;
  walkTasks(state.items, () => {
    total += 1;
  });
  return total;
}

function countDoneTasks() {
  let total = 0;
  walkTasks(state.items, task => {
    if (task.done) total += 1;
  });
  return total;
}

function findTopLevelItemIndex(id) {
  return state.items.findIndex(item => item.id === id);
}

function findTaskNode(taskId, items = state.items, parentTask = null) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    if (item.type !== 'task') continue;

    if (item.id === taskId) {
      return {
        task: item,
        parentTask,
        list: items,
        index
      };
    }

    const nested = findTaskNode(taskId, item.children, item);
    if (nested) return nested;
  }

  return null;
}

function setTaskDoneRecursive(task, value) {
  task.done = value;
  task.subitems.forEach(sub => {
    sub.done = value;
  });
  task.children.forEach(child => {
    setTaskDoneRecursive(child, value);
  });
}

function insertIntoList(list, item, afterId = null) {
  if (!afterId) {
    list.push(item);
    return;
  }

  const index = list.findIndex(entry => entry.id === afterId);
  if (index === -1) {
    list.push(item);
  } else {
    list.splice(index + 1, 0, item);
  }
}

function addTask(afterId = null, parentTaskId = null) {
  const task = createTask();

  if (!parentTaskId) {
    insertIntoList(state.items, task, afterId);
  } else {
    const parentNode = findTaskNode(parentTaskId);
    if (!parentNode) return;
    insertIntoList(parentNode.task.children, task, afterId);
  }

  markDirty();
  render({ selector: '[data-item-id="' + task.id + '"] .block-title-input' });
}

function addChildTask(parentTaskId, afterChildId = null) {
  addTask(afterChildId, parentTaskId);
}

function addRichBlock() {
  const rich = createRich();
  state.items.push(rich);
  markDirty();
  render({ selector: '[data-item-id="' + rich.id + '"] .rich-block' });
}

function removeTopLevelItem(itemId) {
  state.items = state.items.filter(entry => entry.id !== itemId);
  markDirty();
  render();
}

function removeTask(taskId) {
  const node = findTaskNode(taskId);
  if (!node) return;
  node.list.splice(node.index, 1);
  markDirty();
  render();
}

function addSubitem(taskId, afterSubId = null) {
  const node = findTaskNode(taskId);
  if (!node) return;

  const sub = { id: uid(), text: '', done: false };
  insertIntoList(node.task.subitems, sub, afterSubId);
  markDirty();
  render({ selector: '[data-sub-id="' + sub.id + '"] input' });
}

function removeSubitem(taskId, subId) {
  const node = findTaskNode(taskId);
  if (!node) return;
  node.task.subitems = node.task.subitems.filter(sub => sub.id !== subId);
  markDirty();
  render();
}

function makeIconButton({ title, className = 'ba-btn', onClick, svg }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = title;
  btn.innerHTML = svg;
  btn.addEventListener('click', onClick);
  return btn;
}

function updateMeta() {
  const total = countAllTasks();
  const done = countDoneTasks();
  const percent = total ? Math.round((done / total) * 100) : 0;

  doneCountEl.textContent = done;
  headerSubEl.textContent = total + (total === 1 ? ' tarefa' : ' tarefas');
  progressFillEl.style.width = percent + '%';
  progressLabelEl.textContent = percent + '%';
  emptyStateEl.style.display = state.items.length ? 'none' : 'block';
}

function setupDrag(block, context) {
  const { itemId, parentTaskId, itemType } = context;

  block.addEventListener('dragstart', event => {
    if (!block.draggable) {
      event.preventDefault();
      return;
    }

    dragInfo = {
      itemId,
      parentTaskId,
      itemType
    };

    block.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(dragInfo));
  });

  block.addEventListener('dragend', () => {
    dragInfo = null;
    block.draggable = false;
    block.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  block.addEventListener('dragover', event => {
    if (!dragInfo) return;
    if (dragInfo.itemId === itemId) return;
    if ((dragInfo.parentTaskId || null) !== (parentTaskId || null)) return;
    if (dragInfo.parentTaskId && itemType !== 'task') return;
    event.preventDefault();
    block.classList.add('drag-over');
  });

  block.addEventListener('dragleave', () => {
    block.classList.remove('drag-over');
  });

  block.addEventListener('drop', event => {
    event.preventDefault();
    block.classList.remove('drag-over');
    if (!dragInfo || dragInfo.itemId === itemId) return;
    if ((dragInfo.parentTaskId || null) !== (parentTaskId || null)) return;

    if (!parentTaskId) {
      moveTopLevelItem(dragInfo.itemId, itemId);
    } else {
      moveChildTaskWithinParent(parentTaskId, dragInfo.itemId, itemId);
    }
  });
}

function moveTopLevelItem(sourceId, targetId) {
  const sourceIndex = findTopLevelItemIndex(sourceId);
  const targetIndex = findTopLevelItemIndex(targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

  const [moved] = state.items.splice(sourceIndex, 1);
  const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  state.items.splice(adjustedTarget, 0, moved);
  markDirty();
  render();
}

function moveChildTaskWithinParent(parentTaskId, sourceId, targetId) {
  const parentNode = findTaskNode(parentTaskId);
  if (!parentNode) return;

  const list = parentNode.task.children;
  const sourceIndex = list.findIndex(item => item.id === sourceId);
  const targetIndex = list.findIndex(item => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

  const [moved] = list.splice(sourceIndex, 1);
  const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  list.splice(adjustedTarget, 0, moved);
  markDirty();
  render();
}

function getTaskVisualState(task) {
  if (task.done) return 'done';
  return normalizePriority(task.priority);
}

function getTaskStatusText(task) {
  const visualState = getTaskVisualState(task);
  if (visualState === 'done') return 'Resolvida';
  if (visualState === 'urgent') return 'Urgente';
  if (visualState === 'soon') return 'Deve ser resolvida';
  return 'Sem prioridade';
}

function buildSubitems(task) {
  const fragment = document.createDocumentFragment();

  if (task.subitems.length) {
    const subitemsWrap = document.createElement('div');
    subitemsWrap.className = 'subitems';

    task.subitems.forEach(sub => {
      const row = document.createElement('div');
      row.className = 'subitem';
      row.dataset.subId = sub.id;

      const subCheck = document.createElement('div');
      subCheck.className = 'sub-check' + (sub.done ? ' checked' : '');
      subCheck.innerHTML = '<svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,6 5,9.5 10.5,2.5"/></svg>';
      subCheck.addEventListener('click', () => {
        sub.done = !sub.done;
        markDirty();
        render();
      });

      const subInput = document.createElement('input');
      subInput.className = 'subitem-input' + (sub.done ? ' checked-text' : '');
      subInput.placeholder = 'Checklist rápido…';
      subInput.value = sub.text || '';
      subInput.addEventListener('input', event => {
        sub.text = event.target.value;
        markDirty();
      });
      subInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addSubitem(task.id, sub.id);
        }

        if (event.key === 'Backspace' && !event.target.value) {
          event.preventDefault();
          removeSubitem(task.id, sub.id);
        }
      });

      const subDelete = document.createElement('button');
      subDelete.type = 'button';
      subDelete.className = 'sub-del';
      subDelete.textContent = '✕';
      subDelete.addEventListener('click', () => removeSubitem(task.id, sub.id));

      row.append(subCheck, subInput, subDelete);
      subitemsWrap.appendChild(row);
    });

    fragment.appendChild(subitemsWrap);
  }

  const addSubBtn = document.createElement('button');
  addSubBtn.type = 'button';
  addSubBtn.className = 'add-subitem-btn';
  addSubBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Adicionar checklist';
  addSubBtn.addEventListener('click', () => addSubitem(task.id));
  fragment.appendChild(addSubBtn);

  return fragment;
}

function buildTaskElement(task, options = {}) {
  const { parentTask = null, level = 0 } = options;

  const wrapper = document.createElement('div');
  wrapper.className = 'task-node';

  const block = document.createElement('div');
  const visualState = getTaskVisualState(task);
  const priorityClass = visualState === 'soon'
    ? ' priority-soon'
    : visualState === 'urgent'
      ? ' priority-urgent'
      : visualState === 'done'
        ? ' done'
        : '';

  block.className = 'block' + priorityClass + (parentTask ? ' child-task' : '');
  block.dataset.itemId = task.id;
  block.draggable = false;

  const header = document.createElement('div');
  header.className = 'block-header';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.title = 'Arrastar';
  dragHandle.addEventListener('mousedown', () => {
    block.draggable = true;
  });
  dragHandle.addEventListener('mouseup', () => {
    block.draggable = false;
  });
  dragHandle.addEventListener('mouseleave', () => {
    if (!dragInfo) block.draggable = false;
  });
  header.appendChild(dragHandle);

  const checkWrap = document.createElement('div');
  checkWrap.className = 'check-wrap';
  checkWrap.innerHTML = '<div class="checkmark"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,6 5,9.5 10.5,2.5"/></svg></div>';
  checkWrap.addEventListener('click', () => {
    setTaskDoneRecursive(task, !task.done);
    markDirty();
    render();
  });
  header.appendChild(checkWrap);

  const body = document.createElement('div');
  body.className = 'block-body';

  const metaRow = document.createElement('div');
  metaRow.className = 'task-meta-row';

  const tag = document.createElement('span');
  tag.className = 'task-tag';
  tag.textContent = parentTask ? '↳ Tarefa filha' : 'Tarefa pai';
  metaRow.appendChild(tag);

  const childrenTotal = countTaskDescendants(task);
  if (childrenTotal) {
    const counter = document.createElement('span');
    counter.className = 'task-children-counter';
    counter.textContent = childrenTotal + (childrenTotal === 1 ? ' tarefa filha' : ' tarefas filhas');
    metaRow.appendChild(counter);
  }

  const priorityPicker = document.createElement('div');
  priorityPicker.className = 'task-priority-picker';
  [
    { value: 'normal', title: 'Sem prioridade' },
    { value: 'soon', title: 'Deve ser resolvida' },
    { value: 'urgent', title: 'Deve ser resolvida urgentemente' }
  ].forEach(option => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'priority-dot ' + option.value + (normalizePriority(task.priority) === option.value ? ' active' : '');
    dot.title = option.title;
    dot.setAttribute('aria-label', option.title);
    dot.addEventListener('click', () => {
      task.priority = option.value;
      markDirty();
      render();
    });
    priorityPicker.appendChild(dot);
  });
  metaRow.appendChild(priorityPicker);

  const statusBadge = document.createElement('span');
  statusBadge.className = 'task-status-badge status-' + visualState;
  statusBadge.textContent = getTaskStatusText(task);
  metaRow.appendChild(statusBadge);

  body.appendChild(metaRow);

  const titleInput = document.createElement('input');
  titleInput.className = 'block-title-input';
  titleInput.type = 'text';
  titleInput.placeholder = parentTask ? 'Título da tarefa filha…' : 'Título da tarefa pai…';
  titleInput.value = task.title || '';
  titleInput.addEventListener('input', event => {
    task.title = event.target.value;
    markDirty();
  });
  titleInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTask(task.id, parentTask ? parentTask.id : null);
    }
  });
  body.appendChild(titleInput);

  const noteInput = document.createElement('textarea');
  noteInput.className = 'block-note-input';
  noteInput.rows = 1;
  noteInput.placeholder = 'Adicione uma nota…';
  noteInput.value = task.note || '';
  noteInput.addEventListener('input', event => {
    task.note = event.target.value;
    autoResize(noteInput);
    markDirty();
  });
  body.appendChild(noteInput);

  const actions = document.createElement('div');
  actions.className = 'block-actions';

  actions.appendChild(makeIconButton({
    title: 'Adicionar tarefa filha',
    onClick: () => addChildTask(task.id),
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h8"/><path d="M4 12h12"/><path d="M4 19h8"/><path d="M17 8v8"/><path d="M13 12h8"/></svg>'
  }));

  actions.appendChild(makeIconButton({
    title: 'Adicionar checklist',
    onClick: () => addSubitem(task.id),
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  }));

  actions.appendChild(makeIconButton({
    title: 'Remover tarefa',
    className: 'ba-btn danger',
    onClick: () => removeTask(task.id),
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
  }));

  body.appendChild(actions);
  header.appendChild(body);
  block.appendChild(header);
  block.appendChild(buildSubitems(task));

  const addChildBtn = document.createElement('button');
  addChildBtn.type = 'button';
  addChildBtn.className = 'add-child-btn';
  addChildBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 12h9"/><path d="M13 8v8"/><path d="M4 5h6"/><path d="M4 19h6"/></svg>Adicionar tarefa filha';
  addChildBtn.addEventListener('click', () => addChildTask(task.id));

  wrapper.appendChild(block);
  wrapper.appendChild(addChildBtn);

  if (task.children.length) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'children-container';

    task.children.forEach(childTask => {
      childrenContainer.appendChild(buildTaskElement(childTask, {
        parentTask: task,
        level: level + 1
      }));
    });

    wrapper.appendChild(childrenContainer);
  }

  requestAnimationFrame(() => autoResize(noteInput));
  setupDrag(block, {
    itemId: task.id,
    parentTaskId: parentTask ? parentTask.id : null,
    itemType: 'task'
  });

  return wrapper;
}

function buildRichElement(item) {
  const block = document.createElement('div');
  block.className = 'block';
  block.dataset.itemId = item.id;
  block.draggable = false;

  const header = document.createElement('div');
  header.className = 'block-header';
  header.style.paddingBottom = '0';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.title = 'Arrastar';
  dragHandle.addEventListener('mousedown', () => {
    block.draggable = true;
  });
  dragHandle.addEventListener('mouseup', () => {
    block.draggable = false;
  });
  dragHandle.addEventListener('mouseleave', () => {
    if (!dragInfo) block.draggable = false;
  });
  header.appendChild(dragHandle);

  const body = document.createElement('div');
  body.className = 'block-body';
  body.style.display = 'flex';
  body.style.alignItems = 'center';
  body.style.justifyContent = 'space-between';

  const label = document.createElement('span');
  label.textContent = 'Bloco de texto';
  label.style.fontSize = '12px';
  label.style.color = 'var(--text-muted)';
  label.style.fontWeight = '700';

  const removeBtn = makeIconButton({
    title: 'Remover bloco de texto',
    className: 'ba-btn danger',
    onClick: () => removeTopLevelItem(item.id),
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
  });

  body.append(label, removeBtn);
  header.appendChild(body);
  block.appendChild(header);

  const rich = document.createElement('div');
  rich.className = 'rich-block';
  rich.contentEditable = 'true';
  rich.dataset.placeholder = 'Escreva aqui com formatação livre…';
  rich.dataset.richId = item.id;
  rich.innerHTML = item.html || '';
  rich.addEventListener('focus', () => {
    activeRichId = item.id;
  });
  rich.addEventListener('input', () => {
    item.html = rich.innerHTML;
    markDirty();
  });
  rich.addEventListener('paste', handlePlainTextPaste);
  block.appendChild(rich);

  setupDrag(block, {
    itemId: item.id,
    parentTaskId: null,
    itemType: 'rich'
  });

  return block;
}

function render(focusTarget = null) {
  applyAppearance();
  updateWorkspaceCopy();
  blocksEl.innerHTML = '';

  state.items.forEach(item => {
    if (item.type === 'task') {
      blocksEl.appendChild(buildTaskElement(item, { parentTask: null, level: 0 }));
    } else {
      blocksEl.appendChild(buildRichElement(item));
    }
  });

  pageTitleEl.value = state.pageTitle;
  emojiBtn.textContent = state.emoji;
  autoResize(pageTitleEl);
  updateMeta();

  if (focusTarget) {
    requestAnimationFrame(() => {
      const target = document.querySelector(focusTarget.selector);
      if (!target) return;
      target.focus();
      if (typeof target.setSelectionRange === 'function') {
        const length = target.value?.length ?? 0;
        target.setSelectionRange(length, length);
      }
    });
  }
}

function populateEmojiPicker() {
  emojiPicker.innerHTML = '';
  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-opt';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      state.emoji = emoji;
      markDirty();
      render();
      emojiPicker.classList.remove('open');
    });
    emojiPicker.appendChild(btn);
  });
}

function handlePlainTextPaste(event) {
  event.preventDefault();
  const text = (event.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

function selectionIsInsideRich() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return false;

  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer.nodeType === 3
    ? range.commonAncestorContainer.parentElement
    : range.commonAncestorContainer;

  return Boolean(node?.closest?.('.rich-block'));
}

function saveRange() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return false;
  lastRange = selection.getRangeAt(0).cloneRange();
  return true;
}

function restoreRange() {
  if (!lastRange) return false;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(lastRange);
  return true;
}

function hideToolbar() {
  ftb.classList.remove('visible');
  colorPopup.classList.remove('visible');
}

function positionToolbar(rect) {
  const toolbarWidth = ftb.offsetWidth || 320;
  let left = rect.left + (rect.width / 2);
  let top = rect.top - 8;

  left = Math.max((toolbarWidth / 2) + 8, Math.min(left, window.innerWidth - (toolbarWidth / 2) - 8));
  top = Math.max(8, top);

  ftb.style.left = left + 'px';
  ftb.style.top = top + 'px';
}

function updateToolbarState() {
  const mapping = [
    ['btn-bold', 'bold'],
    ['btn-italic', 'italic'],
    ['btn-underline', 'underline'],
    ['btn-strike', 'strikeThrough']
  ];

  mapping.forEach(([id, command]) => {
    document.getElementById(id).classList.toggle('active', document.queryCommandState(command));
  });
}

function refreshToolbarFromSelection() {
  if (!selectionIsInsideRich()) {
    hideToolbar();
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideToolbar();
    return;
  }

  lastRange = selection.getRangeAt(0).cloneRange();
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  positionToolbar(rect);
  ftb.classList.add('visible');
  updateToolbarState();
}

function applyCommand(command, value = null) {
  restoreRange();
  document.execCommand(command, false, value);
  updateToolbarState();

  const rich = activeRichId
    ? document.querySelector('[data-rich-id="' + activeRichId + '"]')
    : document.activeElement?.closest?.('.rich-block');

  const item = rich ? state.items.find(entry => entry.id === rich.dataset.richId) : null;
  if (item && item.type === 'rich') {
    item.html = rich.innerHTML;
    markDirty();
  }

  setTimeout(refreshToolbarFromSelection, 0);
}

function openColorPopup() {
  const rect = ftb.getBoundingClientRect();
  colorPopup.style.left = rect.left + 'px';
  colorPopup.style.top = (rect.bottom + 6) + 'px';
  colorPopup.classList.add('visible');
}

function initToolbar() {
  document.getElementById('btn-bold').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('bold');
  });

  document.getElementById('btn-italic').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('italic');
  });

  document.getElementById('btn-underline').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('underline');
  });

  document.getElementById('btn-strike').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('strikeThrough');
  });

  document.getElementById('btn-color').addEventListener('mousedown', event => {
    event.preventDefault();
    saveRange();
    if (colorPopup.classList.contains('visible')) {
      colorPopup.classList.remove('visible');
    } else {
      openColorPopup();
    }
  });

  document.getElementById('btn-highlight').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('hiliteColor', '#fef08a');
  });

  document.getElementById('btn-h2').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('formatBlock', '<h2>');
  });

  document.getElementById('btn-h3').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('formatBlock', '<h3>');
  });

  document.getElementById('btn-p').addEventListener('mousedown', event => {
    event.preventDefault();
    applyCommand('formatBlock', '<p>');
  });

  colorPopup.querySelectorAll('[data-color]').forEach(swatch => {
    swatch.addEventListener('mousedown', event => {
      event.preventDefault();
      applyCommand('foreColor', swatch.dataset.color);
      colorPopup.classList.remove('visible');
    });
  });

  colorPopup.querySelectorAll('[data-highlight]').forEach(swatch => {
    swatch.addEventListener('mousedown', event => {
      event.preventDefault();
      applyCommand('hiliteColor', swatch.dataset.highlight);
      colorPopup.classList.remove('visible');
    });
  });

  document.addEventListener('mouseup', event => {
    if (ftb.contains(event.target) || colorPopup.contains(event.target)) return;
    setTimeout(refreshToolbarFromSelection, 10);
  });

  document.addEventListener('keyup', () => {
    setTimeout(refreshToolbarFromSelection, 10);
  });

  document.addEventListener('scroll', () => {
    if (ftb.classList.contains('visible')) refreshToolbarFromSelection();
  }, true);

  window.addEventListener('resize', () => {
    if (ftb.classList.contains('visible')) refreshToolbarFromSelection();
  });
}

function initEvents() {
  document.getElementById('add-task-btn').addEventListener('click', () => addTask());
  document.getElementById('add-rich-btn').addEventListener('click', addRichBlock);
  googleLoginBtn.addEventListener('click', handleGoogleLogin);
  googleLogoutBtn.addEventListener('click', handleGoogleLogout);

  fontThemeSelectEl.addEventListener('change', event => {
    state.settings.fontTheme = FONT_THEMES[event.target.value] ? event.target.value : DEFAULT_FONT_THEME;
    applyAppearance();
    markDirty();
  });

  [loginThemeToggleBtn, appThemeToggleBtn].filter(Boolean).forEach(button => {
    button.addEventListener('click', () => {
      state.settings.colorMode = normalizeColorMode(state.settings.colorMode) === 'dark' ? 'light' : 'dark';
      applyAppearance();
      if (currentUser) {
        markDirty();
      }
    });
  });

  pageTitleEl.addEventListener('input', () => {
    state.pageTitle = pageTitleEl.value;
    autoResize(pageTitleEl);
    markDirty();
  });

  emojiBtn.addEventListener('click', () => {
    emojiPicker.classList.toggle('open');
  });

  emojiBtn.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      emojiPicker.classList.toggle('open');
    }
  });

  headerUserPhotoEl.addEventListener('error', () => {
    headerUserPhotoEl.hidden = true;
    headerUserPhotoEl.removeAttribute('src');
    headerUserFallbackEl.hidden = false;
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('#emoji-btn') && !event.target.closest('#emoji-picker')) {
      emojiPicker.classList.remove('open');
    }

    if (!ftb.contains(event.target) && !colorPopup.contains(event.target)) {
      colorPopup.classList.remove('visible');
    }
  });

  window.addEventListener('pagehide', () => {
    if (currentUser) saveStateImmediate();
  });

  window.addEventListener('beforeunload', () => {
    if (currentUser) saveStateImmediate();
  });

  window.addEventListener('online', () => {
    if (currentUser) saveStateImmediate();
  });
}

function initDate() {
  const now = new Date();
  document.getElementById('date-label').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

populateFontThemes();
populateEmojiPicker();
initDate();
initEvents();
initToolbar();
render();
autoResize(pageTitleEl);
updateAuthUI();
initFirebase();
