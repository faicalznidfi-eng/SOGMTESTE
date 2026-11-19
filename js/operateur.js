/* SOGM - Espace opérateur de chargement
   - charge les produits demandés et confirme le chargement (sortie du stock)
   - confirme ensuite la livraison du chargement */
const me = requireRole('operateur');
let getHist = () => ({});

if (me) init();

function init() {
  $('#userName').textContent = '— ' + me.nom;
  $('#logoutBtn').onclick = logout;
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  $('#fbHist').innerHTML = filterBarHtml({ text: 'N° ou camion…' });
  getHist = bindFilterBar($('#fbHist'), renderAll); // par défaut : livraisons du jour
  window.addEventListener('storage', e => { if (e.key === DB_KEY) { Store.load(); renderAll(); } });
  renderAll();
}

function showView(v) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  renderAll();
}

function renderAll() {
  const all = Store.data.chargements;
  const todo = all.filter(c => c.statut === 'a_charger').sort((a, b) => (a.datePrevue || a.date).localeCompare(b.datePrevue || b.date));
  const deliver = all.filter(c => c.statut === 'charge').sort((a, b) => a.dateChargement.localeCompare(b.dateChargement));
  const f = getHist();
  const hist = all.filter(c => c.statut === 'livre' && matchFilter(f, c.dateLivraison, c.clientId, c.numero + ' ' + c.camion.immatriculation))
    .sort((a, b) => b.dateLivraison.localeCompare(a.dateLivraison));

  $('#cTodo').textContent = todo.length || '';
  $('#cDeliver').textContent = deliver.length || '';
  drawCards('#todoList', todo, 'Aucun camion à charger.');
  drawCards('#deliverList', deliver, 'Aucun chargement en attente de livraison.');
  drawCards('#historyList', hist, 'Aucun chargement livré.');
}

function drawCards(target, list, emptyMsg) {
  $(target).innerHTML = list.length ? list.map(c => {
    const tq = c.lignes.reduce((s, l) => s + (c.statut === 'a_charger' ? l.qte : l.qteChargee || 0), 0);
    return `
    <article class="chg-card" data-id="${c.id}">
      <div class="chg-top">${plate(c.camion.immatriculation)}${chgBadge(c.statut)}</div>
      <div class="o-client">${esc(c.clientNom)}</div>
      <ul class="chg-lines">${c.lignes.map(l => `<li><span>${esc(l.nom)} <span class="sac-tag sac-tag-sm">${esc(l.conditionnement || 'Sac')}</span></span>
        <b>${c.statut === 'a_charger' ? l.qte : l.qteChargee}</b></li>`).join('')}</ul>
      <div class="o-bottom"><span class="muted small">${c.numero}${c.datePrevue && c.statut === 'a_charger' ? ' • prévu ' + fdate(c.datePrevue) : ''}
        ${c.statut === 'charge' ? ' • chargé ' + fdate(c.dateChargement, true) : ''}${c.statut === 'livre' ? ' • livré ' + fdate(c.dateLivraison, true) : ''}</span>
        <b>Total : ${tq}</b></div>
      ${c.statut === 'a_charger' ? '<button class="btn btn-primary btn-block btn-lg">📦 Charger ce camion</button>' : ''}
      ${c.statut === 'charge' ? '<button class="btn btn-secondary btn-block btn-lg">✅ Confirmer la livraison</button>' : ''}
    </article>`;
  }).join('') : `<p class="empty">${emptyMsg}</p>`;

  $$('.chg-card', $(target)).forEach(el => el.onclick = () => {
    const c = Store.chargement(+el.dataset.id);
    if (c.statut === 'a_charger') loadingScreen(c);
    else if (c.statut === 'charge') deliveryScreen(c);
    else printChargement(c);
  });
}

/* ---------------- Chargement : cocher chaque produit chargé ---------------- */
function loadingScreen(c) {
  const m = openModal(`Chargement ${c.numero}`, `
    <div class="truck-banner">${plate(c.camion.immatriculation)}
      <div>${c.datePrevue ? 'Prévu le ' + fdate(c.datePrevue) : ''}</div>
      <div class="r"><b>${esc(c.clientNom)}</b><br><small class="muted">${c.orderNumero ? esc(c.orderNumero) : 'Chargement direct'}</small></div>
    </div>
    ${c.notes ? `<p class="note-box">📝 ${esc(c.notes)}</p>` : ''}
    <p class="muted small">Cochez chaque produit une fois chargé. Corrigez la quantité si elle diffère de la demande.</p>
    <div class="load-lines">
      ${c.lignes.map((l, i) => {
        const p = Store.product(l.productId);
        return `
        <div class="load-line" data-i="${i}">
          <button type="button" class="load-check" aria-label="Chargé">✓</button>
          <img src="${p ? productImg(p) : placeholderImg(l.nom)}" alt="">
          <div class="ll-info"><b>${esc(l.nom)}</b><br><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span>
            <div class="small muted">Demandé : <b>${l.qte}</b></div></div>
          <label class="ll-qty">Chargé<input type="number" inputmode="numeric" min="0" step="1" value="${l.qte}"></label>
        </div>`;
      }).join('')}
    </div>
    <div class="load-progress"><span id="lpText">0 / ${c.lignes.length} produit(s) chargé(s)</span><div class="bar"><div id="lpBar" style="width:0"></div></div></div>`, {
    wide: true,
    footer: `<button class="btn btn-light" id="lPrint">🖨 Bon</button><span class="spacer"></span>
             <button class="btn btn-light" data-close>Plus tard</button>
             <button class="btn btn-primary btn-lg" id="lConfirm" disabled>✔ Confirmer le chargement</button>`
  });

  const update = () => {
    const done = $$('.load-line.done', m).length;
    $('#lpText', m).textContent = `${done} / ${c.lignes.length} produit(s) chargé(s)`;
    $('#lpBar', m).style.width = (done / c.lignes.length * 100) + '%';
    $('#lConfirm', m).disabled = done !== c.lignes.length;
  };
  $$('.load-line', m).forEach(row => {
    $('.load-check', row).onclick = () => { row.classList.toggle('done'); if (navigator.vibrate) navigator.vibrate(15); update(); };
    const inp = $('input', row);
    inp.onfocus = () => inp.select();
    inp.oninput = () => row.classList.toggle('diff', (parseInt(inp.value, 10) || 0) !== c.lignes[+row.dataset.i].qte);
  });
  $('#lPrint', m).onclick = () => printChargement(c);
  $('#lConfirm', m).onclick = () => {
    const qtys = $$('.load-line input', m).map(i => Math.max(0, parseInt(i.value, 10) || 0));
    const diffs = c.lignes.filter((l, i) => qtys[i] !== l.qte).map(l => l.nom);
    const short = c.lignes.filter((l, i) => (Store.product(l.productId)?.stock ?? 0) < qtys[i]).map(l => l.nom);
    let msg = `Confirmer le chargement du camion <b>${esc(c.camion.immatriculation)}</b> ?`;
    if (diffs.length) msg += `<br><br>⚠ Quantités différentes de la demande : ${esc(diffs.join(', '))}.`;
    if (short.length) msg += `<br><br>⚠ Stock enregistré insuffisant pour : ${esc(short.join(', '))}.`;
    confirmBox(msg, () => {
      if (!Store.confirmLoading(c, qtys)) return;
      renderAll();
      toast(`Camion ${c.camion.immatriculation} chargé`);
    }, 'Confirmer');
  };
}

/* ---------------- Livraison ---------------- */
function deliveryScreen(c) {
  const m = openModal(`Livraison ${c.numero}`, `
    <div class="truck-banner">${plate(c.camion.immatriculation)}
      <div></div>
      <div class="r"><b>${esc(c.clientNom)}</b></div>
    </div>
    <table class="table">
      <thead><tr><th>Produit</th><th>Sac</th><th class="r">Qté chargée</th></tr></thead>
      <tbody>${c.lignes.map(l => `<tr><td><b>${esc(l.nom)}</b></td><td><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></td><td class="r"><b>${l.qteChargee}</b></td></tr>`).join('')}</tbody>
    </table>
    <p class="muted small">Chargé le ${fdate(c.dateChargement, true)} par ${esc(c.operateurNom)}.</p>`, {
    footer: `<button class="btn btn-light" id="dPrint">🖨 Bon</button><span class="spacer"></span>
             <button class="btn btn-light" data-close>Fermer</button>
             <button class="btn btn-primary btn-lg" id="dConfirm">✅ Confirmer la livraison</button>`
  });
  $('#dPrint', m).onclick = () => printChargement(c);
  $('#dConfirm', m).onclick = () => confirmBox(`Confirmer la livraison du chargement ${c.numero} à ${esc(c.clientNom)} ?`, () => {
    if (!Store.confirmDelivery(c)) return;
    renderAll();
    toast('Livraison confirmée');
  }, 'Confirmer');
}
