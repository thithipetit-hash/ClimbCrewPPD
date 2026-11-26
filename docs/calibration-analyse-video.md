# Calibration moteur 1.5.0

## Référence de terrain (vidéo privée non publiée)

Vidéo portrait 145,62 s, 480 × 848 en orientation affichée. Ancien résultat MediaPipe 1.4.0 communiqué : 224 ajustements, 93 pics, zéro pause, 95 % de corps détecté.

### Itération 1 — compensation de translation
Échantillonnage 4 Hz, 582 images, 581 intervalles. Référence indépendante : flux optique pyramidal OpenCV, affine partielle RANSAC, consensus ≥ 60 %. 564 intervalles fiables, dont 88 avec translation centrale supérieure à 5 px en résolution affichée. Estimateur JS : 525 intervalles acceptés. Sur les 522 intervalles communs fiables, erreur médiane 0,29 px, P90 0,56 px. Parmi eux 67 translations >5 px, aucune erreur >5 px. Le modèle ne corrige pas explicitement rotation/zoom/perspective ; les consensus insuffisants interrompent les mesures temporelles.

### Itération 2 — événements temporels
Extrait 104–112 s : 33 échantillons issus d’un suivi optique de repères choisis manuellement (bassin, deux chaussures, un poignet ; échelle de torse fixée au premier échantillon). Arrêt au premier repère devenu non fiable. Anciennes règles appliquées à ces trajectoires : 14 ajustements candidats, aucune pause. Nouvelles règles sur les mêmes trajectoires et compensation de translation : 0 ajustement candidat, une phase stable de 8 s, cohérente avec la lecture visuelle. Ce n’est ni un comptage exhaustif ni une réanalyse MediaPipe complète.

Les seuils de persistance (0,5 s), de déplacement net (0,10 torse et 3 px minimum), de délai (1,2 s), le filtre médian temporel et l’hystérésis de repos sont des paramètres expérimentaux. Le moteur conserve les mesures historiques, distingue la couverture des mouvements, pieds et pauses et avertit si elle est insuffisante. Les événements ne prouvent pas le contact avec une prise. Les anciennes analyses ne sont pas recalculées automatiquement. Une campagne de validation sur plusieurs vidéos et annotations humaines demeure nécessaire.

Aucune vidéo, image ni coordonnée individuelle du cas de référence n’est ajoutée au dépôt.
