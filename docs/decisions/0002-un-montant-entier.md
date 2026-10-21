# 0002 : Un montant est un entier en ariary, figé dans la commande

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Une commande additionne des prix, ajoute des frais de livraison, retire une
réduction. Avec des nombres à virgule, `0.1 + 0.2` ne vaut pas `0.3`, et une
somme d'argent ne tolère aucune approximation. Il faut aussi savoir ce que le
client a réellement payé : si le marchand change son prix demain, la commande
d'hier ne doit pas changer.

## La décision

**Un montant est un entier, en ariary**, qui n'a pas de centimes : 45 000 Ar se
stockent `45000`. Les colonnes d'argent sont de type `integer` ou `bigint`,
jamais `numeric`, `real` ni `money`. **Un poids est un entier, en grammes.**

Une variante a un prix strictement positif, et peut avoir un **prix barré**
(`compareAtPrice`), l'ancien prix affiché à côté pour montrer une baisse. Le
prix barré est toujours plus grand que le prix.

Une commande additionne ses lignes, prix unitaire fois quantité, puis ajoute
les frais de livraison. Au module 11, elle retire une réduction, arrondie à
l'ariary inférieur.

**Une ligne de commande garde son prix et son titre du moment.** On les copie
dans la ligne au moment de commander. Le prix d'une variante peut changer
ensuite; la commande, jamais.

**Le serveur ne croit aucun prix venu du navigateur.** Le panier envoie des
variantes et des quantités; le serveur relit les prix dans sa base.

## Ce que ça coûte

Une copie du prix et du titre dans chaque ligne de commande, et un formatage à
l'affichage : `45000` s'écrit « 45 000 Ar ».

## Ce qui a été écarté

**Un nombre à virgule.** Faux dès la première addition.

**Relire le prix de la variante à chaque affichage de la commande.** Plus
léger, mais la commande change quand le marchand change son prix, et personne
ne sait plus ce qui a été payé.
