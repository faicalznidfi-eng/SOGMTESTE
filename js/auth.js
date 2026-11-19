/* SOGM - écran de connexion : le profil (commercial, vendeur, opérateur, admin)
   est détecté automatiquement à partir du compte, puis l'espace correspondant s'ouvre */
(function () {
  // Déjà connecté ? redirection directe vers l'espace du profil
  const u = currentUser();
  if (u) window.location.replace(homePage(u.role));

  $('#togglePwd').addEventListener('click', () => {
    const i = $('#pwd');
    i.type = i.type === 'password' ? 'text' : 'password';
  });

  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const login = $('#login').value.trim().toLowerCase();
    const pwd = $('#pwd').value;
    const user = Store.data.users.find(x => x.login.toLowerCase() === login && x.pwd === hashPwd(pwd));

    if (!user) { $('#loginError').textContent = 'Identifiant ou mot de passe incorrect.'; return; }
    if (!user.actif) { $('#loginError').textContent = 'Ce compte est désactivé.'; return; }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, nom: user.nom, login: user.login, role: user.role }));
    window.location.replace(homePage(user.role));
  });
})();
