# CairmDB Manager

Application Electron pour examiner et éditer une base de décision CairmDB. Les onglets couvrent les pays, produits régionaux, bundles, SKU et indicateurs de vérification.

## Démarrage

```bash
npm install
npm start
```

Le fichier `cairm-full-database.json` doit être fourni à la racine pour la lecture initiale et le packaging. Il est exclu de Git. Aucune valeur métier particulière n’est supposée par la documentation.

## Architecture

- `main.js` : fenêtre Electron et dialogues natifs.
- `preload.js` : interface limitée entre renderer et fonctions natives.
- `database-files.cjs` : validation du JSON, limite de 25 Mo, lecture et remplacement de fichier après écriture temporaire synchronisée.
- `src/renderer/index.html` : état de l’éditeur, formulaires, normalisation et import/export.
- `src/renderer/rework.css` : apparence de l’éditeur.
- `scripts/check-contract.cjs` et `scripts/check-database-files.cjs` : tests durables.
- `scripts/audit-database.cjs` : diagnostic de structure et de références, sans écriture de données métier.

Le renderer est isolé, sans Node, avec sandbox ; les nouvelles fenêtres et navigations externes sont bloquées. Le JSON est validé avant sauvegarde et copie. L’écriture utilise un temporaire voisin de la destination puis un renommage ; un export invalide n’écrase pas le fichier existant.

## Sauvegarde et limites

L’éditeur conserve un brouillon dans `localStorage`. Sa capacité dépend du quota disponible, inférieur à la limite de fichier dans certains environnements. Enregistrer explicitement les travaux importants dans un fichier. Une sauvegarde externe reste nécessaire.

La normalisation à l’import peut réconcilier ou retirer des références orphelines. Conserver l’original avant une migration importante. Checked signifie « fiche vérifiée » et ne change pas les décisions WWSxGA.

## Tests et audit

```bash
npm test
npm run audit:db
node scripts/audit-database.cjs /chemin/vers/une-base.json
```

L’audit imprime un rapport JSON sur les valeurs non reconnues, régions absentes, références invalides et collisions de noms. Les erreurs entraînent un code de sortie non nul ; les avertissements demandent un examen. Utiliser un fichier réel seulement lorsque la vérification de ses données est souhaitée.

## Construction

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Les résultats se trouvent dans `dist`. La cible Windows est un exécutable portable x64. Les builds supprimés pour nettoyer le projet sont régénérables ; les dépendances et la base sont conservées.

La documentation fonctionnelle détaillée se trouve dans le dépôt frère : [CairmDB Manager](<../Cairm/docs/obsidian/08 - CairmDB Manager.md>) et [WWSxGA](<../Cairm/docs/obsidian/06 - WWSxGA.md>).

## États et informations importantes (1.2.0)

Les quatre offres pays et produit utilisent Yes/No. Les anciens Temp restent affichés en orange et conservés à la sauvegarde ; ils peuvent être remplacés par Yes/No, mais ne sont plus proposés pour une nouvelle saisie. Les nouvelles fiches initialisent les offres à No. Le gris de Cairm correspond uniquement à des données absentes.

Une information importante, enregistrée dans le champ compatible `temporary_comment`, cible une ou plusieurs offres. Elle peut être définie pour le pays, le produit global ou une région produit. Elle s’ajoute aux notes ordinaires et conserve les disponibilités. Dans Cairm 0.39.0+, le cadre de la source devient bleu, ainsi que les offres concernées du produit. Les alertes pays et produit se cumulent. Exchange sépare maintenant disponibilité et destination ; les anciennes destinations sont conservées.

Validation navigateur optionnelle (Playwright et Edge requis) : `NODE_PATH=/tmp/cairm-browser-check/node_modules node scripts/check-editor-browser.cjs`.

## Référentiel unique CairmDB

Le JSON exporté conserve les noms affichés et les identifiants stables dans `ids.countries`, `ids.products` et `ids.bundles`, ainsi que les compositions des bundles. Les données métier WWSxGA restent dans `countries` et `products`, référencées par les mêmes codes internes. Le moteur de calcul reste dans l’extension.

Les SKU acceptent plusieurs valeurs, une par ligne, au niveau global ou pays ; au niveau régional, DBmanager conserve un seul SKU par région. La portée pays prime sur la région, puis le global.

Exporter et publier ce JSON à l’adresse configurée dans Cairm, puis actualiser sa base. Avec Cairm 0.44.0, ces ajouts ne nécessitent plus de modifier un index dans l’extension. La publication n’est pas automatique. Une identité peut être reconnue sans disposer encore de règles métier ; les alias ambigus restent refusés, avec priorité au bundle lorsqu’il partage son nom avec un produit.

## Import de l’index CRM et Sanitize DB (1.4.0)

Dans Cairm 0.45.0, DevMode → « Exporter l’index CRM pour DBManager » télécharge un fichier `cairm-crm-index` version 1. Il contient les noms de pays et produits accessibles au compte CRM, les états et le type CRM lorsqu’il est disponible ; les GUID sont uniquement informatifs. Les exports partiels sont signalés.

Dans DBManager, Home → « Importer l’index CRM » ajoute les identités absentes en comparant les noms et alias avec la normalisation textuelle de Cairm. Les règles métier existantes sont préservées. Les nouvelles entrées n’ont aucune règle, aucun tarif ni SKU inventé. Un bundle explicitement déclaré comme tel par le CRM est créé avec une composition vide à compléter ; un nom ambigu est signalé et non fusionné. Les fiches inactives sont incluses pour préserver les anciens dossiers. Un second import du même fichier ne crée pas de doublon. Les anciennes exports de diagnostic/catalogue complet ne remplacent pas ce nouveau format.

« Sanitize DB » retire les métadonnées d’import inutilisées des identités, les alias techniques/vides/répétés, les destinations `CHECK HERE`, les centres non référencés et les validations orphelines. Le statut Exchange `both` devient `retailer`, de même sens dans Cairm. Les statuts `temp`, les notes, les prix même inactifs, les identités sans règle et les champs non connus restent conservés ; les ambiguïtés sont signalées. Une destination retirée reste manquante : aucun centre de remplacement n’est choisi.

Le bouton « Cleanup » du scan global effectue uniquement les corrections syntaxiques et legacy dont le résultat est connu. Il ne complète aucune disponibilité à No, ne crée aucune région et ne renseigne aucune donnée métier manquante. Les statuts inconnus et les anciennes valeurs Temp nécessitent une revue manuelle.

Le scan et le nettoyage restent locaux. Le rapport signale les éléments legacy et les cas à vérifier ; les fiches pays, produits et bundles disposent d’un bouton pour ouvrir directement l’éditeur concerné. « Annuler » restaure la dernière sanitation tant qu’aucune autre modification n’a été faite. Exporter puis publier le JSON pour utiliser les modifications dans le CRM.

## Scan global et tableau de diagnostic (1.7.1)

« Scan DB » exécute tous les diagnostics dans un seul contrôle : intégrité des fiches et références, noms/alias et bundles, champs incomplets, syntaxe/legacy et rendu N/A du moteur Cairm 0.48.0. Le scan ne modifie aucune donnée. Le calcul s'effectue dans un Worker et ses résultats sont invalidés si la base change.

Le tableau est trié par nom de produit puis par champ, suivi des pays, bundles, centres et anomalies générales. Chaque champ possède une seule ligne pouvant porter plusieurs catégories :

- **No data** : produit sans règle régionale GA renseignée. Une identité, un SKU, une note globale ou un squelette de régions vide ne suffisent pas.
- **Partial data** : champs/régions/règles absents ou informations métier à compléter dans les autres fiches.
- **Not Resolved** : noms ambigus, identités et références introuvables ou compositions non résolues par Cairm.
- **N/A** : cases effectivement rendues N/A après les restrictions pays et les messages importants. Les produits No data sont exclus, également lorsqu'ils apparaissent comme composants d'un bundle. Les garanties pays restent prises en compte dans les autres combinaisons.
- **Syntaxe** : formats et valeurs invalides, incohérences structurelles et champs legacy. Les erreurs corrigeables automatiquement portent la mention « Corrigeable par Cleanup ».

Les boutons activent/désactivent les filtres indépendamment : les filtres actifs se cumulent (union), sans dupliquer les lignes communes. Tous sont actifs au départ ; tous désactivés, aucun résultat ne s'affiche. Les compteurs portent sur les champs du rapport complet, pas sur les seules lignes visibles. La recherche porte sur la fiche, l'ID, le pays, la région, le champ et le diagnostic. Le tableau est paginé par 50 lignes ; l'export JSON conserve l'intégralité des diagnostics et des occurrences pays × produit/bundle, quels que soient les filtres ou la page.

« Ouvrir le champ » ouvre la fiche, sélectionne la bonne région et entoure le contrôle concerné en orange. La fiche produit, pays, bundle ou SKU est aussi sélectionnée dans sa liste et défilée au centre de la zone visible. Les métadonnées, références orphelines et champs sans éditeur dédié sont présentés dans une fiche de détail, avec la valeur encadrée et le contenu de la fiche complète. La navigation et les modifications retirent l'ancien encadrement.

Les lignes Not Resolved proposent des étapes adaptées : comparer les fiches concurrentes, corriger les alias ou références dans CairmDB, restaurer une identité ou vérifier les composants du bundle. Les liens de comparaison ouvrent les fiches concernées. Ces suggestions ne modifient aucune donnée et ne demandent aucune modification du CRM ; elles ne choisissent pas arbitrairement entre deux produits ambigus.

Le bouton « Cleanup » apparaît en présence d'éléments Syntaxe et indique le nombre de corrections automatiques possibles. Il traite toute la base, indépendamment des filtres, puis relance le scan global. Les erreurs restantes demeurent visibles pour correction manuelle ; si aucune réparation automatique n'est disponible, le bouton est désactivé. « Annuler » permet de restaurer la base avant le dernier nettoyage tant qu'aucune autre modification n'a été faite. L'ouverture et l'export conservent les références cassées et les fiches orphelines pour qu'elles restent diagnosticables.

Le périmètre est la base chargée, sans accès au CRM ni à la base distante. Les noms CRM absents du référentiel, les champs du dossier et les erreurs réseau ne sont pas simulés. Importer un index CRM complet aide à couvrir les identités absentes. Un rapport sans N/A ne garantit pas la justesse métier des valeurs saisies. Une erreur d'exécution est signalée comme scan incomplet, jamais comme absence de problème.

Le moteur embarqué est généré depuis le dépôt frère Cairm : `npm run sync:cairm`. `npm test` contrôle sa synchronisation et les règles de diagnostic. Les validations navigateur, avec Playwright et Edge installés, sont `NODE_PATH=/tmp/cairm-browser-check/node_modules node scripts/check-editor-browser.cjs` et `NODE_PATH=/tmp/cairm-browser-check/node_modules node scripts/check-global-scan-browser.cjs`.

La base locale fournie a fusionné P535 dans P374 : alias conservés, SKU 5076299 et 5076771 conservés, composants des bundles B062 et B064 redirigés, validations des fiches fusionnées réinitialisées. Un ancien brouillon ou un JSON déjà exporté reste indépendant : ouvrir la base corrigée pour utiliser la fusion. La base distante de Cairm n'est pas publiée automatiquement.

La validation de navigation `NODE_PATH=/tmp/cairm-browser-check/node_modules node scripts/check-diagnostic-navigation-browser.cjs` vérifie les quatre listes longues, leur sélection/défilement, les cadres orange et les suggestions sans modification du CRM.
