/* SOGM - Espace administrateur */
const admin = requireRole('admin');

const VIEWS = {
  dashboard: { title: 'Tableau de bord', render: renderDashboard },
  orders:    { title: 'Commandes',       render: renderOrders },
  loadings:  { title: 'Chargements',     render: renderLoadings },
  products:  { title: 'Produits',        render: renderProducts },
  sacs:      { title: 'Sacs',            render: renderSacs },
  clients:   { title: 'Clients',         render: renderClients },
  banques:   { title: 'Banques & chèques', render: renderBanques },
  users:     { title: 'Utilisateurs',    render: renderUsers },
  backup:    { title: 'Sauvegarde',      render: renderBackup }
};

if (admin) init();

function init() {
  $('#userName').innerHTML = `👤 <b>${esc(admin.nom)}</b>`;
  $('#logoutBtn').onclick = logout;
  $('#menuBtn').onclick = () => document.body.classList.toggle('sb-open');
  $('#sbOverlay').onclick = () => document.body.classList.remove('sb-open');
  window.addEventListener('hashchange', route);
  // Rafraîchir si les données sont modifiées dans un autre onglet (ex : commercial sur le même appareil)
  window.addEventListener('storage', e => { if (e.key === DB_KEY) { Store.load(); route(); } });
  route();
}

function route() {
  const v = (location.hash || '#dashboard').slice(1);
  const view = VIEWS[v] ? v : 'dashboard';
  $$('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('#pageTitle').textContent = VIEWS[view].title;
  $('#topActions').innerHTML = '';
  document.body.classList.remove('sb-open');
  VIEWS[view].render();
  updatePending();
}

function updatePending() {
  const n = Store.data.orders.filter(o => o.statut === 'attente').length;
  $('#pendingCount').textContent = n || '';
  const l = Store.data.chargements.filter(c => c.statut === 'a_charger' || c.statut === 'charge').length;
  $('#loadCount').textContent = l || '';
}

/* ================= TABLEAU DE BORD ================= */
function renderDashboard() {
  const orders = Store.data.orders;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const valid = orders.filter(o => o.statut !== 'annulee');
  const caMonth = valid.filter(o => o.date.slice(0, 7) === month).reduce((s, o) => s + Store.orderTotal(o), 0);
  const todayCount = orders.filter(o => o.date.slice(0, 10) === today).length;
  const pending = orders.filter(o => o.statut === 'attente').length;
  const lowStock = Store.data.products.filter(p => p.actif && p.stock <= 50);
  const toLoad = Store.data.chargements.filter(c => c.statut === 'a_charger').length;
  const onRoad = Store.data.chargements.filter(c => c.statut === 'charge').length;
  const lowSacs = Store.data.sacs.filter(s => s.quantite <= 200);
  const credit = round2(Store.data.chargements.filter(c => c.statut !== 'annule').reduce((s, c) => s + Math.max(0, Store.chgReste(c)), 0));
  const today2 = new Date().toISOString().slice(0, 10);
  let cashToday = 0, chequeToday = 0;
  Store.data.chargements.forEach(c => (c.paiements || []).forEach(p => {
    if (p.date.slice(0, 10) !== today2) return;
    if (p.mode === 'especes') cashToday += p.montant; else chequeToday += p.montant;
  }));

  // Top produits (quantités)
  const qty = {};
  valid.forEach(o => o.lignes.forEach(l => { qty[l.nom] = (qty[l.nom] || 0) + l.qte; }));
  const top = Object.entries(qty).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top[0]?.[1] || 1;

  const recent = [...orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  $('#content').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Commandes aujourd'hui</span><b>${todayCount}</b></div>
      <div class="kpi kpi-warn"><span>En attente de validation</span><b>${pending}</b></div>
      <div class="kpi"><span>CA du mois (hors annulées)</span><b>${money(caMonth)}</b></div>
      <div class="kpi"><span>Camions à charger / en livraison</span><b>${toLoad} / ${onRoad}</b></div>
      <div class="kpi kpi-accent"><span>Crédit clients (reste à payer)</span><b>${money(credit)}</b></div>
      <div class="kpi"><span>Encaissé aujourd'hui (espèces / chèques)</span><b class="kpi-sm">${money(round2(cashToday))} / ${money(round2(chequeToday))}</b></div>
      <div class="kpi ${lowStock.length ? 'kpi-danger' : ''}"><span>Produits en stock faible</span><b>${lowStock.length}</b></div>
    </div>
    <div class="dash-grid">
      <div class="panel">
        <h3>Dernières commandes</h3>
        ${recent.length ? `<table class="table"><tbody>${recent.map(o => `
          <tr class="clickable" data-oid="${o.id}"><td><b>${o.numero}</b><br><small class="muted">${fdate(o.date, true)}</small></td>
          <td>${esc(o.clientNom)}</td><td class="r">${money(Store.orderTotal(o))}</td><td>${statutBadge(o.statut)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">Aucune commande pour le moment.</p>'}
      </div>
      <div class="panel">
        <h3>Produits les plus commandés</h3>
        ${top.length ? top.map(([n, q]) => `
          <div class="bar-row"><span>${esc(n)}</span><div class="bar"><div style="width:${(q / max) * 100}%"></div></div><b>${q}</b></div>`).join('')
          : '<p class="empty">Pas encore de données.</p>'}
        <h3 style="margin-top:24px">Alertes stock (≤ 50)</h3>
        ${lowStock.length ? lowStock.map(p => `<div class="alert-row">⚠ ${esc(p.nom)} — <b>${p.stock}</b> ${esc(p.conditionnement)}</div>`).join('')
          : '<p class="muted">Aucune alerte.</p>'}
        <h3 style="margin-top:24px">Sacs vides (≤ 200)</h3>
        ${lowSacs.length ? lowSacs.map(s => `<div class="alert-row">⚠ ${esc(s.designation)} — <b>${s.quantite}</b></div>`).join('')
          : '<p class="muted">Aucune alerte.</p>'}
      </div>
    </div>`;
  $$('[data-oid]').forEach(r => r.onclick = () => orderDetail(+r.dataset.oid));
}

/* ================= COMMANDES ================= */
let getOrderFilter = () => ({});
function renderOrders() {
  $('#content').innerHTML = `
    <div id="fbOrders"></div>
    <div class="toolbar"><select id="ost">
        <option value="">Tous les statuts</option>
        ${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select></div>
    <div class="panel"><div id="ordersTable"></div></div>`;
  $('#fbOrders').innerHTML = filterBarHtml({ text: 'N°, commercial…' });
  getOrderFilter = bindFilterBar($('#fbOrders'), drawOrdersTable); // par défaut : aujourd'hui
  $('#ost').onchange = drawOrdersTable;
  drawOrdersTable();
}

function drawOrdersTable() {
  const f = getOrderFilter(), st = $('#ost').value;
  const list = Store.data.orders.filter(o => (!st || o.statut === st) &&
    matchFilter(f, o.date, o.clientId, o.numero + ' ' + o.clientNom + ' ' + o.commercialNom))
    .sort((a, b) => b.date.localeCompare(a.date));

  const total = list.filter(o => o.statut !== 'annulee').reduce((s, o) => s + Store.orderTotal(o), 0);

  $('#ordersTable').innerHTML = list.length ? `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Commercial</th><th class="r">Montant</th><th>Statut</th><th></th></tr></thead>
      <tbody>${list.map(o => `
        <tr>
          <td><b>${o.numero}</b></td><td>${fdate(o.date, true)}</td><td>${esc(o.clientNom)}</td>
          <td>${esc(o.commercialNom)}</td><td class="r">${money(Store.orderTotal(o))}</td><td>${statutBadge(o.statut)}</td>
          <td class="actions"><button class="btn btn-sm btn-light" data-view="${o.id}">Détails</button></td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr><th colspan="4" class="r">${list.length} commande(s) — total hors annulées</th><th class="r">${money(total)}</th><th colspan="2"></th></tr></tfoot>
    </table></div>` : '<p class="empty">Aucune commande ne correspond aux filtres.</p>';

  $$('[data-view]', $('#ordersTable')).forEach(b => b.onclick = () => orderDetail(+b.dataset.view));
}

function orderDetail(id) {
  const o = Store.data.orders.find(x => x.id === id);
  const c = Store.client(o.clientId) || {};
  // Le chargement et la livraison sont gérés par le vendeur et l'opérateur de chargement
  const nextActions = {
    attente: [['validee', '✔ Valider', 'btn-primary'], ['annulee', 'Annuler', 'btn-danger']],
    validee: [['attente', 'Remettre en attente', 'btn-light'], ['annulee', 'Annuler', 'btn-danger']],
    annulee: [['attente', 'Réactiver', 'btn-light']]
  }[o.statut] || [];
  const chg = o.chargementId ? Store.chargement(o.chargementId) : null;

  const m = openModal(`Commande ${o.numero}`, `
    <div class="detail-head">
      <div><b>Client :</b> ${esc(o.clientNom)}<br><small class="muted">${esc(c.tel || '')} ${esc(c.ville || '')}</small></div>
      <div><b>Commercial :</b> ${esc(o.commercialNom)}<br><small class="muted">${fdate(o.date, true)}</small></div>
      <div><b>Livraison :</b> ${o.dateLivraison ? fdate(o.dateLivraison) : '—'}<br>${statutBadge(o.statut)}</div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th></th><th>Produit</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Montant</th><th class="r">Stock actuel</th></tr></thead>
      <tbody>${o.lignes.map(l => { const p = Store.product(l.productId);
        return `<tr><td><img class="thumb" src="${p ? productImg(p) : placeholderImg(l.nom)}" alt=""></td>
        <td>${esc(l.nom)}<br><small class="muted">${esc(l.ref)} • ${esc(l.conditionnement || '')}</small></td>
        <td class="r">${l.qte}</td><td class="r">${money(l.prix)}</td><td class="r">${money(l.qte * l.prix)}</td>
        <td class="r ${p && p.stock < l.qte && o.statut !== 'livree' ? 'text-danger' : ''}">${p ? p.stock : '—'}</td></tr>`; }).join('')}
      </tbody>
      <tfoot><tr><th colspan="4" class="r">Total</th><th class="r">${money(Store.orderTotal(o))}</th><th></th></tr></tfoot>
    </table></div>
    ${o.notes ? `<p>📝 ${esc(o.notes)}</p>` : ''}
    ${chg ? `<p class="note-box">🚚 Chargement <b>${chg.numero}</b> — camion ${plate(chg.camion.immatriculation)} — ${chgBadge(chg.statut)}</p>` : ''}
    ${historyHtml(o.historique, STATUTS)}`, {
    wide: true,
    footer: `<button class="btn btn-light" id="printO">🖨 Imprimer</button>
             <button class="btn btn-light text-danger" id="delO">Supprimer</button>
             <span class="spacer"></span>
             ${nextActions.map(([s, l, cls]) => `<button class="btn ${cls}" data-st="${s}">${l}</button>`).join('')}`
  });

  $('#printO', m).onclick = () => printOrder(o);
  $('#delO', m).onclick = () => {
    if (chg && chg.statut !== 'annule') { toast('Commande liée à un chargement : suppression impossible', 'error'); return; }
    confirmBox(`Supprimer définitivement la commande ${o.numero} ?`, () => {
      Store.data.orders = Store.data.orders.filter(x => x.id !== o.id);
      Store.save(); route(); toast('Commande supprimée');
    }, 'Supprimer');
  };
  $$('[data-st]', m).forEach(b => b.onclick = () => {
    const st = b.dataset.st;
    Store.setOrderStatus(o, st);
    closeModal(); route(); toast(`Commande ${STATUTS[st].label.toLowerCase()}`);
  });
}

/* ================= PRODUITS ================= */
function renderProducts() {
  $('#topActions').innerHTML = `<button class="btn btn-primary" id="addP">＋ Nouveau produit</button>`;
  $('#addP').onclick = () => productForm();

  $('#content').innerHTML = `
    <div class="toolbar"><input type="search" id="pq" placeholder="🔍 Rechercher un produit…"></div>
    <div class="admin-products" id="apGrid"></div>`;
  $('#pq').oninput = drawProducts;
  drawProducts();
}

function drawProducts() {
  const q = ($('#pq')?.value || '').toLowerCase();
  const list = Store.data.products.filter(p => !q || (p.nom + p.ref + p.categorie).toLowerCase().includes(q));
  $('#apGrid').innerHTML = list.length ? list.map(p => `
    <article class="ap-card ${p.actif ? '' : 'inactive'}">
      <img src="${productImg(p)}" alt="${esc(p.nom)}">
      <div class="ap-body">
        <div class="ap-title"><b>${esc(p.nom)}</b><span>${p.indisponible ? '<span class="badge st-attente">Indisponible</span> ' : ''}${p.actif ? '' : '<span class="badge st-annulee">Masqué</span>'}</span></div>
        <div class="muted small">${esc(p.ref)} • ${esc(p.categorie)} • ${esc(p.conditionnement)}</div>
        <div class="ap-meta"><b>${money(p.prix)}</b><span class="${p.stock <= 50 ? 'text-danger' : ''}">Stock : ${p.stock}</span></div>
        <div class="ap-actions">
          <button class="btn btn-sm btn-light" data-edit="${p.id}">✏ Modifier</button>
          <button class="btn btn-sm btn-light" data-stock="${p.id}">± Stock</button>
          <button class="btn btn-sm btn-light text-danger" data-del="${p.id}">🗑</button>
        </div>
      </div>
    </article>`).join('') : '<p class="empty">Aucun produit.</p>';

  $$('[data-edit]').forEach(b => b.onclick = () => productForm(Store.product(+b.dataset.edit)));
  $$('[data-stock]').forEach(b => b.onclick = () => stockForm(Store.product(+b.dataset.stock)));
  $$('[data-del]').forEach(b => b.onclick = () => {
    const p = Store.product(+b.dataset.del);
    const used = Store.data.orders.some(o => o.lignes.some(l => l.productId === p.id));
    if (used) {
      confirmBox(`« ${esc(p.nom)} » figure dans des commandes. Il sera masqué pour les commerciaux au lieu d'être supprimé.`, () => {
        p.actif = false; Store.save(); drawProducts(); toast('Produit masqué');
      }, 'Masquer');
    } else {
      confirmBox(`Supprimer le produit « ${esc(p.nom)} » ?`, () => {
        Store.data.products = Store.data.products.filter(x => x.id !== p.id); Store.save(); drawProducts(); toast('Produit supprimé');
      }, 'Supprimer');
    }
  });
}

function productForm(p) {
  const isNew = !p;
  p = p || { ref: '', nom: '', categorie: '', conditionnement: '', prix: '', stock: 0, photo: '', actif: true, indisponible: false };
  let photo = p.photo;
  const cats = [...new Set(Store.data.products.map(x => x.categorie).filter(Boolean))];

  const m = openModal(isNew ? 'Nouveau produit' : 'Modifier le produit', `
    <form id="pForm" class="product-form">
      <div class="photo-zone">
        <img id="pPreview" src="${photo || placeholderImg(p.nom || '?')}" alt="Photo du produit">
        <div class="photo-btns">
          <label class="btn btn-secondary btn-sm">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" id="pCam" hidden></label>
          <label class="btn btn-light btn-sm">🖼 Galerie / fichier<input type="file" accept="image/*" id="pFile" hidden></label>
          <button type="button" class="btn btn-light btn-sm text-danger" id="pRemove">Retirer la photo</button>
        </div>
      </div>
      <div class="form-grid">
        <label>Référence *<input name="ref" required value="${esc(p.ref)}"></label>
        <label>Désignation *<input name="nom" required value="${esc(p.nom)}"></label>
        <label>Catégorie<input name="categorie" list="catList" value="${esc(p.categorie)}">
          <datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>Conditionnement<input name="conditionnement" placeholder="Sac 25 kg" value="${esc(p.conditionnement)}"></label>
        <label>Prix unitaire (DH) *<input name="prix" type="number" step="0.01" min="0" required value="${p.prix}"></label>
        <label>Stock initial<input name="stock" type="number" step="1" value="${p.stock}" ${isNew ? '' : 'disabled title="Utilisez ± Stock"'}></label>
        <div class="check-row full">
          <label class="check"><input type="checkbox" name="actif" ${p.actif ? 'checked' : ''}> Visible pour les commerciaux</label>
          <label class="check check-warn"><input type="checkbox" name="indisponible" ${p.indisponible ? 'checked' : ''}> Produit indisponible</label>
        </div>
        <p class="muted small full" style="margin:0">Un produit indisponible reste affiché aux commerciaux (grisé) mais ne peut pas être commandé.</p>
      </div>
    </form>`, {
    wide: true,
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="pForm">Enregistrer</button>`
  });

  const onFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photo = await compressImage(file);
      $('#pPreview', m).src = photo;
    } catch { toast('Image illisible', 'error'); }
  };
  $('#pCam', m).onchange = onFile;
  $('#pFile', m).onchange = onFile;
  $('#pRemove', m).onclick = () => { photo = ''; $('#pPreview', m).src = placeholderImg($('[name=nom]', m).value || '?'); };

  $('#pForm', m).onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const ref = fd.get('ref').trim();
    if (Store.data.products.some(x => x.ref.toLowerCase() === ref.toLowerCase() && x.id !== p.id)) {
      toast('Cette référence existe déjà', 'error'); return;
    }
    const vals = {
      ref, nom: fd.get('nom').trim(), categorie: fd.get('categorie').trim(),
      conditionnement: fd.get('conditionnement').trim(), prix: parseFloat(fd.get('prix')) || 0,
      actif: fd.get('actif') === 'on', indisponible: fd.get('indisponible') === 'on', photo
    };
    const backup = JSON.stringify(Store.data.products);
    if (isNew) Store.data.products.push({ id: Store.nextId('product'), stock: parseInt(fd.get('stock'), 10) || 0, ...vals });
    else Object.assign(p, vals);
    if (!Store.save()) { Store.data.products = JSON.parse(backup); return; }
    closeModal(); drawProducts(); toast('Produit enregistré');
  };
}

function stockForm(p) {
  const m = openModal(`Stock — ${esc(p.nom)}`, `
    <p>Stock actuel : <b>${p.stock}</b> ${esc(p.conditionnement)}</p>
    <form id="sForm" class="form-grid">
      <label>Opération<select name="op"><option value="in">Entrée (production)</option><option value="out">Sortie</option><option value="set">Inventaire (valeur exacte)</option></select></label>
      <label>Quantité<input name="q" type="number" min="0" step="1" required></label>
    </form>`, {
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="sForm">Appliquer</button>`
  });
  $('#sForm', m).onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target), q = parseInt(fd.get('q'), 10) || 0;
    p.stock = fd.get('op') === 'in' ? p.stock + q : fd.get('op') === 'out' ? p.stock - q : q;
    Store.save(); closeModal(); drawProducts(); toast('Stock mis à jour');
  };
}

/* ================= CLIENTS ================= */
function renderClients() {
  $('#topActions').innerHTML = `<button class="btn btn-primary" id="addC">＋ Nouveau client</button>`;
  $('#addC').onclick = () => clientForm();
  $('#content').innerHTML = `
    <div class="toolbar"><input type="search" id="cq" placeholder="🔍 Rechercher un client…"></div>
    <div class="panel"><div id="clientsTable"></div></div>`;
  $('#cq').oninput = drawClients;
  drawClients();
}

function drawClients() {
  const q = ($('#cq')?.value || '').toLowerCase();
  const list = Store.data.clients.filter(c => !q || (c.nom + c.ville + c.tel).toLowerCase().includes(q))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  $('#clientsTable').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Nom</th><th>Téléphone</th><th>Ville</th><th>ICE</th><th class="r">Commandes</th><th class="r">CA</th><th class="r">Reste à payer</th><th class="r">Avance</th><th></th></tr></thead>
    <tbody>${list.map(c => {
      const os = Store.data.orders.filter(o => o.clientId === c.id && o.statut !== 'annulee');
      return `<tr><td><b>${esc(c.nom)}</b><br><small class="muted">${esc(c.adresse || '')}</small></td><td>${esc(c.tel)}</td>
      <td>${esc(c.ville)}</td><td>${esc(c.ice || '')}</td><td class="r">${os.length}</td>
      <td class="r">${money(os.reduce((s, o) => s + Store.orderTotal(o), 0))}</td>
      <td class="r">${(r => r > 0 ? `<b class="text-danger">${money(r)}</b>` : '—')(Store.clientReste(c.id))}</td>
      <td class="r">${(a => a > 0 ? `<b class="text-accent">${money(a)}</b>` : '—')(Store.clientAvance(c.id))}</td>
      <td class="actions"><button class="btn btn-sm btn-light" data-edit="${c.id}">✏</button>
      <button class="btn btn-sm btn-light text-danger" data-del="${c.id}">🗑</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="empty">Aucun client.</p>';

  $$('[data-edit]', $('#clientsTable')).forEach(b => b.onclick = () => clientForm(Store.client(+b.dataset.edit)));
  $$('[data-del]', $('#clientsTable')).forEach(b => b.onclick = () => {
    const c = Store.client(+b.dataset.del);
    if (Store.data.orders.some(o => o.clientId === c.id)) { toast('Ce client a des commandes : suppression impossible', 'error'); return; }
    confirmBox(`Supprimer le client « ${esc(c.nom)} » ?`, () => {
      Store.data.clients = Store.data.clients.filter(x => x.id !== c.id); Store.save(); drawClients(); toast('Client supprimé');
    }, 'Supprimer');
  });
}

function clientForm(c) {
  const isNew = !c;
  c = c || { nom: '', tel: '', ville: '', adresse: '', ice: '' };
  const m = openModal(isNew ? 'Nouveau client' : 'Modifier le client', `
    <form id="cForm" class="form-grid">
      <label class="full">Nom / Raison sociale *<input name="nom" required value="${esc(c.nom)}"></label>
      <label>Téléphone<input name="tel" value="${esc(c.tel)}"></label>
      <label>Ville<input name="ville" value="${esc(c.ville)}"></label>
      <label class="full">Adresse<input name="adresse" value="${esc(c.adresse)}"></label>
      <label class="full">ICE<input name="ice" value="${esc(c.ice)}"></label>
    </form>`, {
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="cForm">Enregistrer</button>`
  });
  $('#cForm', m).onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (isNew) Store.data.clients.push({ id: Store.nextId('client'), ...f });
    else {
      Object.assign(c, f);
      Store.data.orders.forEach(o => { if (o.clientId === c.id) o.clientNom = c.nom; });
    }
    Store.save(); closeModal(); drawClients(); toast('Client enregistré');
  };
}

/* ================= UTILISATEURS ================= */
function renderUsers() {
  $('#topActions').innerHTML = `<button class="btn btn-primary" id="addU">＋ Nouvel utilisateur</button>`;
  $('#addU').onclick = () => userForm();
  const list = Store.data.users;
  $('#content').innerHTML = `<div class="panel"><div class="table-wrap"><table class="table">
    <thead><tr><th>Nom</th><th>Identifiant</th><th>Profil</th><th>État</th><th class="r">Commandes saisies</th><th></th></tr></thead>
    <tbody>${list.map(u => `<tr>
      <td><b>${esc(u.nom)}</b></td><td>${esc(u.login)}</td>
      <td>${ROLES[u.role] ? ROLES[u.role].icon + ' ' + ROLES[u.role].label : esc(u.role)}</td>
      <td>${u.actif ? '<span class="badge st-livree">Actif</span>' : '<span class="badge st-annulee">Désactivé</span>'}</td>
      <td class="r">${Store.data.orders.filter(o => o.commercialId === u.id).length}</td>
      <td class="actions"><button class="btn btn-sm btn-light" data-edit="${u.id}">✏ Modifier</button></td>
    </tr>`).join('')}</tbody></table></div></div>
    <p class="muted small">Commercial : prise de commande • Vendeur : validation des commandes et chargements • Opérateur de chargement : chargement et livraison • Administrateur : tout le programme.</p>`;
  $$('[data-edit]').forEach(b => b.onclick = () => userForm(Store.user(+b.dataset.edit)));
}

function userForm(u) {
  const isNew = !u;
  u = u || { nom: '', login: '', role: 'commercial', actif: true };
  const isSelf = u.id === admin.id;
  const m = openModal(isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur', `
    <form id="uForm" class="form-grid">
      <label class="full">Nom complet *<input name="nom" required value="${esc(u.nom)}"></label>
      <label>Identifiant *<input name="login" required autocapitalize="none" value="${esc(u.login)}"></label>
      <label>Profil<select name="role" ${isSelf ? 'disabled' : ''}>
        ${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
      <label class="full">${isNew ? 'Mot de passe *' : 'Nouveau mot de passe (laisser vide pour ne pas changer)'}
        <input name="pwd" type="password" ${isNew ? 'required' : ''} minlength="4"></label>
      <label class="check full"><input type="checkbox" name="actif" ${u.actif ? 'checked' : ''} ${isSelf ? 'disabled' : ''}> Compte actif</label>
    </form>`, {
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="uForm">Enregistrer</button>`
  });
  $('#uForm', m).onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const login = fd.get('login').trim().toLowerCase();
    if (Store.data.users.some(x => x.login.toLowerCase() === login && x.id !== u.id)) { toast('Identifiant déjà utilisé', 'error'); return; }
    const vals = { nom: fd.get('nom').trim(), login };
    if (!isSelf) { vals.role = fd.get('role'); vals.actif = fd.get('actif') === 'on'; }
    if (fd.get('pwd')) vals.pwd = hashPwd(fd.get('pwd'));
    if (isNew) Store.data.users.push({ id: Store.nextId('user'), role: 'commercial', actif: true, ...vals });
    else Object.assign(u, vals);
    Store.save(); closeModal(); renderUsers(); toast('Utilisateur enregistré');
  };
}

/* ================= CHARGEMENTS ================= */
let loadFilter = '';
function renderLoadings() {
  $('#content').innerHTML = `
    <div id="fbLoad"></div>
    <div class="toolbar">
      <select id="lst"><option value="">Tous les statuts</option>
        ${Object.entries(CHG_STATUTS).map(([k, v]) => `<option value="${k}" ${loadFilter === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    </div>
    <div class="panel"><div id="loadTable"></div></div>`;
  let getF = () => ({});
  const draw = () => {
    loadFilter = $('#lst').value;
    const f = getF();
    const list = Store.data.chargements.filter(c => (!loadFilter || c.statut === loadFilter) &&
      matchFilter(f, c.date, c.clientId, [c.numero, c.camion.immatriculation, c.orderNumero].join(' ')))
      .sort((a, b) => b.date.localeCompare(a.date));
    $('#loadTable').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Camion</th><th>Commande</th><th class="r">Montant</th><th class="r">Reste à payer</th><th>Statut</th><th></th></tr></thead>
      <tbody>${list.map(c => `<tr>
        <td><b>${c.numero}</b></td><td>${fdate(c.date, true)}</td><td>${esc(c.clientNom)}</td>
        <td>${plate(c.camion.immatriculation)}</td>
        <td>${c.orderNumero ? esc(c.orderNumero) : '<span class="muted">Direct</span>'}</td>
        <td class="r">${money(Store.chgMontant(c))}</td>
        <td class="r">${c.statut === 'annule' ? '—' : `<b class="${Store.chgReste(c) > 0.001 ? 'text-danger' : 'text-ok'}">${money(Math.max(0, Store.chgReste(c)))}</b><br>${payBadge(c)}`}</td>
        <td>${chgBadge(c.statut)}</td>
        <td class="actions"><button class="btn btn-sm btn-light" data-c="${c.id}">Détails</button></td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty">Aucun chargement.</p>';
    $$('[data-c]').forEach(b => b.onclick = () => loadingDetail(Store.chargement(+b.dataset.c)));
  };
  $('#fbLoad').innerHTML = filterBarHtml({ text: 'N°, camion…' });
  getF = bindFilterBar($('#fbLoad'), draw); // par défaut : aujourd'hui
  $('#lst').onchange = draw;
  draw();
}

function loadingDetail(c) {
  const charged = c.statut === 'charge' || c.statut === 'livre';
  const m = openModal(`Chargement ${c.numero}`, `
    <div class="detail-head">
      <div><b>Client :</b> ${esc(c.clientNom)}<br><small class="muted">${c.orderNumero ? 'Commande ' + esc(c.orderNumero) : 'Chargement direct'} • Vendeur : ${esc(c.vendeurNom)}</small></div>
      <div><b>Camion :</b> ${plate(c.camion.immatriculation)}<br><small class="muted">Prévu : ${c.datePrevue ? fdate(c.datePrevue) : '—'}</small></div>
      <div>${chgBadge(c.statut)}<br><small class="muted">${c.operateurNom ? 'Opérateur : ' + esc(c.operateurNom) : ''}</small></div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Produit</th><th>Sac</th><th class="r">Demandé</th><th class="r">Chargé</th><th class="r">P.U.</th><th class="r">Montant</th></tr></thead>
      <tbody>${c.lignes.map(l => `<tr><td><b>${esc(l.nom)}</b></td><td><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></td>
        <td class="r">${l.qte}</td><td class="r ${charged && l.qteChargee !== l.qte ? 'text-danger' : ''}">${charged ? l.qteChargee : '—'}</td>
        <td class="r">${money(l.prix)}</td><td class="r">${money((charged ? l.qteChargee : l.qte) * l.prix)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${c.notes ? `<p>📝 ${esc(c.notes)}</p>` : ''}
    ${c.statut !== 'annule' ? `<h3 class="sec-title">Paiements ${payBadge(c)}</h3>${paySummary(c)}${paymentsTable(c)}` : ''}
    ${historyHtml(c.historique, CHG_STATUTS)}`, {
    wide: true,
    footer: `<span class="spacer"></span><button class="btn btn-primary" id="lp">🖨 Bon de chargement</button>`
  });
  $('#lp', m).onclick = () => printChargement(c);
}

function historyHtml(h, map) {
  return `<details><summary>Historique</summary><ul class="history">${(h || []).map(x =>
    `<li>${fdate(x.date, true)} — ${map[x.statut]?.label || x.statut}${x.note ? ' : ' + esc(x.note) : ''} <span class="muted">(${esc(x.par)})</span></li>`).join('')}</ul></details>`;
}

/* ================= SACS ================= */
function renderSacs() {
  $('#topActions').innerHTML = `<button class="btn btn-primary" id="addS">＋ Nouveau sac</button>`;
  $('#addS').onclick = () => sacForm();
  $('#content').innerHTML = `
    <div class="toolbar"><input type="search" id="sq" placeholder="🔍 Référence ou désignation…"></div>
    <div class="panel"><div id="sacTable"></div></div>`;
  $('#sq').oninput = drawSacs;
  drawSacs();
}

function drawSacs() {
  const q = ($('#sq')?.value || '').toLowerCase();
  const list = Store.data.sacs.filter(s => !q || (s.ref + ' ' + s.designation).toLowerCase().includes(q))
    .sort((a, b) => a.ref.localeCompare(b.ref));
  const total = list.reduce((s, x) => s + x.quantite, 0);
  $('#sacTable').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Référence</th><th>Désignation</th><th class="r">Quantité</th><th>Dernier mouvement</th><th></th></tr></thead>
    <tbody>${list.map(s => { const last = (s.mouvements || []).at(-1);
      return `<tr>
      <td><b>${esc(s.ref)}</b></td><td>${esc(s.designation)}</td>
      <td class="r"><b class="${s.quantite <= 200 ? 'text-danger' : ''}">${s.quantite}</b></td>
      <td class="small muted">${last ? `${fdate(last.date, true)} — ${last.type === 'in' ? '+' : last.type === 'out' ? '−' : '='}${last.qte}${last.motif ? ' (' + esc(last.motif) + ')' : ''}` : '—'}</td>
      <td class="actions">
        <button class="btn btn-sm btn-secondary" data-mv="${s.id}">± Mouvement</button>
        <button class="btn btn-sm btn-light" data-hist="${s.id}">Historique</button>
        <button class="btn btn-sm btn-light" data-edit="${s.id}">✏</button>
        <button class="btn btn-sm btn-light text-danger" data-del="${s.id}">🗑</button></td></tr>`; }).join('')}</tbody>
    <tfoot><tr><th colspan="2" class="r">Total</th><th class="r">${total}</th><th colspan="2"></th></tr></tfoot>
  </table></div>` : '<p class="empty">Aucun sac enregistré.</p>';

  const T = $('#sacTable');
  $$('[data-edit]', T).forEach(b => b.onclick = () => sacForm(Store.sac(+b.dataset.edit)));
  $$('[data-mv]', T).forEach(b => b.onclick = () => sacMove(Store.sac(+b.dataset.mv)));
  $$('[data-hist]', T).forEach(b => b.onclick = () => sacHistory(Store.sac(+b.dataset.hist)));
  $$('[data-del]', T).forEach(b => b.onclick = () => {
    const s = Store.sac(+b.dataset.del);
    confirmBox(`Supprimer le sac « ${esc(s.designation)} » ?`, () => {
      Store.data.sacs = Store.data.sacs.filter(x => x.id !== s.id); Store.save(); drawSacs(); toast('Sac supprimé');
    }, 'Supprimer');
  });
}

function sacForm(s) {
  const isNew = !s;
  s = s || { ref: '', designation: '', quantite: 0 };
  const m = openModal(isNew ? 'Nouveau sac' : 'Modifier le sac', `
    <form id="sacF" class="form-grid">
      <label>Référence *<input name="ref" required value="${esc(s.ref)}"></label>
      <label>Quantité ${isNew ? 'initiale' : ''}<input name="quantite" type="number" inputmode="numeric" step="1" value="${s.quantite}" ${isNew ? '' : 'disabled title="Utilisez ± Mouvement"'}></label>
      <label class="full">Désignation *<input name="designation" required placeholder="Sac Farine de luxe 25 kg" value="${esc(s.designation)}"></label>
    </form>`, {
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="sacF">Enregistrer</button>`
  });
  $('#sacF', m).onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const ref = fd.get('ref').trim();
    if (Store.data.sacs.some(x => x.ref.toLowerCase() === ref.toLowerCase() && x.id !== s.id)) { toast('Cette référence existe déjà', 'error'); return; }
    if (isNew) {
      const q = parseInt(fd.get('quantite'), 10) || 0;
      Store.data.sacs.push({ id: Store.nextId('sac'), ref, designation: fd.get('designation').trim(), quantite: q,
        mouvements: q ? [{ date: new Date().toISOString(), type: 'set', qte: q, motif: 'Stock initial', par: admin.nom }] : [] });
    } else Object.assign(s, { ref, designation: fd.get('designation').trim() });
    Store.save(); closeModal(); drawSacs(); toast('Sac enregistré');
  };
}

function sacMove(s) {
  const m = openModal(`Mouvement — ${esc(s.designation)}`, `
    <p>Quantité actuelle : <b>${s.quantite}</b></p>
    <form id="mvF" class="form-grid">
      <label>Opération<select name="type">
        <option value="in">Entrée (réception fournisseur)</option>
        <option value="out">Sortie (utilisation ensachage)</option>
        <option value="set">Inventaire (quantité exacte)</option></select></label>
      <label>Quantité<input name="qte" type="number" inputmode="numeric" min="0" step="1" required></label>
      <label class="full">Motif / référence<input name="motif" placeholder="Bon de réception, production du jour…"></label>
    </form>`, {
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="mvF">Appliquer</button>`
  });
  $('#mvF', m).onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target), type = fd.get('type'), q = parseInt(fd.get('qte'), 10) || 0;
    if (type === 'out' && q > s.quantite) { toast(`Sortie supérieure à la quantité disponible (${s.quantite})`, 'error'); return; }
    s.quantite = type === 'in' ? s.quantite + q : type === 'out' ? s.quantite - q : q;
    s.mouvements = s.mouvements || [];
    s.mouvements.push({ date: new Date().toISOString(), type, qte: q, motif: (fd.get('motif') || '').trim(), par: admin.nom });
    Store.save(); closeModal(); drawSacs(); toast('Mouvement enregistré');
  };
}

function sacHistory(s) {
  const mv = [...(s.mouvements || [])].reverse();
  openModal(`Historique — ${esc(s.designation)}`, mv.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Date</th><th>Opération</th><th class="r">Qté</th><th>Motif</th><th>Par</th></tr></thead>
    <tbody>${mv.map(x => `<tr><td>${fdate(x.date, true)}</td><td>${{ in: 'Entrée', out: 'Sortie', set: 'Inventaire' }[x.type]}</td>
      <td class="r">${x.type === 'in' ? '+' : x.type === 'out' ? '−' : '='}${x.qte}</td><td>${esc(x.motif || '')}</td><td>${esc(x.par || '')}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="empty">Aucun mouvement.</p>', { wide: true });
}

/* ================= BANQUES & BORDEREAUX ================= */
function renderBanques() {
  const pending = Store.pendingCheques();
  const pTot = round2(pending.reduce((s, x) => s + (x.p.recu || x.p.montant), 0));
  $('#content').innerHTML = `
    <div class="panel">
      <h3>Comptes bancaires de la société</h3>
      <form id="bankForm" class="form-grid">
        ${Store.data.banques.map(b => `<label>${esc(b.nom)} — numéro de compte / RIB
          <input name="${b.id}" value="${esc(b.compte)}" placeholder="RIB à 24 chiffres"></label>`).join('')}
        <div class="full btn-row" style="justify-content:flex-end"><button class="btn btn-primary">Enregistrer</button></div>
      </form>
    </div>
    <div class="kpis">
      <div class="kpi kpi-accent"><span>Chèques en attente de remise</span><b>${pending.length}</b></div>
      <div class="kpi"><span>Montant en attente de remise</span><b>${money(pTot)}</b></div>
      ${Store.data.banques.map(b => {
        const tot = round2(Store.data.bordereaux.filter(x => x.banqueId === b.id).reduce((s, x) => s + x.total, 0));
        return `<div class="kpi"><span>Total remis — ${esc(b.nom)}</span><b>${money(tot)}</b></div>`;
      }).join('')}
    </div>
    <div id="fbBordA"></div>
    <div class="panel"><h3>Bordereaux de remise</h3><div id="bordTableA"></div></div>`;

  $('#bankForm').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Store.data.banques.forEach(b => { b.compte = (fd.get(b.id) || '').trim(); });
    Store.save(); toast('Comptes bancaires enregistrés');
  };
  let getF = () => ({});
  const draw = () => {
    const f = getF();
    const list = Store.data.bordereaux.filter(b => matchFilter(f, b.date, 0, b.numero + ' ' + b.cheques.map(x => x.numero + ' ' + x.porteur).join(' ')) &&
      (!f.clientId || b.cheques.some(x => x.clientId === f.clientId))).sort((a, b) => b.date.localeCompare(a.date));
    $('#bordTableA').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Bordereau</th><th>Date</th><th>Banque</th><th>Chèques</th><th class="r">Total</th><th>Établi par</th><th></th></tr></thead>
      <tbody>${list.map(b => `<tr><td><b>${b.numero}</b></td><td>${fdate(b.date, true)}</td><td>${esc((Store.banque(b.banqueId) || {}).nom || '')}</td>
        <td class="small">${b.cheques.map(x => `n° ${esc(x.numero)} (${esc(x.clientNom)})`).join('<br>')}</td>
        <td class="r"><b>${money(b.total)}</b></td><td>${esc(b.par)}</td>
        <td class="actions"><button class="btn btn-sm btn-light" data-print="${b.id}">🖨</button></td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty">Aucun bordereau pour ces critères.</p>';
    $$('[data-print]', $('#bordTableA')).forEach(bt => bt.onclick = () => printBordereau(Store.data.bordereaux.find(x => x.id === +bt.dataset.print)));
  };
  $('#fbBordA').innerHTML = filterBarHtml({ text: 'N° bordereau ou chèque…' });
  getF = bindFilterBar($('#fbBordA'), draw);
  draw();
}

/* ================= SAUVEGARDE ================= */
function renderBackup() {
  let size = 0;
  try { size = (localStorage.getItem(DB_KEY) || '').length; } catch {}
  $('#content').innerHTML = `
    <div class="panel">
      <h3>Exporter / importer les données</h3>
      <p class="muted">Les données sont enregistrées dans le navigateur de cet appareil (${(size / 1024).toFixed(0)} Ko utilisés sur environ 5 000 Ko).
      Exportez régulièrement une sauvegarde. L'import permet aussi de transférer les commandes saisies sur une tablette vers le poste administrateur.</p>
      <div class="btn-row">
        <button class="btn btn-primary" id="exp">⬇ Exporter (.json)</button>
        <label class="btn btn-secondary">⬆ Importer un fichier<input type="file" accept=".json,application/json" id="imp" hidden></label>
        <button class="btn btn-light" id="merge">⇆ Fusionner les commandes d'un fichier</button>
        <input type="file" accept=".json,application/json" id="mergeFile" hidden>
      </div>
    </div>
    <div class="panel danger-zone">
      <h3>Réinitialisation</h3>
      <p class="muted">Efface toutes les données et restaure les données de démonstration.</p>
      <button class="btn btn-danger" id="rst">Réinitialiser</button>
    </div>`;

  $('#exp').onclick = () => Store.exportJSON();
  $('#imp').onchange = e => readFile(e.target.files[0], text => {
    confirmBox('L\'import remplacera TOUTES les données actuelles. Continuer ?', () => {
      try { Store.importJSON(text); toast('Données importées'); route(); } catch (err) { toast(err.message, 'error'); }
    }, 'Importer');
  });
  $('#merge').onclick = () => $('#mergeFile').click();
  $('#mergeFile').onchange = e => readFile(e.target.files[0], text => {
    try {
      const d = JSON.parse(text);
      const existing = new Set(Store.data.orders.map(o => o.date + '|' + o.commercialId + '|' + o.clientNom));
      let added = 0;
      (d.orders || []).forEach(o => {
        const key = o.date + '|' + o.commercialId + '|' + o.clientNom;
        if (existing.has(key)) return;
        // rattachement / création du client
        let c = Store.data.clients.find(x => x.nom.toLowerCase() === (o.clientNom || '').toLowerCase());
        if (!c) {
          const src = (d.clients || []).find(x => x.id === o.clientId) || { nom: o.clientNom };
          c = { ...src, id: Store.nextId('client') };
          Store.data.clients.push(c);
        }
        const id = Store.nextId('order');
        Store.data.orders.push({ ...o, id, numero: Store.orderNumber(id), clientId: c.id, statut: o.statut === 'livree' ? 'validee' : o.statut });
        added++;
      });
      Store.save(); toast(`${added} commande(s) ajoutée(s)`); updatePending();
    } catch { toast('Fichier invalide', 'error'); }
  });
  $('#rst').onclick = () => confirmBox('Effacer toutes les données ?', () => { Store.reset(); toast('Données réinitialisées'); route(); }, 'Tout effacer');
}

function readFile(file, cb) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => cb(r.result);
  r.readAsText(file);
}
