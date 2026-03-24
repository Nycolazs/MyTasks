# MyTasks

Aplicacao de tarefas com login Google, sincronizacao no Firebase e interface otimizada para GitHub Pages.

## Estrutura

- `index.html`: entrada principal da aplicacao
- `styles/main.css`: estilos da interface
- `scripts/app.js`: logica da aplicacao, autenticacao e persistencia
- `scripts/firebase-config.js`: configuracao do Firebase

## Configuracao do Firebase

### Desenvolvimento local

1. Abra `scripts/firebase-config.js`
2. Preencha as chaves do seu projeto Firebase
3. Ative o provedor Google em `Authentication`
4. Adicione `nycolazs.github.io` em `Authentication > Settings > Authorized domains`

### Regras do Firestore

Se o app mostrar mensagem de sincronizacao bloqueada depois do login, o mais comum e o Firestore estar negando acesso pelas rules.

No Firebase Console, abra `Firestore Database > Rules` e cole o conteudo de `firestore.rules`.

Essas regras deixam cada usuario ler e gravar apenas:

- `users/{uid}`
- `users/{uid}/boards/{boardId}`

### Publicacao segura no GitHub

Para nao deixar a configuracao real salva no repositorio, o deploy usa GitHub Actions Secrets.

Configure estes secrets no repositório:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`

Observacao importante:

- Esses valores deixam de ficar expostos no GitHub como codigo versionado.
- Mesmo assim, por ser um app web estatico, eles continuam visiveis no navegador depois do deploy.
- A seguranca real precisa estar nas regras do Firestore, Authentication e restricoes da chave da API.

## Publicacao no GitHub Pages

Depois de publicar o repositório, use o workflow em `.github/workflows/deploy-pages.yml`.

URL esperada:

- `https://nycolazs.github.io/MyTasks/`
