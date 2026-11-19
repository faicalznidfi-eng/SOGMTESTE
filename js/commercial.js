/* SOGM - Espace commercial (prise de commande tactile)
   - Produits classés par nombre de commandes décroissant
   - Toucher un produit ouvre un pavé numérique pour saisir la quantité
   - Les produits commandés s'alignent dans la liste en haut jusqu'à l'enregistrement */
const me = requireRole('commercial');
let getMineFilter = () => ({});
const cart = new Map(); // productId -> { qte, prix } (l'ordre d'insertion = ordre d'affichage)
let currentCat = '';

if (me) init();

function init() {
  $('#userName').textContent = '— ' + me.nom;
  $('#logoutBtn').onclick = () => {
    if (cart.size) confirmBox('La commande en cours sera perdue. Se déconnecter ?', logout, 'Se déconnecter');
    else logout();
  };

  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  $('#search').addEventListener('input', renderProducts);
  $('#newClientBtn').onclick = newClientForm;
  $('#saveBtn').onclick = openRecap;
  $('#clearBtn').onclick = () => confirmBox('Vider la commande en cours ?', () => { cart.clear(); refresh(); }, 'Vider');
  $('#mineFilter').onchange = renderMyOrders;
  $('#fbMine').innerHTML = filterBarHtml({ text: 'N° de commande…' });
  getMineFilter = bindFilterBar($('#fbMine'), renderMyOrders); // par défaut : aujourd'hui
  $('#clientSelect').onchange = onClientChange;

  renderClients();
  renderCats();
  refresh();
}

function refresh() {
  renderOrderLines();
  renderProducts();
}

function showView(v) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'mine') renderMyOrders();
}

/* ---------- Clients ---------- */
function renderClients(selectId) {
  const sel = $('#clientSelect');
  const prev = selectId || sel.value;
  const list = [...Store.data.clients].sort((a, b) => a.nom.localeCompare(b.nom));
  sel.innerHTML = '<option value="">— Choisir un client —</option>' +
    list.map(c => `<option value="${c.id}">${esc(c.nom)}${c.ville ? ' (' + esc(c.ville) + ')' : ''}</option>`).join('');
  if (prev) sel.value = prev;
}

function newClientForm() {
  const m = openModal('Nouveau client', `
    <form id="clientForm" class="form-grid">
      <label class="full">Nom / Raison sociale *<input name="nom" required></label>
      <label>Téléphone<input name="tel" type="tel" inputmode="tel"></label>
      <label>Ville<input name="ville"></label>
      <label class="full">Adresse<input name="adresse"></label>
      <label class="full">ICE<input name="ice" inputmode="numeric"></label>
    </form>`, {
    footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="clientForm">Enregistrer</button>`
  });
  $('#clientForm', m).onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const c = { id: Store.nextId('client'), ...f, nom: f.nom.trim() };
    Store.data.clients.push(c);
    Store.save();
    closeModal();
    renderClients(String(c.id));
    lastClient = String(c.id);
    refresh();
    toast('Client ajouté');
  };
}

/* ---------- Client obligatoire avant la sélection des produits ---------- */
let lastClient = '';
function selectedClientId() { return +$('#clientSelect').value || 0; }

function onClientChange() {
  const sel = $('#clientSelect');
  if (cart.size && sel.value !== lastClient) {
    const newVal = sel.value;
    sel.value = lastClient; // on attend la confirmation
    confirmBox('Changer de client videra la commande en cours (les prix dépendent du client). Continuer ?', () => {
      cart.clear();
      sel.value = newVal;
      lastClient = newVal;
      refresh();
    }, 'Changer de client');
    return;
  }
  lastClient = sel.value;
  refresh();
}

/* Dernier prix de vente d'un produit pour un client (hors commandes annulées) */
function lastPrice(clientId, productId) {
  let best = null;
  Store.data.orders.forEach(o => {
    if (o.clientId !== clientId || o.statut === 'annulee') return;
    const l = o.lignes.find(x => x.productId === productId);
    if (l && (!best || o.date > best.date)) best = { prix: l.prix, date: o.date };
  });
  return best; // null si jamais vendu à ce client
}

function proposedPrice(p) {
  const cid = selectedClientId();
  const lp = cid ? lastPrice(cid, p.id) : null;
  return lp ? lp.prix : p.prix;
}

/* ---------- Popularité : nombre de commandes par produit ---------- */
function orderStats() {
  const stats = {};
  Store.data.orders.forEach(o => {
    if (o.statut === 'annulee') return;
    o.lignes.forEach(l => {
      const s = stats[l.productId] || (stats[l.productId] = { n: 0, q: 0 });
      s.n += 1; s.q += l.qte;
    });
  });
  return stats;
}

/* ---------- Catalogue ---------- */
function renderCats() {
  const cats = [...new Set(Store.data.products.filter(p => p.actif).map(p => p.categorie).filter(Boolean))];
  $('#catChips').innerHTML = ['', ...cats].map(c =>
    `<button class="chip ${c === currentCat ? 'active' : ''}" data-cat="${esc(c)}">${c ? esc(c) : 'Tous'}</button>`).join('');
  $$('.chip').forEach(ch => ch.onclick = () => { currentCat = ch.dataset.cat; renderCats(); renderProducts(); });
}

function renderProducts() {
  const q = $('#search').value.trim().toLowerCase();
  const stats = orderStats();
  const list = Store.data.products
    .filter(p => p.actif &&
      (!currentCat || p.categorie === currentCat) &&
      (!q || (p.nom + ' ' + p.ref + ' ' + p.categorie + ' ' + p.conditionnement).toLowerCase().includes(q)))
    .sort((a, b) =>
      (a.indisponible ? 1 : 0) - (b.indisponible ? 1 : 0) || // 0) produits indisponibles en fin de liste
      (stats[b.id]?.n || 0) - (stats[a.id]?.n || 0) ||   // 1) nombre de commandes décroissant
      (stats[b.id]?.q || 0) - (stats[a.id]?.q || 0) ||   // 2) puis quantité commandée
      a.nom.localeCompare(b.nom));                         // 3) puis ordre alphabétique

  const noClient = !selectedClientId();
  $('#view-new').classList.toggle('need-client', noClient);
  $('#clientHint').hidden = !noClient;

  if (!list.length) { $('#productGrid').innerHTML = '<p class="empty">Aucun produit trouvé.</p>'; return; }

  $('#productGrid').innerHTML = list.map((p, i) => {
    const item = cart.get(p.id);
    const n = stats[p.id]?.n || 0;
    return `
    <button class="p-card ${item ? 'in-cart' : ''} ${p.indisponible ? 'unavailable' : ''}" data-id="${p.id}">
      <div class="p-img">
        <img src="${productImg(p)}" alt="${esc(p.nom)}" loading="lazy">
        ${n && i < 3 && !q && !p.indisponible ? `<span class="p-rank">★ ${i + 1}</span>` : ''}
        ${p.indisponible ? '<span class="p-unavailable">Indisponible</span>' : ''}
        ${item ? `<span class="p-qty-badge">× ${item.qte}</span>` : ''}
      </div>
      <div class="p-info">
        <span class="p-name">${esc(p.nom)}</span>
        <span class="sac-tag">${esc(p.conditionnement || 'Sac')}</span>
        <span class="p-price">${money(proposedPrice(p))}</span>
      </div>
    </button>`;
  }).join('');

  $$('.p-card').forEach(card => card.onclick = () => {
    if (!selectedClientId()) {
      toast('Sélectionnez d\'abord le client', 'error');
      const sel = $('#clientSelect');
      sel.scrollIntoView({ block: 'center', behavior: 'smooth' });
      sel.classList.add('shake'); setTimeout(() => sel.classList.remove('shake'), 600);
      sel.focus();
      return;
    }
    const p = Store.product(+card.dataset.id);
    if (p.indisponible) { toast(`${p.nom} est actuellement indisponible`, 'error'); return; }
    qtyPad(p);
  });
}

/* ---------- Saisie de la quantité et du prix (clavier de l'appareil) ---------- */
function qtyPad(p) {
  const existing = cart.get(p.id);
  const cid = selectedClientId();
  const lp = lastPrice(cid, p.id);
  const defaultPrice = existing ? existing.prix : (lp ? lp.prix : p.prix);
  const priceInfo = lp
    ? `Dernier prix pour ce client : <b>${money(lp.prix)}</b> (${fdate(lp.date)})`
    : `Première vente à ce client — prix catalogue : <b>${money(p.prix)}</b>`;

  const m = openModal('Produit à commander', `
    <div class="pad-product">
      <img src="${productImg(p)}" alt="">
      <div>
        <div class="pad-name">${esc(p.nom)}</div>
        <span class="sac-tag sac-tag-lg">${esc(p.conditionnement || 'Sac')}</span>
        <div class="muted small">${esc(p.ref)} • Client : ${esc(Store.client(cid).nom)}</div>
      </div>
    </div>
    <form id="padForm" class="pad-form">
      <label>Quantité
        <input id="padQte" class="pad-input" type="number" inputmode="numeric" pattern="[0-9]*"
               min="1" step="1" required value="${existing ? existing.qte : ''}" placeholder="0">
      </label>
      <label>Prix unitaire (DH)
        <input id="padPrix" class="pad-input" type="number" inputmode="decimal"
               min="0" step="0.01" required value="${defaultPrice}">
      </label>
      <div class="price-info">${priceInfo}</div>
      <div class="pad-amount">Montant : <b id="padAmount">0,00 DH</b></div>
    </form>`, {
    footer: `${existing ? '<button class="btn btn-danger" id="padDel">Retirer</button>' : ''}
             <button class="btn btn-light" data-close>Annuler</button>
             <button class="btn btn-primary btn-lg" form="padForm" id="padOk">${existing ? 'Modifier' : 'Ajouter à la commande'}</button>`
  });
  m.querySelector('.modal').classList.add('modal-pad');

  const qInp = $('#padQte', m), pInp = $('#padPrix', m);
  const show = () => {
    const qte = parseInt(qInp.value, 10) || 0;
    const prix = parseFloat(pInp.value) || 0;
    $('#padAmount', m).textContent = money(qte * prix);
    $('#padOk', m).disabled = qte <= 0;
  };
  qInp.oninput = show;
  pInp.oninput = show;
  [qInp, pInp].forEach(i => i.onfocus = () => i.select());
  show();
  qInp.focus(); // ouvre directement le clavier numérique (focus immédiat, requis sur iOS)

  $('#padForm', m).onsubmit = e => {
    e.preventDefault();
    const qte = parseInt(qInp.value, 10) || 0;
    const prix = Math.round((parseFloat(pInp.value) || 0) * 100) / 100;
    if (qte <= 0) { qInp.focus(); return; }
    cart.set(p.id, { qte, prix });
    closeModal();
    refresh();
    flashLine(p.id);
  };
  const del = $('#padDel', m);
  if (del) del.onclick = () => { cart.delete(p.id); closeModal(); refresh(); };
}

/* ---------- Liste de la commande en cours (en haut) ---------- */
function cartLines() {
  return [...cart.entries()].map(([id, it]) => {
    const p = Store.product(id);
    return { productId: id, ref: p.ref, nom: p.nom, conditionnement: p.conditionnement, prix: it.prix, qte: it.qte };
  });
}

function renderOrderLines() {
  const lines = cartLines();
  const totalQte = lines.reduce((s, l) => s + l.qte, 0);
  const total = lines.reduce((s, l) => s + l.qte * l.prix, 0);

  $('#orderLines').innerHTML = lines.length ? lines.map((l, i) => `
    <div class="order-line" data-id="${l.productId}">
      <span class="ol-name"><span class="ol-num">${i + 1}</span>${esc(l.nom)}</span>
      <span><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></span>
      <span class="r ol-qty">${l.qte}</span>
      <span class="r ol-amount">${money(l.qte * l.prix)}<br><small class="muted">${money(l.prix)} / u</small></span>
      <span class="r"><button class="icon-btn text-danger" data-del aria-label="Retirer">✕</button></span>
    </div>`).join('')
    : '<div class="order-empty">Touchez un produit ci-dessous pour l\'ajouter à la commande.</div>';

  $('#lineCount').textContent = `${lines.length} produit${lines.length > 1 ? 's' : ''}`;
  $('#sacCount').textContent = `Qté totale : ${totalQte}`;
  $('#orderTotal').textContent = money(total);
  $('#saveBtn').disabled = !lines.length;
  $('#clearBtn').disabled = !lines.length;
  $('#newClientBtn').disabled = lines.length > 0; // pas de changement de client avec une commande en cours
  $('#orderPanel').classList.toggle('has-items', lines.length > 0);

  $$('.order-line').forEach(row => {
    const id = +row.dataset.id;
    row.onclick = e => {
      if (e.target.closest('[data-del]')) { cart.delete(id); refresh(); return; }
      qtyPad(Store.product(id));
    };
  });
}

function flashLine(id) {
  const row = $(`.order-line[data-id="${id}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 900);
}

/* ---------- Récapitulatif et enregistrement ---------- */
function openRecap() {
  const lines = cartLines();
  if (!lines.length) return;
  const clientId = $('#clientSelect').value;
  if (!clientId) {
    toast('Choisissez d\'abord le client', 'error');
    $('#clientSelect').focus();
    return;
  }
  const total = lines.reduce((s, l) => s + l.qte * l.prix, 0);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const m = openModal('Confirmer la commande', `
    <div class="recap-client">Client : <b>${esc(Store.client(+clientId).nom)}</b></div>
    <table class="table recap-table">
      <thead><tr><th>Produit</th><th>Sac</th><th class="r">Qté</th><th class="r">Montant</th></tr></thead>
      <tbody>${lines.map(l => `<tr><td><b>${esc(l.nom)}</b></td><td><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></td>
        <td class="r"><b>${l.qte}</b></td><td class="r">${money(l.qte * l.prix)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="3" class="r">Total</th><th class="r">${money(total)}</th></tr></tfoot>
    </table>
    <div class="form-grid" style="margin-top:14px">
      <label>Date de livraison souhaitée<input type="date" id="dLiv" value="${tomorrow}"></label>
      <label class="full">Observations<textarea id="notes" rows="2" placeholder="Remarques, conditions de paiement…"></textarea></label>
    </div>`, {
    footer: `<button class="btn btn-light" data-close>Retour</button>
             <button class="btn btn-primary btn-lg" id="saveOrder">✔ Enregistrer</button>`,
    wide: true
  });
  $('#saveOrder', m).onclick = () => saveOrder(+clientId, $('#dLiv', m).value, $('#notes', m).value.trim());
}

function saveOrder(clientId, dateLivraison, notes) {
  const id = Store.nextId('order');
  const client = Store.client(clientId);
  const order = {
    id,
    numero: Store.orderNumber(id),
    date: new Date().toISOString(),
    dateLivraison,
    clientId,
    clientNom: client.nom,
    commercialId: me.id,
    commercialNom: me.nom,
    lignes: cartLines(),
    notes,
    statut: 'attente',
    historique: [{ date: new Date().toISOString(), statut: 'attente', par: me.nom }]
  };
  Store.data.orders.push(order);
  if (!Store.save()) return;

  cart.clear();
  closeModal();
  $('#clientSelect').value = '';
  lastClient = '';
  refresh();
  openModal('Commande enregistrée', `
    <div class="success-box">
      <div class="big-check">✔</div>
      <p>La commande <b>${order.numero}</b> a été enregistrée.</p>
      <p class="muted">Montant : ${money(Store.orderTotal(order))}</p>
    </div>`, {
    footer: `<button class="btn btn-light" id="printIt">🖨 Imprimer</button><button class="btn btn-primary" data-close>Nouvelle commande</button>`
  });
  $('#printIt').onclick = () => printOrder(order);
}

/* ---------- Mes commandes ---------- */
function renderMyOrders() {
  const st = $('#mineFilter').value, f = getMineFilter();
  const list = Store.data.orders
    .filter(o => o.commercialId === me.id && (!st || o.statut === st) && matchFilter(f, o.date, o.clientId, o.numero + ' ' + o.clientNom))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!list.length) { $('#myOrders').innerHTML = '<p class="empty">Aucune commande.</p>'; return; }

  $('#myOrders').innerHTML = list.map(o => `
    <article class="o-card" data-id="${o.id}">
      <div class="o-top"><b>${o.numero}</b>${statutBadge(o.statut)}</div>
      <div>${esc(o.clientNom)}</div>
      <div class="o-bottom"><span class="muted small">${fdate(o.date, true)} • ${o.lignes.length} produit(s)</span><b>${money(Store.orderTotal(o))}</b></div>
    </article>`).join('');

  $$('.o-card').forEach(c => c.onclick = () => showOrder(Store.data.orders.find(o => o.id === +c.dataset.id)));
}

function showOrder(o) {
  const m = openModal(o.numero, `
    <p>${statutBadge(o.statut)} &nbsp; ${fdate(o.date, true)}</p>
    <p>Client : <b>${esc(o.clientNom)}</b>${o.dateLivraison ? '<br>Livraison souhaitée : ' + fdate(o.dateLivraison) : ''}</p>
    <table class="table"><thead><tr><th>Produit</th><th class="r">Qté</th><th class="r">Montant</th></tr></thead>
    <tbody>${o.lignes.map(l => `<tr><td>${esc(l.nom)}</td><td class="r">${l.qte}</td><td class="r">${money(l.qte * l.prix)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="2" class="r">Total</th><th class="r">${money(Store.orderTotal(o))}</th></tr></tfoot></table>
    ${o.notes ? `<p class="muted">📝 ${esc(o.notes)}</p>` : ''}`, {
    footer: `${o.statut === 'attente' ? '<button class="btn btn-danger" id="cancelO">Annuler la commande</button>' : ''}
             <button class="btn btn-light" id="printO">🖨 Imprimer</button>`
  });
  $('#printO', m).onclick = () => printOrder(o);
  const cancel = $('#cancelO', m);
  if (cancel) cancel.onclick = () => confirmBox(`Annuler la commande ${o.numero} ?`, () => {
    Store.setOrderStatus(o, 'annulee');
    renderMyOrders();
    toast('Commande annulée');
  }, 'Oui, annuler');
}
