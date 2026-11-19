/* SOGM - Espace vendeur
   - valide les commandes (et peut en modifier les quantités)
   - les envoie au chargement après avoir renseigné le camion
   - peut enregistrer un chargement direct, sans commande */
const me = requireRole('vendeur');
const F = {}; // lecteurs des barres de recherche
const chequeSel = new Set(); // chèques sélectionnés pour un bordereau (ids des paiements)
// état du chargement direct
const dCart = new Map(); // productId -> { qte, prix }
let dCat = '';
let dLastClient = '';

if (me) init();

function init() {
  $('#userName').textContent = '— ' + me.nom;
  $('#logoutBtn').onclick = logout;
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  // barres de recherche : entre deux dates et/ou client — par défaut les opérations du jour
  const bars = [['pending', '#fbPending', 'N° de commande…', true], ['validated', '#fbValidated', 'N° de commande…', true],
                ['loadings', '#fbLoadings', 'N° ou camion…', true], ['credits', '#fbCredits', 'N° ou camion…', false],
                ['cheques', '#fbCheques', 'N° de chèque, porteur…', false], ['bord', '#fbBord', 'N° de bordereau…', true]];
  bars.forEach(([k, sel, ph, today]) => {
    $(sel).innerHTML = filterBarHtml({ text: ph });
    F[k] = bindFilterBar($(sel), renderAll, { defaultToday: today });
  });
  $('#chgFilter').onchange = renderLoadings;
  $('#onlyOpen').onchange = renderCheques;
  // nouvelles commandes saisies dans un autre onglet du même appareil
  window.addEventListener('storage', e => { if (e.key === DB_KEY) { Store.load(); renderAll(); } });
  initDirect();
  renderAll();
}

function showView(v) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  if (v === 'direct') { fillDirectClients(); $('#dTruckList').innerHTML = truckDatalist(); refreshDirect(); }
  renderAll();
}

function renderAll() {
  renderOrders('attente', '#pendingList', F.pending(), '#notePending', '#fbPending');
  renderOrders('validee', '#validatedList', F.validated(), '#noteValidated', '#fbValidated');
  renderLoadings();
  renderCredits();
  renderCheques();
  const n1 = Store.data.orders.filter(o => o.statut === 'attente').length;
  const n2 = Store.data.orders.filter(o => o.statut === 'validee').length;
  $('#cPending').textContent = n1 || '';
  $('#cValidated').textContent = n2 || '';
}

/* ---------------- Listes de commandes ---------------- */
function renderOrders(statut, target, f, noteSel, barSel) {
  const all = Store.data.orders.filter(o => o.statut === statut);
  const list = all.filter(o => matchFilter(f, o.date, o.clientId, o.numero + ' ' + o.clientNom + ' ' + o.commercialNom))
    .sort((a, b) => a.date.localeCompare(b.date)); // les plus anciennes d'abord
  // signale les commandes en attente hors de la période affichée, pour ne pas les oublier
  const hidden = all.length - list.length;
  $(noteSel).innerHTML = hidden > 0 ? `⚠ ${hidden} autre(s) commande(s) hors de la période ou du client choisis.
    <button class="btn btn-sm btn-light" data-showall>Afficher toutes les dates</button>` : '';
  const sa = $('[data-showall]', $(noteSel));
  if (sa) sa.onclick = () => $(`${barSel} [data-f="all"]`).click();
  $(target).innerHTML = list.length ? list.map(o => `
    <article class="o-card" data-id="${o.id}">
      <div class="o-top"><b>${o.numero}</b>${statutBadge(o.statut)}</div>
      <div class="o-client">${esc(o.clientNom)}</div>
      <div class="o-lines">${o.lignes.map(l => `<span>${esc(l.nom)} <span class="sac-tag sac-tag-sm">${esc(l.conditionnement || 'Sac')}</span> × <b>${l.qte}</b></span>`).join('')}</div>
      <div class="o-bottom"><span class="muted small">${fdate(o.date, true)} • ${esc(o.commercialNom)}${o.dateLivraison ? ' • livraison ' + fdate(o.dateLivraison) : ''}</span>
        <b>${money(Store.orderTotal(o))}</b></div>
    </article>`).join('') : '<p class="empty">Aucune commande.</p>';
  $$('.o-card', $(target)).forEach(c => c.onclick = () => orderEditor(Store.order(+c.dataset.id)));
}

/* ---------------- Éditeur de commande (validation / quantités) ---------------- */
function orderEditor(o) {
  const lines = o.lignes.map(l => ({ ...l }));
  const c = Store.client(o.clientId) || {};

  const draw = () => lines.map((l, i) => `
    <tr data-i="${i}">
      <td><b>${esc(l.nom)}</b><br><small class="muted">${esc(l.ref)}</small></td>
      <td><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></td>
      <td class="r"><input class="qte-edit" type="number" inputmode="numeric" min="1" step="1" value="${l.qte}"></td>
      <td class="r">${money(l.prix)}</td>
      <td class="r line-amount">${money(l.qte * l.prix)}</td>
      <td class="r"><button type="button" class="icon-btn text-danger" data-rm ${lines.length < 2 ? 'disabled' : ''} aria-label="Retirer">✕</button></td>
    </tr>`).join('');

  const isPending = o.statut === 'attente';
  const m = openModal(`Commande ${o.numero}`, `
    <div class="detail-head">
      <div><b>Client :</b> ${esc(o.clientNom)}<br><small class="muted">${esc(c.tel || '')} ${esc(c.ville || '')}</small></div>
      <div><b>Commercial :</b> ${esc(o.commercialNom)}<br><small class="muted">${fdate(o.date, true)}</small></div>
      <div><b>Livraison souhaitée :</b> ${o.dateLivraison ? fdate(o.dateLivraison) : '—'}<br>${statutBadge(o.statut)}</div>
    </div>
    ${o.notes ? `<p>📝 ${esc(o.notes)}</p>` : ''}
    <p class="muted small">Vous pouvez modifier les quantités avant de valider.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Produit</th><th>Sac</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Montant</th><th></th></tr></thead>
      <tbody id="edLines">${draw()}</tbody>
      <tfoot><tr><th colspan="4" class="r">Total</th><th class="r" id="edTotal">${money(Store.orderTotal({ lignes: lines }))}</th><th></th></tr></tfoot>
    </table></div>`, {
    wide: true,
    footer: `<button class="btn btn-light text-danger" id="edCancel">Annuler la commande</button>
             ${isPending ? '' : '<button class="btn btn-light" id="edBack">Remettre en attente</button>'}
             <span class="spacer"></span>
             <button class="btn btn-light" id="edSave">Enregistrer</button>
             ${isPending ? '<button class="btn btn-secondary" id="edValidate">✔ Valider</button>' : ''}
             <button class="btn btn-primary" id="edSend">🚚 ${isPending ? 'Valider et envoyer' : 'Envoyer'} au chargement</button>`
  });

  const bind = () => {
    $$('#edLines tr', m).forEach(tr => {
      const i = +tr.dataset.i;
      const inp = $('.qte-edit', tr);
      inp.oninput = () => {
        lines[i].qte = Math.max(0, parseInt(inp.value, 10) || 0);
        $('.line-amount', tr).textContent = money(lines[i].qte * lines[i].prix);
        $('#edTotal', m).textContent = money(Store.orderTotal({ lignes: lines }));
      };
      inp.onfocus = () => inp.select();
      $('[data-rm]', tr).onclick = () => { lines.splice(i, 1); $('#edLines', m).innerHTML = draw(); bind(); $('#edTotal', m).textContent = money(Store.orderTotal({ lignes: lines })); };
    });
  };
  bind();

  // Applique les modifications de quantités à la commande ; renvoie false si invalide
  const apply = () => {
    if (lines.some(l => l.qte <= 0)) { toast('Chaque quantité doit être supérieure à 0', 'error'); return false; }
    const before = o.lignes.map(l => `${l.productId}:${l.qte}`).join('|');
    const after = lines.map(l => `${l.productId}:${l.qte}`).join('|');
    if (before !== after) {
      const changes = lines.map(l => {
        const old = o.lignes.find(x => x.productId === l.productId);
        return old && old.qte !== l.qte ? `${l.nom} ${old.qte}→${l.qte}` : null;
      }).filter(Boolean);
      const removed = o.lignes.filter(x => !lines.some(l => l.productId === x.productId)).map(x => `${x.nom} retiré`);
      o.lignes = lines.map(l => ({ ...l }));
      Store.setOrderStatus(o, o.statut, 'Quantités modifiées : ' + [...changes, ...removed].join(', '), false);
    }
    return true;
  };

  $('#edSave', m).onclick = () => { if (!apply()) return; Store.save(); closeModal(); renderAll(); toast('Commande enregistrée'); };
  const v = $('#edValidate', m);
  if (v) v.onclick = () => { if (!apply()) return; Store.setOrderStatus(o, 'validee'); closeModal(); renderAll(); toast(`${o.numero} validée`); };
  $('#edSend', m).onclick = () => {
    if (!apply()) return;
    if (o.statut === 'attente') Store.setOrderStatus(o, 'validee', '', false);
    Store.save();
    sendToLoading(o);
  };
  const back = $('#edBack', m);
  if (back) back.onclick = () => { if (!apply()) return; Store.setOrderStatus(o, 'attente'); closeModal(); renderAll(); };
  $('#edCancel', m).onclick = () => confirmBox(`Annuler la commande ${o.numero} ?`, () => {
    Store.setOrderStatus(o, 'annulee'); renderAll(); toast('Commande annulée');
  }, 'Oui, annuler');
}

/* ---------------- Envoi au chargement : saisie du camion ---------------- */
function sendToLoading(o) {
  const m = openModal(`Envoyer ${o.numero} au chargement`, `
    <div class="recap-client">Client : <b>${esc(o.clientNom)}</b> — ${o.lignes.length} produit(s),
      ${o.lignes.reduce((s, l) => s + l.qte, 0)} unités</div>
    <form id="truckForm" class="form-grid">${truckFields({ datePrevue: o.dateLivraison })}
      <label class="full">Observations pour le chargement<textarea name="notes" rows="2"></textarea></label>
    </form>`, {
    footer: `<button class="btn btn-light" data-close>Plus tard</button>
             <button class="btn btn-primary btn-lg" form="truckForm">🚚 Envoyer au chargement</button>`
  });
  $('#truckForm', m).onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const chg = Store.createChargement({
      order: o, clientId: o.clientId, lignes: o.lignes,
      camion: readTruck(fd), datePrevue: fd.get('datePrevue'), notes: (fd.get('notes') || '').trim()
    });
    if (!chg) return;
    renderAll();
    toast(`${o.numero} envoyée au chargement (${chg.numero})`);
    paymentForm(chg, { afterCreate: true });
  };
  // si la fenêtre est fermée sans envoi, rafraîchir quand même (la commande peut avoir été validée)
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) renderAll(); });
}

/* ---------------- Chargements ---------------- */
function renderLoadings() {
  const st = $('#chgFilter').value, f = F.loadings();
  const list = Store.data.chargements.filter(c => (!st || c.statut === st) &&
    matchFilter(f, c.date, c.clientId, c.numero + ' ' + c.camion.immatriculation + ' ' + c.orderNumero))
    .sort((a, b) => b.date.localeCompare(a.date));
  const active = list.filter(c => c.statut !== 'annule');
  const tMontant = round2(active.reduce((s, c) => s + Store.chgMontant(c), 0));
  const tPaye = round2(active.reduce((s, c) => s + Store.chgPaye(c), 0));
  const tReste = round2(active.reduce((s, c) => s + Math.max(0, Store.chgReste(c)), 0));

  $('#loadingTotal').innerHTML = `${list.length} chargement(s) — montant <b>${money(tMontant)}</b> • payé <b>${money(tPaye)}</b> • reste à payer <b>${money(tReste)}</b>`;
  $('#loadingList').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Chargement</th><th>Client</th><th>Camion</th><th>Statut</th>
      <th class="r">Montant</th><th class="r">Payé</th><th class="r">Reste à payer</th><th></th></tr></thead>
    <tbody>${list.map(c => {
      const cancelled = c.statut === 'annule', reste = Store.chgReste(c);
      return `<tr class="clickable ${cancelled ? 'row-muted' : ''}" data-id="${c.id}">
      <td><b>${c.numero}</b><br><small class="muted">${fdate(c.date, true)} • ${c.orderNumero ? esc(c.orderNumero) : 'Direct'}</small></td>
      <td>${esc(c.clientNom)}</td>
      <td>${plate(c.camion.immatriculation)}<br><small class="muted">${c.datePrevue ? 'prévu ' + fdate(c.datePrevue) : ''}</small></td>
      <td>${chgBadge(c.statut)}${cancelled ? '' : '<br>' + payBadge(c)}</td>
      <td class="r">${money(Store.chgMontant(c))}</td>
      <td class="r">${cancelled ? '—' : money(Store.chgPaye(c))}</td>
      <td class="r">${cancelled ? '—' : `<b class="${reste > 0.001 ? 'text-danger' : 'text-ok'}">${money(Math.max(0, reste))}</b>`}</td>
      <td class="actions">${!cancelled && reste > 0.001 ? `<button class="btn btn-sm btn-accent" data-pay="${c.id}">💰 Payer</button>` : ''}</td></tr>`;
    }).join('')}</tbody>
    <tfoot><tr><th colspan="4" class="r">Total (hors annulés)</th><th class="r">${money(tMontant)}</th><th class="r">${money(tPaye)}</th><th class="r">${money(tReste)}</th><th></th></tr></tfoot>
  </table></div>` : '<p class="empty">Aucun chargement pour ces critères.</p>';
  $$('#loadingList tr[data-id]').forEach(tr => tr.onclick = e => {
    const c = Store.chargement(+tr.dataset.id);
    if (e.target.closest('[data-pay]')) paymentForm(c); else chargementDetail(c);
  });
}

function chargementDetail(c) {
  const charged = c.statut === 'charge' || c.statut === 'livre';
  const m = openModal(`Chargement ${c.numero}`, `
    <div class="detail-head">
      <div><b>Client :</b> ${esc(c.clientNom)}<br><small class="muted">${c.orderNumero ? 'Commande ' + esc(c.orderNumero) : 'Chargement direct'}</small></div>
      <div><b>Camion :</b> ${plate(c.camion.immatriculation)}</div>
      <div>${chgBadge(c.statut)}<br><small class="muted">Prévu : ${c.datePrevue ? fdate(c.datePrevue) : '—'}</small></div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Produit</th><th>Sac</th><th class="r">Qté demandée</th><th class="r">Qté chargée</th></tr></thead>
      <tbody>${c.lignes.map(l => `<tr><td><b>${esc(l.nom)}</b></td><td><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></td>
        <td class="r">${l.qte}</td><td class="r ${charged && l.qteChargee !== l.qte ? 'text-danger' : ''}">${charged ? l.qteChargee : '—'}</td></tr>`).join('')}</tbody>
    </table></div>
    ${c.notes ? `<p>📝 ${esc(c.notes)}</p>` : ''}
    ${c.statut !== 'annule' ? `<h3 class="sec-title">Paiements ${payBadge(c)}</h3>${paySummary(c)}${paymentsTable(c, { deletable: true })}` : ''}
    ${historyHtml(c.historique, CHG_STATUTS)}`, {
    wide: true,
    footer: `${c.statut === 'a_charger' ? '<button class="btn btn-light text-danger" id="cCancel">Annuler le chargement</button><button class="btn btn-light" id="cTruck">Modifier le camion</button>' : ''}
             <span class="spacer"></span><button class="btn btn-light" id="cPrint">🖨 Bon de chargement</button>
             ${c.statut !== 'annule' && Store.chgReste(c) > 0.001 ? '<button class="btn btn-accent" id="cPay">💰 Enregistrer un paiement</button>' : ''}`
  });
  $('#cPrint', m).onclick = () => printChargement(c);
  const cp = $('#cPay', m);
  if (cp) cp.onclick = () => paymentForm(c);
  $$('[data-delpay]', m).forEach(b => b.onclick = () => {
    const pay = c.paiements.find(x => x.id === +b.dataset.delpay);
    confirmBox(`Supprimer le paiement ${PAY_MODES[pay.mode].toLowerCase()} de ${money(pay.montant)} du ${fdate(pay.date)} ?`, () => {
      const err = Store.removePayment(c, pay.id);
      if (err) { toast(err, 'error'); chargementDetail(c); return; }
      renderAll(); chargementDetail(c); toast('Paiement supprimé');
    }, 'Supprimer');
  });
  const cc = $('#cCancel', m);
  if (cc) cc.onclick = () => (c.paiements || []).length
    ? toast('Ce chargement a des paiements : supprimez-les avant de l\'annuler', 'error')
    : confirmBox(`Annuler le chargement ${c.numero} ?${c.orderNumero ? ' La commande redeviendra « Validée ».' : ''}`, () => {
    Store.cancelChargement(c); renderAll(); toast('Chargement annulé');
  }, 'Oui, annuler');
  const ct = $('#cTruck', m);
  if (ct) ct.onclick = () => {
    const m2 = openModal('Modifier le camion', `<form id="tf" class="form-grid">${truckFields({ ...c.camion, datePrevue: c.datePrevue })}</form>`, {
      footer: `<button class="btn btn-light" data-close>Annuler</button><button class="btn btn-primary" form="tf">Enregistrer</button>`
    });
    $('#tf', m2).onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      c.camion = readTruck(fd); c.datePrevue = fd.get('datePrevue');
      Store.save(); closeModal(); renderAll(); toast('Camion modifié');
    };
  };
}

function historyHtml(h, map) {
  return `<details><summary>Historique</summary><ul class="history">${(h || []).map(x =>
    `<li>${fdate(x.date, true)} — ${map[x.statut]?.label || x.statut}${x.note ? ' : ' + esc(x.note) : ''} <span class="muted">(${esc(x.par)})</span></li>`).join('')}</ul></details>`;
}

/* ---------------- Paiement d'un chargement ----------------
   Total ou partiel ; espèces (plafond par client et par jour), chèque, virement, effet,
   ou prélèvement sur l'avance du client. Un chèque / virement / effet supérieur au reste
   à payer solde le chargement et l'excédent devient une avance pour le client. */
function paymentForm(c, { afterCreate = false } = {}) {
  const reste = Math.max(0, Store.chgReste(c));
  const cashDispo = Math.max(0, round2(CASH_LIMIT - Store.cashUsed(c.clientId, todayISO())));
  const avDispo = Store.clientAvance(c.clientId);
  let mode = avDispo > 0 ? 'avance' : 'especes';
  const modes = ['especes', 'cheque', 'virement', 'effet'].concat(avDispo > 0 ? ['avance'] : []);
  const icons = { especes: '💵', cheque: '🧾', virement: '🏦', effet: '📄', avance: '⭐' };

  const m = openModal(`Paiement — ${c.numero}`, `
    <div class="recap-client">Client : <b>${esc(c.clientNom)}</b> • Camion ${plate(c.camion.immatriculation)}
      ${avDispo > 0 ? `<br>⭐ Avance disponible pour ce client : <b>${money(avDispo)}</b>
        <small>(${Store.data.avances.filter(a => a.clientId === c.clientId && a.solde > 0.001).map(a => `${esc(a.numero)} : ${money(a.solde)}`).join(', ')})</small>` : ''}</div>
    ${paySummary(c)}
    ${(c.paiements || []).length ? paymentsTable(c) : ''}
    <form id="payForm" class="pay-form">
      <div class="mode-switch" style="grid-template-columns: repeat(${modes.length}, 1fr)">
        ${modes.map(k => `<button type="button" class="mode-btn ${k === mode ? 'active' : ''}" data-mode="${k}">${icons[k]} ${PAY_MODES[k]}</button>`).join('')}
      </div>
      <label>Montant reçu (DH)
        <input id="payAmount" class="pad-input" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="0,00">
      </label>
      <div class="mode-fields" data-for="especes">Espèces déjà encaissées aujourd'hui pour ce client :
        <b>${money(round2(CASH_LIMIT - cashDispo))}</b> / ${money(CASH_LIMIT)} — encore autorisé : <b>${money(cashDispo)}</b></div>
      <div class="mode-fields form-grid" data-for="cheque">
        <label>Nom du porteur du chèque *<input name="porteur"></label>
        <label>Numéro du chèque *<input name="numero_cheque" inputmode="numeric"></label>
      </div>
      <div class="mode-fields form-grid" data-for="virement">
        <label>Référence du virement *<input name="reference"></label>
        <label>Banque<input name="banque"></label>
      </div>
      <div class="mode-fields form-grid" data-for="effet">
        <label>Tireur *<input name="tireur"></label>
        <label>Numéro de l'effet *<input name="numero_effet"></label>
        <label>Date d'échéance *<input name="echeance" type="date"></label>
      </div>
      <div class="mode-fields" data-for="avance">Avance disponible : <b>${money(avDispo)}</b> — elle sera prélevée sur ce chargement.</div>
      <div class="pay-after">Reste à payer après ce paiement : <b id="payAfter">${money(reste)}</b>
        <div id="payExcess" class="pay-excess"></div></div>
      <p class="error" id="payError"></p>
    </form>`, {
    wide: true,
    footer: `<button class="btn btn-light" id="payLater">${afterCreate ? '⏳ Plus tard (crédit)' : 'Annuler'}</button>
             <button class="btn btn-accent btn-lg" form="payForm">💰 Enregistrer le paiement</button>`
  });

  const amount = $('#payAmount', m);
  const required = { cheque: ['porteur', 'numero_cheque'], virement: ['reference'], effet: ['tireur', 'numero_effet', 'echeance'] };
  const upd = () => {
    const v = round2(amount.value);
    const applied = Math.min(v, reste);
    const excess = OVERPAY_MODES.includes(mode) ? round2(v - applied) : 0;
    $('#payAfter', m).textContent = money(Math.max(0, round2(reste - applied)));
    $('#payAfter', m).className = reste - applied > 0.001 ? 'text-danger' : 'text-ok';
    $('#payExcess', m).innerHTML = excess > 0.001 ? `⭐ Excédent de <b>${money(excess)}</b> enregistré comme avance pour ce client` : '';
    let err = '';
    if (mode === 'especes' && v > reste + 0.001) err = `En espèces, le montant ne peut pas dépasser le reste à payer (${money(reste)}).`;
    else if (mode === 'especes' && v > cashDispo + 0.001) err = `Plafond espèces : encore ${money(cashDispo)} autorisés aujourd'hui pour ce client.`;
    else if (mode === 'avance' && v > Math.min(avDispo, reste) + 0.001) err = `Maximum possible avec l'avance : ${money(Math.min(avDispo, reste))}.`;
    $('#payError', m).textContent = err;
  };
  const setMode = k => {
    mode = k;
    $$('.mode-btn', m).forEach(x => x.classList.toggle('active', x.dataset.mode === k));
    $$('.mode-fields', m).forEach(d => d.hidden = d.dataset.for !== k);
    $$('.mode-fields input', m).forEach(i => i.required = (required[k] || []).includes(i.name));
    if (k === 'avance' && !amount.value) amount.value = Math.min(avDispo, reste);
    upd();
    (required[k] ? $(`[name=${required[k][0]}]`, m) : amount).focus();
  };
  $$('.mode-btn', m).forEach(b => b.onclick = () => setMode(b.dataset.mode));
  amount.oninput = upd;
  amount.onfocus = () => amount.select();
  setMode(mode);

  const finish = () => { renderAll(); chargementDetail(c); };
  $('#payLater', m).onclick = () => { if (afterCreate) { toast('Chargement enregistré à crédit'); finish(); } else chargementDetail(c); };
  $('#payForm', m).onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = Store.addPayment(c, {
      mode, montant: amount.value,
      porteur: fd.get('porteur'), numero: mode === 'effet' ? fd.get('numero_effet') : fd.get('numero_cheque'),
      reference: fd.get('reference'), banque: fd.get('banque'), tireur: fd.get('tireur'), echeance: fd.get('echeance')
    });
    if (res.error) { $('#payError', m).textContent = res.error; return; }
    const newAv = res.excess > 0 ? Store.data.avances.at(-1) : null;
    toast(`Paiement de ${money(res.applied)} enregistré — reste ${money(Math.max(0, Store.chgReste(c)))}` +
      (newAv ? ` — avance ${newAv.numero} de ${money(res.excess)} créée` : ''));
    finish();
  };
}

/* ---------------- Crédits : tous les chargements avec un reste à payer ---------------- */
function renderCredits() {
  const f = F.credits();
  const allDue = Store.data.chargements.filter(c => c.statut !== 'annule' && Store.chgReste(c) > 0.001);
  const list = allDue.filter(c => matchFilter(f, c.date, c.clientId, c.numero + ' ' + c.camion.immatriculation + ' ' + c.clientNom))
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = round2(list.reduce((s, c) => s + Store.chgReste(c), 0));
  $('#cCredits').textContent = allDue.length || '';
  $('#creditTotal').innerHTML = `${list.length} chargement(s) — total reste à payer : <b>${money(total)}</b>`;

  $('#creditList').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Chargement</th><th>Client</th><th>Camion</th><th>Statut</th>
      <th class="r">Montant</th><th class="r">Payé</th><th class="r">Reste à payer</th><th></th></tr></thead>
    <tbody>${list.map(c => {
      const av = Store.clientAvance(c.clientId);
      return `<tr class="clickable" data-id="${c.id}">
      <td><b>${c.numero}</b><br><small class="muted">${fdate(c.date)} • ${c.orderNumero ? esc(c.orderNumero) : 'Direct'}</small></td>
      <td>${esc(c.clientNom)}${av > 0 ? `<br><small class="text-accent">⭐ avance ${money(av)}</small>` : ''}</td>
      <td>${plate(c.camion.immatriculation)}</td><td>${chgBadge(c.statut)}<br>${payBadge(c)}</td>
      <td class="r">${money(Store.chgMontant(c))}</td><td class="r">${money(Store.chgPaye(c))}</td>
      <td class="r"><b class="text-danger">${money(Store.chgReste(c))}</b></td>
      <td class="actions"><button class="btn btn-sm btn-accent" data-pay="${c.id}">💰 Payer</button></td></tr>`; }).join('')}</tbody>
    <tfoot><tr><th colspan="6" class="r">Total</th><th class="r">${money(total)}</th><th></th></tr></tfoot>
  </table></div>` : '<p class="empty">Aucun chargement avec un reste à payer pour ces critères.</p>';
  $$('#creditList tr[data-id]').forEach(tr => tr.onclick = e => {
    const c = Store.chargement(+tr.dataset.id);
    if (e.target.closest('[data-pay]')) paymentForm(c); else chargementDetail(c);
  });

  // avances disponibles (solde > 0)
  const avs = Store.data.avances.filter(a => a.solde > 0.001 && (!f.clientId || a.clientId === f.clientId))
    .sort((a, b) => a.date.localeCompare(b.date));
  $('#avanceList').innerHTML = avs.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>N° avance</th><th>Date</th><th>Client</th><th>Origine</th><th class="r">Montant initial</th><th class="r">Utilisé</th><th class="r">Disponible</th></tr></thead>
    <tbody>${avs.map(a => `<tr><td><b>${esc(a.numero)}</b></td><td>${fdate(a.date)}</td><td><b>${esc(a.clientNom)}</b></td><td>${esc(a.origine)}</td>
      <td class="r">${money(a.montant)}</td><td class="r">${money(round2(a.montant - a.solde))}</td>
      <td class="r"><b class="text-accent">${money(a.solde)}</b></td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="empty">Aucune avance disponible.</p>';
}

/* ---------------- Chèques et bordereaux de remise ----------------
   Les chèques encaissés apparaissent ici jusqu'à leur remise ; une fois placés
   dans un bordereau, ils quittent automatiquement la liste. */

function renderCheques() {
  const all = Store.pendingCheques();
  $('#cCheques').textContent = all.length || '';
  // comptes bancaires
  const bankSel = $('#remitBank'), prevBank = bankSel.value;
  bankSel.innerHTML = Store.data.banques.map(b => `<option value="${b.id}">${esc(b.nom)}${b.compte ? ' — ' + esc(b.compte) : ''}</option>`).join('');
  if (prevBank) bankSel.value = prevBank;

  const f = F.cheques();
  const onlyOpen = $('#onlyOpen').checked;
  const list = all.filter(({ c, p }) => matchFilter(f, p.date, c.clientId, `${p.numero} ${p.porteur} ${c.numero} ${c.clientNom}`) &&
    (!onlyOpen || !Store.chequeLiquidation(p).liquide));
  const nOpen = all.filter(({ p }) => !Store.chequeLiquidation(p).liquide).length;
  $('#openCount').textContent = nOpen ? `(${nOpen})` : '';
  // retire de la sélection ce qui n'est plus affiché ou plus en attente
  const visible = new Set(list.map(x => x.p.id));
  [...chequeSel].forEach(id => { if (!visible.has(id)) chequeSel.delete(id); });

  $('#chequeList').innerHTML = list.length ? `<div class="table-wrap"><table class="table cheque-table">
    <thead><tr><th class="ck"><input type="checkbox" id="ckAll" aria-label="Tout sélectionner"></th>
      <th>Date</th><th>N° chèque</th><th>Porteur</th><th>Client</th><th>Chargement</th><th class="r">Montant du chèque</th><th>Liquidation</th></tr></thead>
    <tbody>${list.map(({ c, p }) => `<tr class="clickable ${chequeSel.has(p.id) ? 'selected' : ''}" data-pid="${p.id}">
      <td class="ck"><input type="checkbox" ${chequeSel.has(p.id) ? 'checked' : ''} aria-label="Sélectionner"></td>
      <td>${fdate(p.date, true)}</td><td><b>${esc(p.numero)}</b></td><td>${esc(p.porteur)}</td><td>${esc(c.clientNom)}</td>
      <td>${c.numero}</td><td class="r"><b>${money(p.recu || p.montant)}</b></td><td>${liquidationBadge(p)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="6" class="r">${list.length} chèque(s) en attente</th><th class="r">${money(round2(list.reduce((s, x) => s + (x.p.recu || x.p.montant), 0)))}</th><th></th></tr></tfoot>
  </table></div>` : '<p class="empty">Aucun chèque en attente de remise.</p>';

  const byId = new Map(list.map(x => [x.p.id, x]));
  const updBar = () => {
    const items = [...chequeSel].map(id => byId.get(id)).filter(Boolean);
    const tot = round2(items.reduce((s, x) => s + (x.p.recu || x.p.montant), 0));
    $('#remitInfo').innerHTML = items.length ? `<b>${items.length}</b> chèque(s) sélectionné(s) — total <b>${money(tot)}</b>` : 'Aucun chèque sélectionné';
    $('#remitBtn').disabled = !items.length;
    $('#remitBar').classList.toggle('active', items.length > 0);
    const ckAll = $('#ckAll');
    if (ckAll) { ckAll.checked = items.length && items.length === list.length; ckAll.indeterminate = items.length > 0 && items.length < list.length; }
  };
  $$('#chequeList tr[data-pid]').forEach(tr => tr.onclick = () => {
    const id = +tr.dataset.pid;
    chequeSel.has(id) ? chequeSel.delete(id) : chequeSel.add(id);
    tr.classList.toggle('selected', chequeSel.has(id));
    $('input', tr).checked = chequeSel.has(id);
    updBar();
  });
  const ckAll = $('#ckAll');
  if (ckAll) ckAll.onclick = e => {
    e.stopPropagation();
    if (ckAll.checked) list.forEach(x => chequeSel.add(x.p.id)); else chequeSel.clear();
    renderCheques();
  };
  $('#remitBtn').onclick = () => {
    const items = [...chequeSel].map(id => byId.get(id)).filter(Boolean);
    if (!items.length) return;
    const bq = Store.banque($('#remitBank').value);
    const tot = round2(items.reduce((s, x) => s + (x.p.recu || x.p.montant), 0));
    confirmBox(`Créer le bordereau de remise de <b>${items.length}</b> chèque(s) pour un total de <b>${money(tot)}</b>
      sur le compte <b>${esc(bq.nom)}</b> ?<br><br>Ces chèques ne figureront plus dans la liste des chèques à remettre.`, () => {
      const b = Store.createBordereau(bq.id, items);
      if (!b) return;
      chequeSel.clear();
      renderAll();
      toast(`Bordereau ${b.numero} créé`);
      bordereauDetail(b);
    }, 'Créer le bordereau');
  };
  updBar();
  renderBordereaux();
}

function renderBordereaux() {
  const f = F.bord();
  const list = Store.data.bordereaux.filter(b => matchFilter(f, b.date, 0, b.numero + ' ' + b.cheques.map(x => x.numero).join(' ')) &&
    (!f.clientId || b.cheques.some(x => x.clientId === f.clientId)))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('#bordList').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Bordereau</th><th>Date</th><th>Banque</th><th class="r">Chèques</th><th class="r">Total</th><th>Établi par</th><th></th></tr></thead>
    <tbody>${list.map(b => `<tr class="clickable" data-bid="${b.id}">
      <td><b>${b.numero}</b></td><td>${fdate(b.date, true)}</td><td>${esc((Store.banque(b.banqueId) || {}).nom || b.banqueId)}</td>
      <td class="r">${b.cheques.length}</td><td class="r"><b>${money(b.total)}</b></td><td>${esc(b.par)}</td>
      <td class="actions"><button class="btn btn-sm btn-light" data-print="${b.id}">🖨 Imprimer</button></td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="empty">Aucun bordereau pour ces critères.</p>';
  $$('#bordList tr[data-bid]').forEach(tr => tr.onclick = e => {
    const b = Store.data.bordereaux.find(x => x.id === +tr.dataset.bid);
    if (e.target.closest('[data-print]')) printBordereau(b); else bordereauDetail(b);
  });
}

function bordereauDetail(b) {
  const bq = Store.banque(b.banqueId) || { nom: b.banqueId, compte: '' };
  const m = openModal(`Bordereau ${b.numero}`, `
    <div class="detail-head">
      <div><b>Banque :</b> ${esc(bq.nom)}${bq.compte ? `<br><small class="muted">Compte ${esc(bq.compte)}</small>` : ''}</div>
      <div><b>Date :</b> ${fdate(b.date, true)}<br><small class="muted">Établi par ${esc(b.par)}</small></div>
      <div><b>${b.cheques.length}</b> chèque(s)<br><b>${money(b.total)}</b></div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>N° chèque</th><th>Porteur</th><th>Client</th><th>Chargement</th><th class="r">Montant</th><th>Liquidation</th></tr></thead>
      <tbody>${b.cheques.map(x => { const it = Store.bordItem(x);
        return `<tr><td><b>${esc(x.numero)}</b></td><td>${esc(x.porteur)}</td><td>${esc(x.clientNom)}</td>
        <td>${esc(x.chargementNumero)}</td><td class="r">${money(x.montant)}</td><td>${it ? liquidationBadge(it.p) : ''}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><th colspan="4" class="r">Total</th><th class="r">${money(b.total)}</th><th></th></tr></tfoot>
    </table></div>
    ${(b.historique || []).length ? `<details><summary>Historique</summary><ul class="history">${b.historique.map(h =>
      `<li>${fdate(h.date, true)} — ${esc(h.note)} <span class="muted">(${esc(h.par)})</span></li>`).join('')}</ul></details>` : ''}`, {
    wide: true,
    footer: `<button class="btn btn-light text-danger" id="bDel">Supprimer le bordereau</button>
             <button class="btn btn-light" id="bEdit">✏ Modifier</button>
             <span class="spacer"></span><button class="btn btn-primary" id="bPrint">🖨 Imprimer le bordereau</button>`
  });
  $('#bPrint', m).onclick = () => printBordereau(b);
  $('#bEdit', m).onclick = () => bordereauEditor(b);
  $('#bDel', m).onclick = () => confirmBox(`Supprimer le bordereau <b>${b.numero}</b> ?<br><br>Ses ${b.cheques.length} chèque(s) reviendront dans la liste des chèques à remettre.`, () => {
    Store.deleteBordereau(b); renderAll(); toast(`Bordereau ${b.numero} supprimé`);
  }, 'Supprimer');
}

/* Modification d'un bordereau : banque, retrait de chèques, ajout de chèques en attente */
function bordereauEditor(b) {
  const current = b.cheques.map(x => Store.bordItem(x)).filter(Boolean);
  const pending = Store.pendingCheques();
  const sel = new Set(current.map(x => x.p.id));
  const rows = [...current, ...pending];
  const byId = new Map(rows.map(x => [x.p.id, x]));
  const line = ({ c, p }, inBord) => `<tr class="clickable ${sel.has(p.id) ? 'selected' : ''}" data-pid="${p.id}">
    <td class="ck"><input type="checkbox" ${sel.has(p.id) ? 'checked' : ''}></td>
    <td><b>${esc(p.numero)}</b><br>${inBord ? '<span class="badge st-validee">Dans le bordereau</span>' : '<span class="badge st-attente">À remettre</span>'}</td>
    <td>${esc(p.porteur)}</td><td>${esc(c.clientNom)}<br><small class="muted">${c.numero}</small></td>
    <td class="r"><b>${money(p.recu || p.montant)}</b></td><td>${liquidationBadge(p)}</td></tr>`;

  const m = openModal(`Modifier le bordereau ${b.numero}`, `
    <div class="form-grid" style="margin-bottom:12px">
      <label>Compte bancaire<select id="beBank">${Store.data.banques.map(x => `<option value="${x.id}" ${x.id === b.banqueId ? 'selected' : ''}>${esc(x.nom)}${x.compte ? ' — ' + esc(x.compte) : ''}</option>`).join('')}</select></label>
    </div>
    <p class="muted small">Décochez un chèque pour le retirer du bordereau (il reviendra dans la liste à remettre) ; cochez un chèque « À remettre » pour l'ajouter.</p>
    <div class="table-wrap"><table class="table cheque-table">
      <thead><tr><th class="ck"></th><th>N° chèque</th><th>Porteur</th><th>Client / chargement</th><th class="r">Montant</th><th>Liquidation</th></tr></thead>
      <tbody>${current.map(x => line(x, true)).join('')}${pending.map(x => line(x, false)).join('')}</tbody>
    </table></div>
    <div class="remit-bar active" style="margin-top:12px"><span id="beInfo"></span></div>`, {
    wide: true,
    footer: `<button class="btn btn-light" id="beCancel">Annuler</button>
             <button class="btn btn-accent btn-lg" id="beSave">Enregistrer les modifications</button>`
  });
  const upd = () => {
    const items = [...sel].map(id => byId.get(id)).filter(Boolean);
    $('#beInfo', m).innerHTML = `<b>${items.length}</b> chèque(s) — total <b>${money(round2(items.reduce((s, x) => s + (x.p.recu || x.p.montant), 0)))}</b>`;
  };
  $$('tr[data-pid]', m).forEach(tr => tr.onclick = () => {
    const id = +tr.dataset.pid;
    sel.has(id) ? sel.delete(id) : sel.add(id);
    tr.classList.toggle('selected', sel.has(id));
    $('input', tr).checked = sel.has(id);
    upd();
  });
  upd();
  $('#beCancel', m).onclick = () => bordereauDetail(b);
  $('#beSave', m).onclick = () => {
    const items = [...sel].map(id => byId.get(id)).filter(Boolean);
    if (!items.length) {
      confirmBox(`Aucun chèque n'est coché : supprimer le bordereau <b>${b.numero}</b> ?`, () => {
        Store.deleteBordereau(b); renderAll(); toast(`Bordereau ${b.numero} supprimé`);
      }, 'Supprimer');
      return;
    }
    Store.updateBordereau(b, $('#beBank', m).value, items);
    renderAll(); toast(`Bordereau ${b.numero} modifié`); bordereauDetail(b);
  };
}

/* ---------------- Chargement direct (sans commande) ----------------
   Même fonctionnement que la prise de commande du commercial :
   date + client + camion obligatoires, puis toucher un produit pour saisir quantité et prix. */

function initDirect() {
  $('#dDate').value = new Date().toISOString().slice(0, 10);
  fillDirectClients();
  $('#dTruckList').innerHTML = truckDatalist();

  $('#dDate').onchange = refreshDirect;
  // la grille est mise à jour à chaque frappe ; à la sortie du champ on met seulement en majuscules
  // (sans redessiner, pour ne pas perdre le toucher sur un produit)
  $('#dTruck').oninput = refreshDirect;
  $('#dTruck').onchange = () => { $('#dTruck').value = $('#dTruck').value.trim().toUpperCase(); };
  $('#dClient').onchange = onDirectClientChange;
  $('#dSearch').oninput = renderDirectProducts;
  $('#dClear').onclick = () => confirmBox('Vider le chargement en cours ?', () => { dCart.clear(); refreshDirect(); }, 'Vider');
  $('#dSave').onclick = directRecap;
  renderDirectCats();
  refreshDirect();
}

function fillDirectClients() {
  const sel = $('#dClient'), prev = sel.value;
  sel.innerHTML = '<option value="">— Choisir un client —</option>' +
    [...Store.data.clients].sort((a, b) => a.nom.localeCompare(b.nom))
      .map(c => `<option value="${c.id}">${esc(c.nom)}${c.ville ? ' (' + esc(c.ville) + ')' : ''}</option>`).join('');
  sel.value = prev;
}

function directReady() {
  return $('#dDate').value && +$('#dClient').value && $('#dTruck').value.trim();
}

function onDirectClientChange() {
  const sel = $('#dClient');
  if (dCart.size && sel.value !== dLastClient) {
    const v = sel.value;
    sel.value = dLastClient;
    confirmBox('Changer de client videra le chargement en cours (les prix dépendent du client). Continuer ?', () => {
      dCart.clear(); sel.value = v; dLastClient = v; refreshDirect();
    }, 'Changer de client');
    return;
  }
  dLastClient = sel.value;
  refreshDirect();
}

function refreshDirect() {
  renderDirectLines();
  renderDirectProducts();
}

/* Popularité : nombre de commandes + chargements directs contenant le produit */
function productStats() {
  const s = {};
  const add = lignes => lignes.forEach(l => { const x = s[l.productId] || (s[l.productId] = { n: 0, q: 0 }); x.n++; x.q += l.qte; });
  Store.data.orders.forEach(o => o.statut !== 'annulee' && add(o.lignes));
  Store.data.chargements.forEach(c => !c.orderId && c.statut !== 'annule' && add(c.lignes));
  return s;
}

function renderDirectCats() {
  const cats = [...new Set(Store.data.products.filter(p => p.actif).map(p => p.categorie).filter(Boolean))];
  $('#dCats').innerHTML = ['', ...cats].map(c =>
    `<button class="chip ${c === dCat ? 'active' : ''}" data-cat="${esc(c)}">${c ? esc(c) : 'Tous'}</button>`).join('');
  $$('#dCats .chip').forEach(ch => ch.onclick = () => { dCat = ch.dataset.cat; renderDirectCats(); renderDirectProducts(); });
}

function directPrice(p) {
  const cid = +$('#dClient').value;
  const lp = cid ? Store.lastPrice(cid, p.id) : null;
  return lp ? lp.prix : p.prix;
}

function renderDirectProducts() {
  const ready = directReady();
  $('#view-direct').classList.toggle('need-client', !ready);
  $('#dHint').hidden = !!ready;
  // signale les champs obligatoires encore vides
  $('#dDate').classList.toggle('missing', !$('#dDate').value);
  $('#dClient').classList.toggle('missing', !+$('#dClient').value);
  $('#dTruck').classList.toggle('missing', !$('#dTruck').value.trim());

  const q = $('#dSearch').value.trim().toLowerCase();
  const stats = productStats();
  const list = Store.data.products
    .filter(p => p.actif && (!dCat || p.categorie === dCat) &&
      (!q || (p.nom + ' ' + p.ref + ' ' + p.categorie + ' ' + p.conditionnement).toLowerCase().includes(q)))
    .sort((a, b) => (a.indisponible ? 1 : 0) - (b.indisponible ? 1 : 0) ||
      (stats[b.id]?.n || 0) - (stats[a.id]?.n || 0) || (stats[b.id]?.q || 0) - (stats[a.id]?.q || 0) || a.nom.localeCompare(b.nom));

  $('#dGrid').innerHTML = list.length ? list.map((p, i) => {
    const item = dCart.get(p.id);
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
        <span class="p-price">${money(directPrice(p))}</span>
      </div>
    </button>`;
  }).join('') : '<p class="empty">Aucun produit trouvé.</p>';

  $$('#dGrid .p-card').forEach(card => card.onclick = () => {
    if (!directReady()) {
      toast('Sélectionnez d\'abord la date, le client et le camion', 'error');
      const first = ['#dDate', '#dClient', '#dTruck'].map(s => $(s)).find(el => el.classList.contains('missing'));
      if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); first.classList.add('shake'); setTimeout(() => first.classList.remove('shake'), 600); first.focus(); }
      return;
    }
    const p = Store.product(+card.dataset.id);
    if (p.indisponible) { toast(`${p.nom} est actuellement indisponible`, 'error'); return; }
    directQtyPad(p);
  });
}

/* Saisie quantité + prix (prix proposé : dernier prix de vente au client) */
function directQtyPad(p) {
  const existing = dCart.get(p.id);
  const cid = +$('#dClient').value;
  const lp = Store.lastPrice(cid, p.id);
  const defaultPrice = existing ? existing.prix : (lp ? lp.prix : p.prix);
  const priceInfo = lp ? `Dernier prix pour ce client : <b>${money(lp.prix)}</b> (${fdate(lp.date)})`
    : `Première vente à ce client — prix catalogue : <b>${money(p.prix)}</b>`;

  const m = openModal('Produit à charger', `
    <div class="pad-product">
      <img src="${productImg(p)}" alt="">
      <div>
        <div class="pad-name">${esc(p.nom)}</div>
        <span class="sac-tag sac-tag-lg">${esc(p.conditionnement || 'Sac')}</span>
        <div class="muted small">${esc(p.ref)} • Client : ${esc(Store.client(cid).nom)}</div>
      </div>
    </div>
    <form id="padForm" class="pad-form">
      <label>Quantité<input id="padQte" class="pad-input" type="number" inputmode="numeric" pattern="[0-9]*"
        min="1" step="1" required value="${existing ? existing.qte : ''}" placeholder="0"></label>
      <label>Prix unitaire (DH)<input id="padPrix" class="pad-input" type="number" inputmode="decimal"
        min="0" step="0.01" required value="${defaultPrice}"></label>
      <div class="price-info">${priceInfo}</div>
      <div class="pad-amount">Montant : <b id="padAmount">0,00 DH</b></div>
    </form>`, {
    footer: `${existing ? '<button class="btn btn-danger" id="padDel">Retirer</button>' : ''}
             <button class="btn btn-light" data-close>Annuler</button>
             <button class="btn btn-primary btn-lg" form="padForm" id="padOk">${existing ? 'Modifier' : 'Ajouter au chargement'}</button>`
  });
  m.querySelector('.modal').classList.add('modal-pad');

  const qInp = $('#padQte', m), pInp = $('#padPrix', m);
  const show = () => {
    const qte = parseInt(qInp.value, 10) || 0;
    $('#padAmount', m).textContent = money(qte * (parseFloat(pInp.value) || 0));
    $('#padOk', m).disabled = qte <= 0;
  };
  qInp.oninput = show; pInp.oninput = show;
  [qInp, pInp].forEach(i => i.onfocus = () => i.select());
  show();
  qInp.focus();

  $('#padForm', m).onsubmit = e => {
    e.preventDefault();
    const qte = parseInt(qInp.value, 10) || 0;
    if (qte <= 0) { qInp.focus(); return; }
    dCart.set(p.id, { qte, prix: Math.round((parseFloat(pInp.value) || 0) * 100) / 100 });
    closeModal();
    refreshDirect();
    const row = $(`#dLines .order-line[data-id="${p.id}"]`);
    if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900); }
  };
  const del = $('#padDel', m);
  if (del) del.onclick = () => { dCart.delete(p.id); closeModal(); refreshDirect(); };
}

function directLines() {
  return [...dCart.entries()].map(([id, it]) => {
    const p = Store.product(id);
    return { productId: id, ref: p.ref, nom: p.nom, conditionnement: p.conditionnement, prix: it.prix, qte: it.qte };
  });
}

function renderDirectLines() {
  const lines = directLines();
  const tq = lines.reduce((s, l) => s + l.qte, 0);
  $('#dLines').innerHTML = lines.length ? lines.map((l, i) => `
    <div class="order-line" data-id="${l.productId}">
      <span class="ol-name"><span class="ol-num">${i + 1}</span>${esc(l.nom)}</span>
      <span><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></span>
      <span class="r ol-qty">${l.qte}</span>
      <span class="r ol-amount">${money(l.qte * l.prix)}<br><small class="muted">${money(l.prix)} / u</small></span>
      <span class="r"><button class="icon-btn text-danger" data-del aria-label="Retirer">✕</button></span>
    </div>`).join('')
    : '<div class="order-empty">Touchez un produit ci-dessous pour l\'ajouter au chargement.</div>';
  $('#dLineCount').textContent = `${lines.length} produit${lines.length > 1 ? 's' : ''}`;
  $('#dQty').textContent = `Qté totale : ${tq}`;
  $('#dTotal').textContent = money(Store.orderTotal({ lignes: lines }));
  $('#dSave').disabled = !lines.length;
  $('#dClear').disabled = !lines.length;
  $('#dPanel').classList.toggle('has-items', lines.length > 0);
  $$('#dLines .order-line').forEach(row => {
    const id = +row.dataset.id;
    row.onclick = e => {
      if (e.target.closest('[data-del]')) { dCart.delete(id); refreshDirect(); return; }
      directQtyPad(Store.product(id));
    };
  });
}

function directRecap() {
  const lines = directLines();
  if (!lines.length) return;
  if (!directReady()) { toast('Date, client et camion sont obligatoires', 'error'); return; }
  const cid = +$('#dClient').value;
  const immat = $('#dTruck').value.trim().toUpperCase();
  const m = openModal('Confirmer le chargement', `
    <div class="detail-head">
      <div><b>Date :</b> ${fdate($('#dDate').value)}</div>
      <div><b>Client :</b> ${esc(Store.client(cid).nom)}</div>
      <div><b>Camion :</b> ${plate(immat)}</div>
    </div>
    <table class="table">
      <thead><tr><th>Produit</th><th>Sac</th><th class="r">Qté</th><th class="r">Montant</th></tr></thead>
      <tbody>${lines.map(l => `<tr><td><b>${esc(l.nom)}</b></td><td><span class="sac-tag">${esc(l.conditionnement || 'Sac')}</span></td>
        <td class="r"><b>${l.qte}</b></td><td class="r">${money(l.qte * l.prix)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="3" class="r">Total</th><th class="r">${money(Store.orderTotal({ lignes: lines }))}</th></tr></tfoot>
    </table>
    <label style="margin-top:14px">Observations<textarea id="dNotes" rows="2"></textarea></label>`, {
    wide: true,
    footer: `<button class="btn btn-light" data-close>Retour</button>
             <button class="btn btn-primary btn-lg" id="dConfirm">🚚 Envoyer au chargement</button>`
  });
  $('#dConfirm', m).onclick = () => {
    const chg = Store.createChargement({
      clientId: cid, lignes: lines, camion: { immatriculation: immat },
      datePrevue: $('#dDate').value, notes: $('#dNotes', m).value.trim()
    });
    if (!chg) return;
    dCart.clear();
    $('#dClient').value = ''; dLastClient = '';
    $('#dTruck').value = '';
    $('#dTruckList').innerHTML = truckDatalist();
    refreshDirect();
    renderAll();
    toast(`Chargement ${chg.numero} enregistré`);
    paymentForm(chg, { afterCreate: true });
  };
}
