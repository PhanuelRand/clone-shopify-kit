# 0006 : Un instant se range en UTC, une journée se compte à Madagascar

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Un marchand crée un code de réduction « valable du 1er au 31 juillet ». Mais
quel 31 juillet ? Le serveur peut tourner en Europe ou aux États-Unis, et
l'heure de son horloge n'est pas celle de Madagascar. Un code qui s'arrêterait
à minuit UTC cesserait de marcher à 3 heures du matin à Antananarivo, et un
client qui commande le 1er août à 1 heure du matin pourrait encore en profiter.

## La décision

**Un instant se range dans une colonne `timestamptz`**, qui garde un point
précis dans le temps, quel que soit le fuseau du serveur. Le moment d'une
commande, d'un paiement ou d'une expédition est un instant.

**Une journée se compte à l'heure de Madagascar**, le fuseau
`Indian/Antananarivo`, soit UTC+3, sans heure d'été. Minuit à Madagascar, c'est
21 h 00 UTC.

- Les dates d'un code de réduction sont des colonnes de type `date`, sans
  heure. Un code valable du 1er au 31 juillet marche du 1er juillet à 0 h 00 au
  31 juillet à 23 h 59, heure de Madagascar, bornes comprises.
- Un délai court, comme les trente minutes pour payer une commande, se compte
  en instants : trente minutes après l'instant de la commande, où que l'on soit.

L'instant présent est passé en paramètre au lieu d'être lu sur l'horloge, pour
que minuit se vérifie sans attendre minuit.

## Ce que ça coûte

Il faut convertir avant de comparer, et ne jamais découper une date avec
`toISOString()`, qui donne la date en UTC : la veille, entre minuit et 3 heures
du matin à Madagascar.

## Ce qui a été écarté

**Des dates de validité à l'heure près.** Justes, mais personne ne sait à quelle
heure son code s'arrête. « Jusqu'au 31 juillet inclus » se lit sans calcul.
