# Instructions pour un assistant

Ce dépôt est le projet d'un étudiant de l'Académie IA : une plateforme de
boutiques en ligne, à la manière de Shopify, construite module après module, en
dix-huit modules. Des marchands ouvrent leur boutique, publient leurs produits
et leurs variantes, fixent leurs frais de livraison et leurs codes de
réduction. Des clients remplissent un panier, paient par Mobile Money et
suivent l'expédition de leur commande. L'étudiant débute souvent en
programmation. Ces règles valent pour tout assistant qui écrit du code ici.

Expliquez ce que vous faites en français simple, et définissez un mot technique
la première fois que vous l'employez. Nommez les fichiers, les classes, les
tables et les variables en français, sauf là où ce document dit le contraire.

## Ce qu'il ne faut jamais faire

**Ne modifiez jamais `academie/checks/`, `academie/run.mjs` ni
`.github/workflows/academie.yml`.** Ce sont les vérifications de l'Académie.
Leurs empreintes sont comparées à chaque remise : un fichier modifié envoie le
travail de l'étudiant en revue humaine, même s'il est juste.

Quand une vérification échoue, la réponse n'est jamais de changer le test. Elle
est de corriger le code de l'étudiant, dans `src/`, `web/` ou `migrations/`.

**Ne mettez aucun secret dans le code.** L'adresse de la base et les clés vont
dans `.env`, qui n'est pas versionné. Un mot de passe envoyé sur GitHub reste
lisible dans l'historique après avoir été retiré.

**Ne remplacez pas les choix de l'étudiant sans le lui dire.** S'il a nommé une
table `boutiques`, gardez `boutiques`.

**N'ajoutez pas de service qui exige une carte bancaire.** Le parcours n'en
emploie aucun : le paiement est simulé, les photos passent par un stockage
simulé en local et par Supabase Storage en production, l'hébergement se fait
sur Render.

**Une boutique ne voit jamais rien d'une autre boutique.** Chaque requête qui
lit ou modifie un produit, une variante, une commande, un code de réduction ou
un tarif de livraison vérifie qu'il appartient bien à la boutique demandée, et
que le compte connecté en est le propriétaire. Connaître un identifiant ne
donne aucun droit.

**Ne croyez jamais un prix envoyé par le navigateur.** Le serveur relit les
prix des variantes dans sa base, et recalcule le devis, la réduction, les frais
de livraison et le total.

**Ne rendez jamais l'adresse électronique ni le numéro de téléphone d'un compte
à un autre compte.** Le marchand voit l'adresse de livraison de ses propres
commandes, et rien d'autre de ses clients. La vitrine dit si une variante est
disponible, jamais combien il en reste.

**N'écrivez jamais le contenu d'un message, une adresse de livraison, une
adresse électronique ou un numéro de téléphone dans les journaux du serveur**,
c'est-à-dire les messages qu'il écrit pendant qu'il tourne.

## Comment les vérifications atteignent le code

Les suites de `academie/checks/` n'importent jamais les fichiers de l'étudiant.
Elles importent un fichier par module, `src/academie/module-N.ts`, que le cours
appelle le **fichier traducteur**. Il réexporte, sous les noms attendus, ce que
l'étudiant a construit sous ses propres noms.

```ts
// À gauche, le nom attendu. À droite, celui de l'étudiant.
export { normaliserTelephone as normalizePhone } from '../domaine/telephone'
```

Quand la vérification attend une classe avec des méthodes aux noms anglais
(`Order.place`, `transitionTo`), et que l'étudiant a écrit les siennes en
français, le fichier traducteur ne peut pas se contenter de renommer la classe :
il l'enveloppe dans une petite classe qui appelle les méthodes françaises.

L'en-tête de chaque fichier de `academie/checks/module-N/` écrit exactement ce
que le fichier traducteur de ce module doit exporter. Lisez-le avant d'écrire
du code pour un module.

## Là où l'anglais est imposé

Partout ailleurs, le français est la règle.

- **Les noms exportés par les fichiers traducteurs**, comme `Order` ou
  `placeOrder`, et les valeurs qu'ils échangent, comme `PAID` ou `SHIPPED`.
- **Les routes vérifiées au module 15** : `GET /health`, `GET /shops`,
  `GET /shops/:slug/products`, `POST /shops`, `POST /orders`, `GET /orders`.
- **Les composants de shadcn**, dans `web/src/components/ui`. On garde leur
  convention : c'est celle que toute la documentation emploie.

Les routes de connexion du module 5 sont libres : l'étudiant les déclare dans
son fichier traducteur.

## Les conventions du domaine

Elles sont expliquées dans `docs/decisions/`.

- **Une boutique a une adresse courte, son slug** : `atelier-lamba`, en
  minuscules, chiffres et tirets. Sa vitrine est à `/boutiques/atelier-lamba`.
  Un slug est unique sur toute la plateforme.
- **Un produit a des variantes.** Un t-shirt existe en S, M et L, en blanc et
  en indigo : chaque combinaison est une variante, avec son prix, son stock et
  sa référence (le SKU), unique dans la boutique.
- **Un montant est un entier en ariary.** L'ariary n'a pas de centimes :
  45 000 Ar se stockent `45000`. Un poids est un entier en grammes. Une ligne de
  commande garde son prix et son titre du moment.
- **Le cycle de vie d'une commande est décrit en un seul endroit.** Les statuts
  sont `PENDING_PAYMENT`, `PAID`, `SHIPPED`, `DELIVERED`, `CANCELLED` et
  `EXPIRED`.
- **La livraison se paie par zone.** Les zones sont les six anciennes
  provinces : `antananarivo`, `antsiranana`, `fianarantsoa`, `mahajanga`,
  `toamasina`, `toliara`. Chaque boutique fixe son tarif dans les zones qu'elle
  dessert.
- **Un numéro de téléphone se range sous une seule forme** : `+261` suivi des
  neuf chiffres, par exemple `+261341234567`, quelle que soit la façon dont il a
  été tapé.
- **Un instant se range en `timestamptz`, une journée se compte à
  Madagascar** (UTC+3). Un code de réduction valable « jusqu'au 31 juillet »
  l'est jusqu'à 23 h 59, heure d'Antananarivo.

## La base de données

PostgreSQL, avec la bibliothèque `pg` et du SQL écrit à la main. Pas d'ORM :
les règles centrales du parcours, un stock qui ne descend jamais sous zéro et un
code de réduction qui ne sert pas plus que prévu, reposent sur des contraintes
et des requêtes que l'on doit voir écrites.

Les migrations sont des fichiers `.sql` numérotés dans `migrations/`.
`npm run migrate` les applique, sur la machine comme dans les vérifications de
GitHub. Le code lit l'adresse de la base dans `process.env.DATABASE_URL`.

## La structure

```text
academie/            les vérifications. Ne pas toucher.
src/app.ts           les routes de l'API, en Hono.
src/serveur.ts       le démarrage de l'API.
src/academie/        les fichiers traducteurs.
migrations/          le SQL des tables.
web/                 l'interface, en Vite et React.
docs/                la spécification, les décisions, les rapports.
```

L'interface et l'API sont **deux applications** qui s'installent séparément.
À partir du module 3, les vérifications construisent aussi l'interface avec
`npm run build` : une erreur de type dans `web/` fait échouer le module.

## Les commandes

```bash
npm run academie 5     # les vérifications jusqu'au module 5
npm run academie 12 -- --seul   # la seule suite du module 12, pour relire un échec
npm run migrate        # applique les migrations
npm run dev            # l'API, sur le port 3000
npm run dev:web        # l'interface, sur le port 5173
npm test               # les tests de l'étudiant, dans src/
npm run typecheck      # les types de l'API
```

`npm run academie` écrit ses données d'essai dans `DATABASE_URL_VERIFICATION`
quand elle est définie, et y applique d'abord les migrations. Ne pointez jamais
cette variable vers la base de l'application.

Lancez `npm run academie N` et `npm run typecheck` avant chaque envoi. Les
vérifications sont cumulatives : au module 5, celles des modules 1 à 4 tournent
encore. Elles ne contrôlent pas les types de `src/` : c'est `npm run typecheck`
qui le fait.

Ne lancez jamais `npx vitest` directement sur `academie/checks/` : sans le
lanceur, `.env` n'est pas lu, et les données d'essai iraient dans la base de
l'application au lieu de `DATABASE_URL_VERIFICATION`.

Les modules 16 et 17, la messagerie avec la boutique et les avis vérifiés, ne
concernent que le palier Platine. Le module 18, l'extra visuel, est vendu à
part.

## L'interface

Tailwind CSS et [shadcn/ui](https://ui.shadcn.com) sont déjà configurés. Un
composant s'ajoute depuis `web/` :

```bash
npx shadcn@latest add button
```

Le kit en fournit déjà plusieurs : bouton, champ, zone de texte, étiquette,
liste déroulante (`native-select`, pour une variante ou une zone), onglets,
carte, badge, séparateur, boîte de dialogue, avatar, curseur (`slider`, pour
un prix) et interrupteur. Le routeur est `react-router`, câblé dans
`web/src/main.tsx`. Des boutiques, des produits, un panier et une commande
inventés attendent dans `web/src/donnees/fictives.ts`.

Les écrans se construisent au module 3 sur ces données fictives. Chaque module
suivant branche l'écran qui le concerne sur l'API : remplacez l'import des
données fictives par un appel à l'API, sans réécrire la mise en page.

Pensez d'abord au téléphone : c'est là que la plupart des clients achètent, et
que beaucoup de marchands gèrent leur boutique.

Les couleurs sont des variables CSS dans `web/src/styles.css`. Ne mettez jamais
une couleur en dur dans un composant.

**N'écrivez pas de composant maison pour ce que shadcn fournit déjà.**

Deux pièges propres à ces composants :

- Le `Button` de shadcn se rend avec `type="button"`. Dans un `<form>`, il n'envoie
  donc jamais le formulaire, sans erreur ni message. Écrivez `type="submit"` sur le
  bouton qui envoie.
- Un champ de fichier caché (`className="hidden"`) n'a pas d'`aria-label` : un champ
  qu'on ne voit pas ne se nomme pas, et il ferait doublon avec le bouton qui l'ouvre.
