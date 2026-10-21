# 0008 : La livraison se paie par zone, au poids

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Un colis de 300 grammes envoyé dans la même ville ne coûte pas ce que coûte un
colis de 4 kilos envoyé à Toliara. Si chaque boutique décrivait ses frais avec
ses propres mots, « Tana et environs », « province », « côte Est », le client ne
saurait jamais d'avance combien il paiera, et la plateforme ne pourrait rien
calculer.

## La décision

**Les zones forment une liste fixe**, les six anciennes provinces, désignées
par leur slug :

| Zone | Slug |
| --- | --- |
| Antananarivo | `antananarivo` |
| Antsiranana | `antsiranana` |
| Fianarantsoa | `fianarantsoa` |
| Mahajanga | `mahajanga` |
| Toamasina | `toamasina` |
| Toliara | `toliara` |

**Chaque boutique fixe un tarif dans les zones qu'elle dessert**, et seulement
celles-là. Un tarif a trois nombres entiers :

- le **prix de base**, qui couvre le premier kilogramme;
- le **prix par kilogramme entamé** au-delà du premier : 1 001 grammes comptent
  un kilogramme de plus, 2 001 grammes en comptent deux;
- le **seuil de livraison offerte**, facultatif : à partir de ce sous-total,
  bornes comprises, la livraison est gratuite.

Le poids d'une commande est la somme des poids des variantes, fois leurs
quantités. Une boutique qui ne dessert pas la zone du client refuse la
commande, avec un motif.

## Ce que ça coûte

Le client choisit sa zone avant de connaître ses frais, et une boutique qui
voudrait un tarif différent pour Antsirabe et pour Ambositra ne le peut pas.

## Ce qui a été écarté

**Un prix au kilomètre, calculé sur la carte.** Juste pour un livreur à moto en
ville; faux pour un colis qui part en taxi-brousse ou par la poste, où la
distance compte moins que la ligne desservie.

**Un prix unique pour tout le pays.** Simple, mais une boutique de Toamasina
perdrait de l'argent sur chaque colis envoyé à Toliara.
