# 0001 : Des boutiques séparées, des produits à variantes

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Une plateforme comme Shopify héberge des milliers de boutiques sur une seule
application et une seule base. Chacune croit être seule : ses produits, ses
commandes, ses clients, ses codes de réduction. Il suffit d'une requête qui
oublie de vérifier la boutique pour qu'un marchand lise les commandes d'un
concurrent, ou modifie le prix d'un produit qui n'est pas le sien.

Un même produit se vend aussi sous plusieurs formes. Un t-shirt existe en S, M
et L, en blanc et en indigo. Si chaque forme était un produit à part, la vitrine
montrerait six t-shirts identiques, et le stock d'une taille se confondrait avec
celui d'une autre.

## La décision

**Chaque boutique a un propriétaire et un slug**, son adresse courte :
`atelier-lamba`. Le slug est fait de 3 à 40 caractères, en minuscules, chiffres
et tirets, sans tiret au début ni à la fin ni deux tirets de suite. Il est
unique sur toute la plateforme. Quelques slugs sont réservés, parce qu'ils
serviront d'adresses à la plateforme elle-même : `admin`, `api`, `www`,
`boutiques`, `compte`.

**Tout ce qu'une boutique possède porte sa marque.** Un produit, une
collection, un tarif de livraison, un code de réduction, une commande désignent
leur boutique. Chaque requête vérifie la boutique avant de lire ou d'écrire,
et le compte connecté doit en être le propriétaire pour la gérer.

**Un produit a des options et des variantes.** Une option est une dimension du
choix, avec ses valeurs : `Taille` (S, M, L), `Couleur` (Blanc, Indigo). Un
produit a de zéro à trois options. Une variante est une combinaison de valeurs,
une par option : « M / Indigo ». C'est la variante qui porte le prix, le stock,
le poids et la référence, le **SKU** (*stock keeping unit*), unique dans la
boutique. Un produit sans option a une seule variante.

Un produit naît en brouillon (`DRAFT`). Il n'apparaît dans la vitrine qu'une
fois publié (`ACTIVE`), et la quitte quand il est archivé (`ARCHIVED`).

## Ce que ça coûte

Une jointure de plus dans presque chaque requête, pour remonter à la boutique,
et un paramètre de plus dans presque chaque fonction. Un oubli ne fait rien
planter : il ouvre une fuite silencieuse. Les vérifications créent donc
toujours deux boutiques, et essaient de passer de l'une à l'autre.

## Ce qui a été écarté

**Une base par boutique.** L'isolation est parfaite, mais chaque nouvelle
boutique demande une nouvelle base, et chaque migration doit tourner mille
fois.

**Un produit par variante.** Plus simple à ranger, mais la vitrine se remplit
de doublons, et le client ne voit plus qu'un t-shirt existe dans sa taille.
