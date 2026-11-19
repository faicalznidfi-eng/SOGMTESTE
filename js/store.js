/* =========================================================
   SOGM - Gestion des commandes
   store.js : stockage des données (localStorage) + utilitaires
   ========================================================= */

const DB_KEY = 'sogm_db_v1';
const LOGO_URL = new URL('img/logo-sm.png', location.href).href; // logo pour les impressions
const SESSION_KEY = 'sogm_session';

/* Statuts des commandes : attente → validée → au chargement → chargée → livrée */
const STATUTS = {
  attente:    { label: 'En attente',    cls: 'st-attente' },
  validee:    { label: 'Validée',       cls: 'st-validee' },
  chargement: { label: 'Au chargement', cls: 'st-chargement' },
  chargee:    { label: 'Chargée',       cls: 'st-chargee' },
  livree:     { label: 'Livrée',        cls: 'st-livree' },
  annulee:    { label: 'Annulée',       cls: 'st-annulee' }
};

/* Statuts des chargements */
const CHG_STATUTS = {
  a_charger: { label: 'À charger', cls: 'st-chargement' },
  charge:    { label: 'Chargé',    cls: 'st-chargee' },
  livre:     { label: 'Livré',     cls: 'st-livree' },
  annule:    { label: 'Annulé',    cls: 'st-annulee' }
};

/* Paiements */
const CASH_LIMIT = 19999; // plafond des paiements en espèces, par client et par jour (DH)
const PAY_MODES = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', effet: 'Effet', avance: 'Avance client' };
/* Modes pouvant dépasser le reste à payer : l'excédent devient une avance pour le client */
const OVERPAY_MODES = ['cheque', 'virement', 'effet'];
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

/* Comptes bancaires de la société (numéros modifiables par l'administrateur) */
function defaultBanques() {
  return [
    { id: 'ca',  nom: 'Crédit Agricole', compte: '' },
    { id: 'cih', nom: 'CIH',             compte: '' }
  ];
}

/* Profils utilisateurs et page d'accueil de chacun */
const ROLES = {
  commercial: { label: 'Commercial',              icon: '📱', page: 'commercial.html' },
  vendeur:    { label: 'Vendeur',                 icon: '🧾', page: 'vendeur.html' },
  operateur:  { label: 'Opérateur de chargement', icon: '🚚', page: 'operateur.html' },
  admin:      { label: 'Administrateur',          icon: '🛠️', page: 'admin.html' }
};

/* Hachage simple des mots de passe (côté client uniquement).
   Pour une mise en production, l'authentification doit se faire côté serveur. */
function hashPwd(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function defaultStaff(firstId) {
  return [
    { id: firstId,     login: 'vendeur',   nom: 'Vendeur 1',               role: 'vendeur',   pwd: hashPwd('vendeur123'), actif: true },
    { id: firstId + 1, login: 'operateur', nom: 'Opérateur chargement 1', role: 'operateur', pwd: hashPwd('oper123'),    actif: true }
  ];
}

function defaultSacs() {
  return [
    { id: 1, ref: 'S-FL25',  designation: 'Sac Farine de luxe 25 kg', quantite: 3000, mouvements: [] },
    { id: 2, ref: 'S-FF50',  designation: 'Sac Farine fleur 50 kg',   quantite: 1500, mouvements: [] },
    { id: 3, ref: 'S-SM25',  designation: 'Sac Semoule 25 kg',        quantite: 2500, mouvements: [] },
    { id: 4, ref: 'S-SON40', designation: 'Sac Son 40 kg',            quantite: 800,  mouvements: [] }
  ];
}

function seedData() {
  return {
    seq: { product: 6, client: 3, order: 0, user: 4, sac: 4, chargement: 0 },
    users: [
      { id: 1, login: 'admin',      nom: 'Administrateur', role: 'admin',      pwd: hashPwd('admin123'), actif: true },
      { id: 2, login: 'commercial', nom: 'Commercial 1',   role: 'commercial', pwd: hashPwd('com123'),   actif: true },
      ...defaultStaff(3)
    ],
    sacs: defaultSacs(),
    chargements: [],
    avances: [],
    banques: defaultBanques(),
    bordereaux: [],
    products: [
      { id: 1, ref: 'FL-25', nom: 'Farine de luxe',      categorie: 'Farine',  conditionnement: 'Sac 25 kg', prix: 210, stock: 400, photo: '', actif: true, indisponible: false },
      { id: 2, ref: 'FF-50', nom: 'Farine fleur',        categorie: 'Farine',  conditionnement: 'Sac 50 kg', prix: 390, stock: 250, photo: '', actif: true, indisponible: false },
      { id: 3, ref: 'FC-25', nom: 'Farine complète',     categorie: 'Farine',  conditionnement: 'Sac 25 kg', prix: 195, stock: 180, photo: '', actif: true, indisponible: false },
      { id: 4, ref: 'SF-25', nom: 'Semoule fine',        categorie: 'Semoule', conditionnement: 'Sac 25 kg', prix: 230, stock: 300, photo: '', actif: true, indisponible: false },
      { id: 5, ref: 'SG-25', nom: 'Semoule grosse',      categorie: 'Semoule', conditionnement: 'Sac 25 kg', prix: 225, stock: 150, photo: '', actif: true, indisponible: false },
      { id: 6, ref: 'SON-40', nom: 'Son de blé',         categorie: 'Issues',  conditionnement: 'Sac 40 kg', prix: 120, stock: 500, photo: '', actif: true, indisponible: false }
    ],
    clients: [
      { id: 1, nom: 'Boulangerie Al Amal',   tel: '0600000001', ville: 'Fès',    adresse: 'Route de Sefrou', ice: '' },
      { id: 2, nom: 'Pâtisserie Zitouna',    tel: '0600000002', ville: 'Meknès', adresse: 'Hamria',          ice: '' },
      { id: 3, nom: 'Épicerie Ennour',       tel: '0600000003', ville: 'Fès',    adresse: 'Saiss',           ice: '' }
    ],
    orders: []
  };
}

const Store = {
  data: null,

  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      this.data = raw ? JSON.parse(raw) : seedData();
    } catch (e) {
      this.data = seedData();
    }
    this.migrate();
    if (!localStorage.getItem(DB_KEY)) this.save();
    return this.data;
  },

  /* Mise à niveau des données enregistrées par une version précédente */
  migrate() {
    const d = this.data;
    let changed = false;
    d.seq = d.seq || {};
    if (!Array.isArray(d.chargements)) { d.chargements = []; changed = true; }
    d.chargements.forEach(c => { if (!Array.isArray(c.paiements)) { c.paiements = []; changed = true; } });
    if (!Array.isArray(d.avances)) { d.avances = []; changed = true; }
    if (!Array.isArray(d.banques)) { d.banques = defaultBanques(); changed = true; }
    if (!Array.isArray(d.bordereaux)) { d.bordereaux = []; changed = true; }
    d.avances.forEach(a => { if (!a.numero) { a.numero = this.avanceNumber(this.nextId('avance')); changed = true; } });
    if (!Array.isArray(d.sacs)) { d.sacs = defaultSacs(); d.seq.sac = d.sacs.length; changed = true; }
    d.products.forEach(p => { if (p.indisponible === undefined) { p.indisponible = false; changed = true; } });
    ['vendeur', 'operateur'].forEach(role => {
      if (!d.users.some(u => u.role === role)) {
        const u = defaultStaff(0).find(x => x.role === role);
        if (!d.users.some(x => x.login === u.login)) {
          d.users.push({ ...u, id: this.nextId('user') });
          changed = true;
        }
      }
    });
    if (changed && localStorage.getItem(DB_KEY)) this.save();
  },

  save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      toast("Espace de stockage plein : réduisez la taille ou le nombre des photos.", 'error');
      return false;
    }
  },

  nextId(kind) {
    this.data.seq[kind] = (this.data.seq[kind] || 0) + 1;
    return this.data.seq[kind];
  },

  product(id) { return this.data.products.find(p => p.id === id); },
  sac(id)     { return this.data.sacs.find(s => s.id === id); },
  chargement(id) { return this.data.chargements.find(c => c.id === id); },
  order(id)   { return this.data.orders.find(o => o.id === id); },
  client(id)  { return this.data.clients.find(c => c.id === id); },
  user(id)    { return this.data.users.find(u => u.id === id); },

  orderNumber(id) {
    const y = new Date().getFullYear();
    return `CMD-${y}-${String(id).padStart(5, '0')}`;
  },

  avanceNumber(n) {
    return `AV-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`;
  },

  chargementNumber(id) {
    const y = new Date().getFullYear();
    return `CHG-${y}-${String(id).padStart(5, '0')}`;
  },

  /* Dernier prix de vente d'un produit pour un client (hors annulations) */
  lastPrice(clientId, productId) {
    let best = null;
    const consider = (date, lignes, cancelled) => {
      if (cancelled) return;
      const l = lignes.find(x => x.productId === productId);
      if (l && (!best || date > best.date)) best = { prix: l.prix, date };
    };
    this.data.orders.forEach(o => o.clientId === clientId && consider(o.date, o.lignes, o.statut === 'annulee'));
    this.data.chargements.forEach(c => !c.orderId && c.clientId === clientId && consider(c.date, c.lignes, c.statut === 'annule'));
    return best;
  },

  orderTotal(o) {
    return o.lignes.reduce((s, l) => s + l.qte * l.prix, 0);
  },

  /* Changement de statut d'une commande (le stock bouge au chargement, pas ici) */
  setOrderStatus(order, statut, note = '', save = true) {
    if (order.statut === statut && !note) return;
    order.statut = statut;
    order.historique = order.historique || [];
    order.historique.push({ date: new Date().toISOString(), statut, par: currentUser()?.nom || '', note });
    if (save) this.save();
  },

  /* ---------- Chargements ---------- */
  createChargement({ order = null, clientId, lignes, camion, datePrevue, notes }) {
    const id = this.nextId('chargement');
    const client = this.client(clientId);
    const me = currentUser();
    const chg = {
      id,
      numero: this.chargementNumber(id),
      date: new Date().toISOString(),
      datePrevue: datePrevue || '',
      orderId: order ? order.id : null,
      orderNumero: order ? order.numero : '',
      clientId,
      clientNom: client ? client.nom : '',
      lignes: lignes.map(l => ({ productId: l.productId, ref: l.ref, nom: l.nom, conditionnement: l.conditionnement, prix: l.prix, qte: l.qte, qteChargee: null })),
      camion,
      notes: notes || '',
      statut: 'a_charger',
      vendeurNom: me?.nom || '',
      operateurNom: '',
      historique: [{ date: new Date().toISOString(), statut: 'a_charger', par: me?.nom || '' }],
      paiements: []
    };
    this.data.chargements.push(chg);
    if (order) {
      order.chargementId = id;
      this.setOrderStatus(order, 'chargement', `Envoyée au chargement ${chg.numero} (camion ${camion.immatriculation})`, false);
    }
    return this.save() ? chg : null;
  },

  setChgStatus(chg, statut, note = '') {
    chg.statut = statut;
    chg.historique.push({ date: new Date().toISOString(), statut, par: currentUser()?.nom || '', note });
  },

  /* Confirmation du chargement : sortie du stock des quantités réellement chargées */
  confirmLoading(chg, qtys) {
    chg.lignes.forEach((l, i) => {
      l.qteChargee = qtys[i];
      const p = this.product(l.productId);
      if (p) p.stock -= l.qteChargee;
    });
    chg.operateurNom = currentUser()?.nom || '';
    chg.dateChargement = new Date().toISOString();
    this.setChgStatus(chg, 'charge');
    const o = chg.orderId && this.order(chg.orderId);
    if (o) this.setOrderStatus(o, 'chargee', `Chargée (${chg.numero})`, false);
    return this.save();
  },

  confirmDelivery(chg) {
    chg.dateLivraison = new Date().toISOString();
    this.setChgStatus(chg, 'livre');
    const o = chg.orderId && this.order(chg.orderId);
    if (o) this.setOrderStatus(o, 'livree', `Livrée (${chg.numero})`, false);
    return this.save();
  },

  /* Annulation d'un chargement non encore chargé : la commande redevient « Validée » */
  cancelChargement(chg) {
    this.setChgStatus(chg, 'annule');
    const o = chg.orderId && this.order(chg.orderId);
    if (o) { o.chargementId = null; this.setOrderStatus(o, 'validee', `Chargement ${chg.numero} annulé`, false); }
    return this.save();
  },

  /* ---------- Paiements des chargements ----------
     Montant dû = quantités chargées × prix une fois le camion chargé, sinon quantités demandées × prix */
  chgMontant(c) {
    const charged = c.statut === 'charge' || c.statut === 'livre';
    return round2(c.lignes.reduce((s, l) => s + (charged ? (l.qteChargee || 0) : l.qte) * l.prix, 0));
  },
  chgPaye(c) { return round2((c.paiements || []).reduce((s, p) => s + p.montant, 0)); },
  chgReste(c) { return round2(this.chgMontant(c) - this.chgPaye(c)); }, // négatif = trop-perçu

  /* Espèces déjà encaissées pour un client un jour donné (AAAA-MM-JJ), tous chargements confondus */
  cashUsed(clientId, day) {
    let s = 0;
    this.data.chargements.forEach(c => {
      if (c.clientId !== clientId) return;
      (c.paiements || []).forEach(p => { if (p.mode === 'especes' && p.date.slice(0, 10) === day) s += p.montant; });
    });
    return round2(s);
  },

  /* ---------- Avances clients ----------
     Une avance naît de l'excédent d'un chèque, virement ou effet ; elle se consomme
     ensuite (mode « Avance client ») sur les autres chargements du même client. */
  clientAvance(clientId) {
    return round2(this.data.avances.filter(a => a.clientId === clientId).reduce((s, a) => s + a.solde, 0));
  },

  /* Enregistre un paiement.
     montant = somme reçue (montant du chèque, du virement…). Renvoie { error } ou { applied, excess }. */
  addPayment(c, f) {
    const mode = f.mode;
    const recu = round2(f.montant);
    const reste = this.chgReste(c);
    const today = new Date().toISOString().slice(0, 10);
    const s = v => (v || '').trim();
    if (!PAY_MODES[mode]) return { error: 'Mode de paiement invalide.' };
    if (recu <= 0) return { error: 'Le montant doit être supérieur à 0.' };
    if (reste <= 0.001) return { error: 'Ce chargement est déjà soldé.' };

    if (mode === 'especes') {
      if (recu > reste + 0.001) return { error: `En espèces, le montant ne peut pas dépasser le reste à payer (${money(reste)}).` };
      const dispo = round2(CASH_LIMIT - this.cashUsed(c.clientId, today));
      if (recu > dispo + 0.001) return { error: `Plafond espèces dépassé : ${money(CASH_LIMIT)} par jour pour ce client. Encore autorisé aujourd'hui : ${money(Math.max(0, dispo))}.` };
    }
    if (mode === 'avance') {
      const dispo = this.clientAvance(c.clientId);
      if (recu > dispo + 0.001) return { error: `Avance disponible insuffisante (${money(dispo)}).` };
      if (recu > reste + 0.001) return { error: `Le montant dépasse le reste à payer (${money(reste)}).` };
    }
    if (mode === 'cheque' && (!s(f.porteur) || !s(f.numero))) return { error: 'Le nom du porteur et le numéro du chèque sont obligatoires.' };
    if (mode === 'virement' && !s(f.reference)) return { error: 'La référence du virement est obligatoire.' };
    if (mode === 'effet' && (!s(f.tireur) || !s(f.numero) || !f.echeance)) return { error: 'Le tireur, le numéro et l\'échéance de l\'effet sont obligatoires.' };

    const applied = round2(Math.min(recu, reste));
    const excess = OVERPAY_MODES.includes(mode) ? round2(recu - applied) : 0;
    const me = currentUser()?.nom || '';
    const pay = { id: Date.now(), date: new Date().toISOString(), mode, montant: applied, recu, par: me };
    if (mode === 'cheque') Object.assign(pay, { porteur: s(f.porteur), numero: s(f.numero) });
    if (mode === 'virement') Object.assign(pay, { banque: s(f.banque), reference: s(f.reference) });
    if (mode === 'effet') Object.assign(pay, { tireur: s(f.tireur), numero: s(f.numero), echeance: f.echeance });

    // consommation des avances (les plus anciennes d'abord)
    if (mode === 'avance') {
      let left = applied;
      pay.avanceParts = [];
      this.data.avances.filter(a => a.clientId === c.clientId && a.solde > 0)
        .sort((a, b) => a.date.localeCompare(b.date)).forEach(a => {
          if (left <= 0.001) return;
          const take = round2(Math.min(a.solde, left));
          a.solde = round2(a.solde - take); left = round2(left - take);
          a.utilisations.push({ date: pay.date, chargementId: c.id, chargementNumero: c.numero, montant: take, paiementId: pay.id });
          pay.avanceParts.push({ id: a.id, numero: a.numero, origine: a.origine, montant: take });
        });
    }
    // excédent → nouvelle avance client
    if (excess > 0.001) {
      const av = {
        id: pay.id + 1, numero: this.avanceNumber(this.nextId('avance')), clientId: c.clientId, clientNom: c.clientNom, date: pay.date, montant: excess, solde: excess,
        origine: `${PAY_MODES[mode]}${pay.numero ? ' n° ' + pay.numero : pay.reference ? ' réf. ' + pay.reference : ''} (${c.numero})`,
        chargementId: c.id, paiementId: pay.id, utilisations: [], par: me
      };
      this.data.avances.push(av);
      pay.avanceCree = av.id;
    }
    c.paiements = c.paiements || [];
    c.paiements.push(pay);
    c.historique.push({ date: pay.date, statut: c.statut, par: me,
      note: `Paiement ${PAY_MODES[mode].toLowerCase()} ${money(applied)}${excess > 0 ? ` (reçu ${money(recu)}, avance ${money(excess)})` : ''} — reste ${money(Math.max(0, this.chgReste(c)))}` });
    return this.save() ? { applied, excess } : { error: 'Enregistrement impossible.' };
  },

  /* Supprime un paiement ; renvoie un message d'erreur ou null */
  removePayment(c, payId) {
    const p = (c.paiements || []).find(x => x.id === payId);
    if (!p) return null;
    if (p.bordereauId) {
      const b = this.data.bordereaux.find(x => x.id === p.bordereauId);
      return `Ce chèque a déjà été remis à la banque (bordereau ${b ? b.numero : ''}) : suppression impossible.`;
    }
    if (p.avanceCree) {
      const a = this.data.avances.find(x => x.id === p.avanceCree);
      if (a && a.solde < a.montant - 0.001) return 'L\'avance créée par ce paiement a déjà été utilisée : supprimez d\'abord les paiements qui l\'utilisent.';
      this.data.avances = this.data.avances.filter(x => x.id !== p.avanceCree);
    }
    if (p.mode === 'avance') (p.avanceParts || []).forEach(part => {
      const a = this.data.avances.find(x => x.id === part.id);
      if (a) { a.solde = round2(a.solde + part.montant); a.utilisations = a.utilisations.filter(u => u.paiementId !== p.id); }
    });
    c.paiements = c.paiements.filter(x => x.id !== payId);
    c.historique.push({ date: new Date().toISOString(), statut: c.statut, par: currentUser()?.nom || '',
      note: `Paiement supprimé : ${PAY_MODES[p.mode]} ${money(p.recu || p.montant)}` });
    this.save();
    return null;
  },

  /* ---------- Chèques et bordereaux de remise ---------- */
  banque(id) { return this.data.banques.find(b => b.id === id); },

  /* Chèques encaissés pas encore remis à la banque */
  pendingCheques() {
    const out = [];
    this.data.chargements.forEach(c => (c.paiements || []).forEach(p => {
      if (p.mode === 'cheque' && !p.bordereauId) out.push({ c, p });
    }));
    return out.sort((a, b) => a.p.date.localeCompare(b.p.date));
  },

  /* Liquidation d'un chèque : un chèque est « totalement liquidé » quand tout son montant
     est affecté à des chargements (pas d'avance créée, ou avance entièrement utilisée) */
  chequeLiquidation(p) {
    const recu = p.recu || p.montant;
    const a = p.avanceCree && this.data.avances.find(x => x.id === p.avanceCree);
    const nonAffecte = a ? round2(a.solde) : 0;
    return { recu, affecte: round2(recu - nonAffecte), nonAffecte, avance: a || null, liquide: nonAffecte <= 0.001 };
  },

  _bordLine(c, p) {
    return { chargementId: c.id, chargementNumero: c.numero, paiementId: p.id,
      clientId: c.clientId, clientNom: c.clientNom, numero: p.numero, porteur: p.porteur,
      dateCheque: p.date, montant: p.recu || p.montant };
  },
  /* Retrouve le chargement et le paiement d'une ligne de bordereau */
  bordItem(x) {
    const c = this.chargement(x.chargementId);
    const p = c && (c.paiements || []).find(y => y.id === x.paiementId);
    return p ? { c, p } : null;
  },

  /* Crée un bordereau de remise ; items = [{ c, p }] */
  createBordereau(banqueId, items) {
    const id = this.nextId('bordereau');
    const b = {
      id, numero: `BRD-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`,
      date: new Date().toISOString(), banqueId, par: currentUser()?.nom || '',
      cheques: items.map(({ c, p }) => this._bordLine(c, p)), historique: []
    };
    b.total = round2(b.cheques.reduce((s, x) => s + x.montant, 0));
    items.forEach(({ p }) => { p.bordereauId = id; });
    this.data.bordereaux.push(b);
    return this.save() ? b : null;
  },

  /* Modifie un bordereau : banque et liste des chèques. Les chèques retirés redeviennent « à remettre ». */
  updateBordereau(b, banqueId, items) {
    const keep = new Set(items.map(({ p }) => p.id));
    b.cheques.forEach(x => { if (!keep.has(x.paiementId)) { const it = this.bordItem(x); if (it) delete it.p.bordereauId; } });
    items.forEach(({ p }) => { p.bordereauId = b.id; });
    const before = `${b.cheques.length} chèque(s), ${money(b.total)}, ${(this.banque(b.banqueId) || {}).nom}`;
    b.banqueId = banqueId;
    b.cheques = items.map(({ c, p }) => this._bordLine(c, p));
    b.total = round2(b.cheques.reduce((s, x) => s + x.montant, 0));
    b.historique = b.historique || [];
    b.historique.push({ date: new Date().toISOString(), par: currentUser()?.nom || '',
      note: `Modifié (avant : ${before} — après : ${b.cheques.length} chèque(s), ${money(b.total)}, ${(this.banque(banqueId) || {}).nom})` });
    return this.save();
  },

  /* Supprime un bordereau : tous ses chèques reviennent dans la liste à remettre */
  deleteBordereau(b) {
    b.cheques.forEach(x => { const it = this.bordItem(x); if (it) delete it.p.bordereauId; });
    this.data.bordereaux = this.data.bordereaux.filter(x => x.id !== b.id);
    return this.save();
  },

  /* Crédit total d'un client (chargements non annulés) */
  clientReste(clientId) {
    return round2(this.data.chargements.filter(c => c.clientId === clientId && c.statut !== 'annule')
      .reduce((s, c) => s + Math.max(0, this.chgReste(c)), 0));
  },

  /* Derniers camions utilisés (pour la saisie rapide) */
  knownTrucks() {
    const map = new Map();
    [...this.data.chargements].sort((a, b) => a.date.localeCompare(b.date))
      .forEach(c => c.camion?.immatriculation && c.statut !== 'annule' && map.set(c.camion.immatriculation.toUpperCase(), c.camion));
    return map;
  },

  exportJSON() {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sogm-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  importJSON(text) {
    const d = JSON.parse(text);
    if (!d.users || !d.products || !d.orders || !d.clients) throw new Error('Fichier invalide');
    this.data = d;
    this.save();
  },

  reset() {
    this.data = seedData();
    this.save();
  }
};

/* ---------------- Session ---------------- */
function currentUser() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function requireRole(role) {
  const u = currentUser();
  if (!u || u.role !== role) { window.location.replace('index.html'); return null; }
  return u;
}
function homePage(role) { return ROLES[role]?.page || 'index.html'; }
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.replace('index.html');
}

/* ---------------- Utilitaires ---------------- */
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DH';
}
function fdate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  return withTime ? d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('fr-FR');
}
function statutBadge(s) {
  const st = STATUTS[s] || { label: s, cls: '' };
  return `<span class="badge ${st.cls}">${st.label}</span>`;
}

function chgBadge(s) {
  const st = CHG_STATUTS[s] || { label: s, cls: '' };
  return `<span class="badge ${st.cls}">${st.label}</span>`;
}
/* État de paiement d'un chargement */
function payBadge(c) {
  if (c.statut === 'annule') return '';
  const r = Store.chgReste(c), paid = Store.chgPaye(c);
  if (r < -0.001) return `<span class="badge pay-over">Trop-perçu ${money(-r)}</span>`;
  if (r <= 0.001) return '<span class="badge pay-ok">Payé</span>';
  return paid > 0 ? `<span class="badge pay-part">Partiel</span>` : '<span class="badge pay-credit">Crédit</span>';
}
/* Résumé montant / payé / reste */
function paySummary(c) {
  const r = Store.chgReste(c);
  return `<div class="pay-summary">
    <div><span>Montant</span><b>${money(Store.chgMontant(c))}</b></div>
    <div><span>Payé</span><b>${money(Store.chgPaye(c))}</b></div>
    <div class="${r > 0.001 ? 'due' : 'ok'}"><span>Reste à payer</span><b>${money(Math.max(0, r))}</b></div>
  </div>`;
}
/* Tableau des paiements, avec le reste à payer après chaque ligne */
function paymentsTable(c, { deletable = false } = {}) {
  const pays = c.paiements || [];
  if (!pays.length) return '<p class="muted small">Aucun paiement enregistré — chargement à crédit.</p>';
  const total = Store.chgMontant(c);
  let cum = 0;
  return `<div class="table-wrap"><table class="table pay-table">
    <thead><tr><th>Date</th><th>Mode</th><th>Détails</th><th class="r">Montant</th><th class="r">Reste à payer</th>${deletable ? '<th></th>' : ''}</tr></thead>
    <tbody>${pays.map(p => {
      cum = round2(cum + p.montant);
      const reste = round2(total - cum);
      return `<tr><td>${fdate(p.date, true)}</td><td><span class="badge mode-${p.mode}">${PAY_MODES[p.mode]}</span></td>
        <td>${payDetails(p)}<br><small class="muted">${esc(p.par)}</small></td>
        <td class="r"><b>${money(p.montant)}</b>${p.recu > p.montant + 0.001 ? `<br><small class="muted">reçu ${money(p.recu)}</small><br><small class="text-accent">avance ${money(round2(p.recu - p.montant))}</small>` : ''}</td>
        <td class="r"><b class="${reste > 0.001 ? 'text-danger' : 'text-ok'}">${money(Math.max(0, reste))}</b></td>
        ${deletable ? `<td class="r"><button class="icon-btn text-danger" data-delpay="${p.id}" aria-label="Supprimer">🗑</button></td>` : ''}</tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* Badge de liquidation d'un chèque */
function liquidationBadge(p) {
  const l = Store.chequeLiquidation(p);
  return l.liquide
    ? '<span class="badge pay-ok">Totalement liquidé</span>'
    : `<span class="badge pay-part">Non liquidé : ${money(l.nonAffecte)}</span><br><small class="muted">en avance ${esc(l.avance.numero)}</small>`;
}

/* Détails d'un paiement selon son mode */
function payDetails(p) {
  switch (p.mode) {
    case 'cheque': {
      const b = p.bordereauId && Store.data.bordereaux.find(x => x.id === p.bordereauId);
      return `Chèque n° <b>${esc(p.numero)}</b> — porteur : ${esc(p.porteur)}` +
        (b ? `<br><span class="badge pay-ok">Remis ${esc(b.numero)} — ${esc((Store.banque(b.banqueId) || {}).nom || '')}</span>` : '');
    }
    case 'virement': return `Réf. <b>${esc(p.reference)}</b>${p.banque ? ' — ' + esc(p.banque) : ''}`;
    case 'effet':    return `Effet n° <b>${esc(p.numero)}</b> — tireur : ${esc(p.tireur)} — échéance ${fdate(p.echeance)}`;
    case 'avance':   return (p.avanceParts || []).map(part => {
      const a = Store.data.avances.find(x => x.id === part.id) || part;
      return `Prélevé sur l'avance <b>${esc(a.numero || '—')}</b>${a.origine ? ` <small class="muted">(${esc(a.origine)})</small>` : ''} : ${money(part.montant)}`;
    }).join('<br>') || 'Prélevé sur l\'avance du client';
    default:         return '';
  }
}

function plate(immat) { return `<span class="plate">${esc(immat || '—')}</span>`; }

/* Image de remplacement quand le produit n'a pas de photo */
function placeholderImg(text) {
  const t = esc((text || '?').slice(0, 2).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220"><rect width="100%" height="100%" fill="#fdebe0"/><text x="50%" y="55%" font-family="Arial" font-size="64" font-weight="bold" fill="#e2703a" text-anchor="middle">${t}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function productImg(p) { return p.photo || placeholderImg(p.nom); }

/* Compression d'une photo (appareil photo ou galerie) en JPEG */
function compressImage(file, maxSize = 640, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        else if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Notifications */
function toast(msg, type = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('hide'), 2600);
  setTimeout(() => t.remove(), 3100);
}

/* Fenêtre modale générique */
function openModal(title, bodyHtml, { footer = '', wide = false } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.id = 'modal';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Fermer">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  return wrap;
}
function closeModal() {
  $('#modal')?.remove();
  document.body.classList.remove('no-scroll');
}
function confirmBox(message, onYes, yesLabel = 'Confirmer') {
  const m = openModal('Confirmation', `<p>${message}</p>`, {
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-danger" id="cfYes">${yesLabel}</button>`
  });
  $('#cfYes', m).onclick = () => { closeModal(); onYes(); };
}

/* Bon de commande imprimable */
function printOrder(o) {
  const c = Store.client(o.clientId) || { nom: o.clientNom || '' };
  const rows = o.lignes.map(l => `
    <tr><td>${esc(l.ref)}</td><td>${esc(l.nom)}<br><small>${esc(l.conditionnement || '')}</small></td>
    <td class="r">${l.qte}</td><td class="r">${money(l.prix)}</td><td class="r">${money(l.qte * l.prix)}</td></tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${o.numero}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:30px;color:#222}
    h1{margin:0;color:#2d3480}.head{display:flex;justify-content:space-between;border-bottom:3px solid #2d3480;padding-bottom:12px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;font-size:14px}
    th{background:#e8ebf7;text-align:left}.r{text-align:right}.tot td{font-weight:bold;font-size:16px}
    .box{border:1px solid #ccc;padding:10px;border-radius:6px;width:45%}.row{display:flex;justify-content:space-between}
    .sign{margin-top:60px;display:flex;justify-content:space-between}
  </style></head><body>
  <div class="head"><div><img src="${LOGO_URL}" style="height:70px"><div>Minoterie — Fès</div></div>
  <div style="text-align:right"><h2 style="margin:0">BON DE COMMANDE</h2><div>N° ${o.numero}</div><div>Date : ${fdate(o.date)}</div>
  ${o.dateLivraison ? `<div>Livraison prévue : ${fdate(o.dateLivraison)}</div>` : ''}</div></div>
  <div class="row"><div class="box"><b>Client</b><br>${esc(c.nom)}<br>${esc(c.adresse || '')} ${esc(c.ville || '')}<br>${esc(c.tel || '')}${c.ice ? '<br>ICE : ' + esc(c.ice) : ''}</div>
  <div class="box"><b>Commercial</b><br>${esc(o.commercialNom)}<br>Statut : ${STATUTS[o.statut]?.label || o.statut}</div></div>
  <table><thead><tr><th>Réf.</th><th>Désignation</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Montant</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr class="tot"><td colspan="4" class="r">TOTAL</td><td class="r">${money(Store.orderTotal(o))}</td></tr></tfoot></table>
  ${o.notes ? `<p><b>Observations :</b> ${esc(o.notes)}</p>` : ''}
  <div class="sign"><div>Signature client</div><div>Cachet SOGM</div></div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* =========================================================
   Barre de recherche commune : entre deux dates, et/ou un client
   ========================================================= */
const todayISO = () => new Date().toISOString().slice(0, 10);

/* HTML de la barre. opts.text : placeholder du champ texte libre (facultatif) */
function filterBarHtml(opts = {}) {
  return `
    <div class="filter-bar">
      <label>Du<input type="date" data-f="from"></label>
      <label>Au<input type="date" data-f="to"></label>
      ${opts.client === false ? '' : '<label class="fb-client">Client<select data-f="client"></select></label>'}
      ${opts.text ? `<label class="fb-text">Recherche<input type="search" data-f="q" placeholder="${esc(opts.text)}"></label>` : ''}
      <div class="fb-quick">
        <button type="button" class="btn btn-sm btn-light" data-f="today">Aujourd'hui</button>
        <button type="button" class="btn btn-sm btn-light" data-f="all">Toutes les dates</button>
      </div>
    </div>`;
}

/* Active la barre contenue dans `root`. defaultToday : afficher par défaut les opérations du jour */
function bindFilterBar(root, onChange, { defaultToday = true } = {}) {
  const el = k => root.querySelector(`[data-f="${k}"]`);
  const sel = el('client');
  if (sel) {
    sel.innerHTML = '<option value="">Tous les clients</option>' + [...Store.data.clients]
      .sort((a, b) => a.nom.localeCompare(b.nom)).map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('');
  }
  const setDates = (from, to) => { el('from').value = from; el('to').value = to; };
  if (defaultToday) setDates(todayISO(), todayISO());
  const marks = () => {
    el('today').classList.toggle('active', el('from').value === todayISO() && el('to').value === todayISO());
    el('all').classList.toggle('active', !el('from').value && !el('to').value);
  };
  const fire = () => { marks(); onChange(); };
  ['from', 'to', 'client', 'q'].forEach(k => el(k) && el(k).addEventListener('input', fire));
  el('today').onclick = () => { setDates(todayISO(), todayISO()); fire(); };
  el('all').onclick = () => { setDates('', ''); fire(); };
  marks(); // l'appelant fait le premier affichage
  return () => ({
    from: el('from').value, to: el('to').value,
    clientId: sel ? +sel.value || 0 : 0,
    q: el('q') ? el('q').value.trim().toLowerCase() : ''
  });
}

/* Teste une opération (date ISO, client, texte) contre le filtre */
function matchFilter(f, dateIso, clientId, text = '') {
  const d = (dateIso || '').slice(0, 10);
  return (!f.from || d >= f.from) && (!f.to || d <= f.to) &&
    (!f.clientId || clientId === f.clientId) &&
    (!f.q || text.toLowerCase().includes(f.q));
}

/* Bordereau de remise de chèques imprimable */
function printBordereau(b) {
  const bq = Store.banque(b.banqueId) || { nom: b.banqueId, compte: '' };
  const rows = b.cheques.map((x, i) => `<tr><td class="r">${i + 1}</td><td>${esc(x.numero)}</td><td>${esc(x.porteur)}</td>
    <td>${esc(x.clientNom)}</td><td>${esc(x.chargementNumero)}</td><td class="r">${money(x.montant)}</td></tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${b.numero}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:30px;color:#222}
    .head{display:flex;justify-content:space-between;border-bottom:3px solid #2d3480;padding-bottom:12px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #bbb;padding:7px;font-size:13px}
    th{background:#e8ebf7;text-align:left}.r{text-align:right}.box{border:1px solid #bbb;padding:10px;border-radius:6px;margin-top:8px}
    .tot td{font-weight:bold;font-size:15px}.sign{margin-top:60px;display:flex;justify-content:space-between}
  </style></head><body>
  <div class="head"><div><img src="${LOGO_URL}" style="height:70px"><div>Minoterie — Fès</div></div>
  <div style="text-align:right"><h2 style="margin:0">BORDEREAU DE REMISE DE CHÈQUES</h2><div>N° ${b.numero}</div><div>Date : ${fdate(b.date)}</div></div></div>
  <div class="box"><b>Banque :</b> ${esc(bq.nom)}${bq.compte ? ` &nbsp;—&nbsp; <b>Compte :</b> ${esc(bq.compte)}` : ''}<br>
    <b>Remettant :</b> SO.G.M &nbsp;—&nbsp; ${b.cheques.length} chèque(s)</div>
  <table><thead><tr><th class="r">#</th><th>N° chèque</th><th>Porteur</th><th>Client</th><th>Chargement</th><th class="r">Montant</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr class="tot"><td colspan="5" class="r">TOTAL (${b.cheques.length} chèque(s))</td><td class="r">${money(b.total)}</td></tr></tfoot></table>
  <p>Établi par : ${esc(b.par)}</p>
  <div class="sign"><div>Signature du remettant</div><div>Cachet de la banque</div></div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* Bon de chargement imprimable */
function printChargement(c) {
  const cl = Store.client(c.clientId) || { nom: c.clientNom };
  const charged = c.statut === 'charge' || c.statut === 'livre';
  const rows = c.lignes.map(l => `
    <tr><td>${esc(l.ref)}</td><td>${esc(l.nom)}</td><td>${esc(l.conditionnement || '')}</td>
    <td class="r">${l.qte}</td><td class="r">${charged ? l.qteChargee : ''}</td></tr>`).join('');
  const tq = c.lignes.reduce((s, l) => s + l.qte, 0);
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${c.numero}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:30px;color:#222}h1{margin:0;color:#2d3480}
    .head{display:flex;justify-content:space-between;border-bottom:3px solid #2d3480;padding-bottom:12px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;font-size:14px}
    th{background:#e8ebf7;text-align:left}.r{text-align:right}.row{display:flex;gap:4%}.box{border:1px solid #ccc;padding:10px;border-radius:6px;flex:1}
    .plate{display:inline-block;border:2px solid #222;border-radius:5px;padding:2px 10px;font-weight:bold;font-size:18px;letter-spacing:1px}
    .sign{margin-top:60px;display:flex;justify-content:space-between}
  </style></head><body>
  <div class="head"><div><img src="${LOGO_URL}" style="height:70px"><div>Minoterie — Fès</div></div>
  <div style="text-align:right"><h2 style="margin:0">BON DE CHARGEMENT</h2><div>N° ${c.numero}</div><div>Date : ${fdate(c.date)}</div>
  ${c.orderNumero ? `<div>Commande : ${c.orderNumero}</div>` : '<div>Chargement direct</div>'}</div></div>
  <div class="row">
    <div class="box"><b>Client</b><br>${esc(cl.nom)}<br>${esc(cl.adresse || '')} ${esc(cl.ville || '')}<br>${esc(cl.tel || '')}</div>
    <div class="box"><b>Camion</b><br><span class="plate">${esc(c.camion.immatriculation)}</span>
      ${c.datePrevue ? '<br>Chargement prévu : ' + fdate(c.datePrevue) : ''}</div>
  </div>
  <table><thead><tr><th>Réf.</th><th>Désignation</th><th>Sac</th><th class="r">Qté demandée</th><th class="r">Qté chargée</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><th colspan="3" class="r">Total</th><th class="r">${tq}</th>
  <th class="r">${charged ? c.lignes.reduce((s, l) => s + (l.qteChargee || 0), 0) : ''}</th></tr></tfoot></table>
  ${c.notes ? `<p><b>Observations :</b> ${esc(c.notes)}</p>` : ''}
  <p>Vendeur : ${esc(c.vendeurNom)}${c.operateurNom ? ' • Opérateur : ' + esc(c.operateurNom) : ''}</p>
  <div class="sign"><div>Opérateur de chargement</div><div>Vendeur</div></div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* Formulaire camion réutilisable (vendeur) : immatriculation + date prévue */
function truckFields(c = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <label>Camion (immatriculation) *<input name="immatriculation" required list="truckList" autocapitalize="characters"
      placeholder="12345-A-6" value="${esc(c.immatriculation || '')}">${truckDatalist()}</label>
    <label>Date de chargement prévue<input name="datePrevue" type="date" value="${esc(c.datePrevue || today)}"></label>`;
}
/* Liste des camions déjà utilisés, pour une saisie rapide */
function truckDatalist() {
  return `<datalist id="truckList">${[...Store.knownTrucks().keys()].map(t => `<option value="${esc(t)}">`).join('')}</datalist>`;
}
function readTruck(fd) {
  return { immatriculation: (fd.get('immatriculation') || '').trim().toUpperCase() };
}

Store.load();
