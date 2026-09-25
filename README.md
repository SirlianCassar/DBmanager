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

Le scan et le nettoyage restent locaux. Le rapport signale les éléments legacy et les cas à vérifier ; les fiches pays, produits et bundles disposent d’un bouton pour ouvrir directement l’éditeur concerné. « Annuler » restaure la dernière sanitation tant qu’aucune autre modification n’a été faite. Exporter puis publier le JSON pour utiliser les modifications dans le CRM.
