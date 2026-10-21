# 0003 : Un seul endroit décide des passages

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Une commande traverse plusieurs situations : en attente de paiement, payée,
expédiée, livrée, annulée, ou expirée faute de paiement. Si plusieurs fichiers
se permettent de changer cette situation, chacun applique sa propre lecture des
règles.

On voit alors un colis expédié qui se fait rembourser, ou une commande expirée
qui redevient payée et sort un article du stock une seconde fois, sans pouvoir
dire quel fichier en est la cause.

## La décision

**Les passages autorisés sont décrits dans un seul objet, et une seule méthode
les applique.** Elle lève une erreur quand le passage demandé n'est pas permis.
Aucun autre code ne modifie le statut d'une commande.

| Depuis | Vers |
| --- | --- |
| `PENDING_PAYMENT` | `PAID`, `CANCELLED`, `EXPIRED` |
| `PAID` | `SHIPPED`, `CANCELLED` |
| `SHIPPED` | `DELIVERED` |
| `DELIVERED` | aucun |
| `CANCELLED` | aucun |
| `EXPIRED` | aucun |

Une commande payée s'annule tant qu'elle n'est pas expédiée : le client est
alors remboursé. Une fois le colis parti, elle ne s'annule plus. Une commande
non payée à temps expire, et ses articles reviennent en stock.

## Ce que ça coûte

Un détour : un service qui veut marquer une commande expédiée ne peut pas
écrire le nouveau statut directement, il doit passer par cette méthode.

## Ce qui a été écarté

**Un `if` à chaque endroit qui change l'état.** C'est plus rapide à écrire les
trois premières fois. Au dixième, plus personne ne sait quelles règles
s'appliquent réellement, et les corriger demande de toutes les retrouver.
