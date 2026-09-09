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
