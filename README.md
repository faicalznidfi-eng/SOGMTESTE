# SOGM — Application web de gestion des commandes

Application en HTML5, CSS3 et JavaScript (sans framework ni serveur) pour la minoterie SOGM.

## Démarrage
1. Décompresser le dossier.
2. Ouvrir `index.html` dans un navigateur récent (Chrome, Edge, Safari, Firefox).
3. Se connecter avec un compte de démonstration — le profil est détecté automatiquement et l'espace correspondant s'ouvre :

| Profil                  | Identifiant  | Mot de passe |
|-------------------------|--------------|--------------|
| Commercial              | `commercial` | `com123`     |
| Vendeur                 | `vendeur`    | `vendeur123` |
| Opérateur de chargement | `operateur`  | `oper123`    |
| Administrateur          | `admin`      | `admin123`   |

Changez ces mots de passe dès la première utilisation (Administration → Utilisateurs).

## Structure
```
index.html        Écran de connexion (choix du profil)
commercial.html   Prise de commande tactile (smartphone / tablette)
vendeur.html      Validation des commandes et chargements
operateur.html    Chargement des camions et confirmation des livraisons
admin.html        Administration
css/style.css     Styles (responsive, adaptés au tactile)
js/store.js       Données (localStorage), outils communs, impression du bon de commande
js/auth.js        Connexion
js/commercial.js  Espace commercial
js/vendeur.js     Espace vendeur
js/operateur.js   Espace opérateur de chargement
js/admin.js       Espace administrateur
img/              Logo SO.G.M et icône de l'application
manifest.json     Permet « Ajouter à l'écran d'accueil » sur tablette
```

## Circuit d'une commande
1. **Commercial** : choisit le client (obligatoire), puis les produits ; le prix proposé est le dernier prix de vente à ce client. Statut : *En attente*.
2. **Vendeur** : peut modifier les quantités, valide la commande (*Validée*), puis l'envoie au chargement en renseignant le camion (immatriculation) et la date prévue. Un bon de chargement est créé ; la commande passe *Au chargement*. Le vendeur peut aussi saisir un **chargement direct**, sans commande : il choisit d'abord la date, le client et le camion, puis touche les produits comme le commercial (quantité et prix, dernier prix du client proposé).
3. **Opérateur de chargement** : coche chaque produit chargé, corrige la quantité réellement chargée si besoin et confirme le chargement. Le stock des produits finis est alors diminué. La commande passe *Chargée*.
4. **Opérateur de chargement** : confirme la livraison. Le chargement et la commande passent *Livré(e)*.

## Paiements des chargements (vendeur)
Juste après l'envoi au chargement (ou le chargement direct), le vendeur enregistre le paiement ou choisit « Plus tard (crédit) ». Il peut encaisser plus tard depuis le détail du chargement ou l'onglet **Crédits**, qui liste tous les chargements ayant encore un reste à payer.
- Paiement **total ou partiel**, éventuellement en plusieurs fois et en plusieurs modes.
- **Espèces** : plafond de **19 999 DH par client et par jour** ; jamais plus que le reste à payer.
- **Chèque** : porteur, numéro et montant. **Virement** : référence (et banque). **Effet** : tireur, numéro, échéance.
- **Avance client** (numérotée AV-AAAA-NNNNN) : si un chèque, un virement ou un effet dépasse le reste à payer, le chargement est soldé et l'excédent est enregistré comme **avance** du client. Au prochain chargement de ce client, le mode « Avance client » est proposé d'office. Un paiement dont l'avance a déjà été utilisée ne peut pas être supprimé.
- Le **reste à payer** est affiché sur chaque ligne de paiement et à côté de chaque chargement.

## Chèques et bordereaux de remise (vendeur)
L'onglet **Chèques** liste tous les chèques encaissés et pas encore remis. Le vendeur coche les chèques, choisit le compte (**Crédit Agricole** ou **CIH**) et crée un **bordereau de remise** (BRD-AAAA-NNNNN), imprimable. Les chèques remis quittent automatiquement la liste et ne peuvent plus être supprimés. Le montant porté sur le bordereau est le montant total du chèque (y compris la part mise en avance).

Un bordereau peut être **modifié** (changement de banque, retrait de chèques — qui reviennent dans la liste à remettre —, ajout de chèques en attente) ou **supprimé**. La colonne **Liquidation** indique si chaque chèque est *totalement liquidé* ou s'il en reste une part non utilisée en avance (avec le numéro de l'avance) ; une case permet de n'afficher que les chèques non totalement liquidés.

L'administrateur saisit les numéros de compte / RIB dans **Banques & chèques**, où il consulte aussi les bordereaux et les totaux remis par banque.

## Recherche
Les listes ont une barre de recherche : **du / au**, **client**, texte libre, et les boutons « Aujourd'hui » / « Toutes les dates ». Par défaut, elles affichent les opérations **du jour**. Dans les listes de travail du vendeur (« À valider », « Validées »), un bandeau signale les commandes plus anciennes encore en attente. La liste des crédits affiche par défaut toutes les dates.

## Fonctionnalités de l'administrateur
Tableau de bord (dont crédit clients et encaissements du jour), commandes, chargements (consultation et impression du bon), produits avec photo et options « Visible pour les commerciaux » / « Produit indisponible », gestion des **sacs** (référence, désignation, quantité, mouvements d'entrée / sortie / inventaire avec historique), clients, utilisateurs (4 profils), sauvegarde.

Un produit indisponible reste affiché au commercial (grisé, en fin de liste) mais ne peut pas être commandé.

## Limite importante : données locales
Les données sont enregistrées dans le navigateur (localStorage, environ 5 Mo) **de chaque appareil**. Une commande saisie sur la tablette du commercial n'apparaît donc pas automatiquement sur le PC de l'administrateur. En attendant un serveur :
- le commercial exporte ses données (ou l'admin utilise la tablette) ;
- l'administrateur utilise **Sauvegarde → Fusionner les commandes d'un fichier**.

Pour un usage réel à plusieurs postes, l'étape suivante est d'ajouter un backend (par exemple PHP/MySQL ou Node.js) : il suffit de remplacer les fonctions `Store.load()` / `Store.save()` de `js/store.js` par des appels API. L'authentification devra alors se faire côté serveur.

## Hébergement sur le réseau local
Pour que les tablettes accèdent à l'application, placez le dossier sur un serveur web (IIS, Apache/XAMPP, ou `python -m http.server 8080`) et ouvrez `http://ADRESSE-DU-PC:8080` depuis la tablette.
