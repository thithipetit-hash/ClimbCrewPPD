# Analyse vidéo : fondements et limites

## Publications consultées

- [Dynamics of Experience in a Learning Protocol: A Case Study in Climbing (2020)](https://doi.org/10.3389/fpsyg.2020.00249) : durée, part d'immobilité, entropie géométrique de la trajectoire de hanche et variations d'orientation. ClimbCrew expose une approximation descriptive du temps immobile, calculée sur ses propres seuils et sur le temps analysable ; ce n'est pas une reproduction validée du protocole.
- [Analysis of Competition and Training Videos of Speed Climbing Athletes Using Feature and Human Body Keypoint Detection Algorithms (2022)](https://doi.org/10.3390/s22062251) : comparaison des séquences vidéo par points corporels. La vitesse et la difficulté ne partagent pas nécessairement les mêmes objectifs.
- [Climbing Technique Evaluation by Means of Skeleton Video Stream Analysis (2023)](https://doi.org/10.3390/s23198216) : exploitation des articulations et reconnaissance d'erreurs chez des novices, avec capteur de profondeur. Les observations 2D de ClimbCrew ne reproduisent pas la mesure 3D.
- [Performance indicators in speed climbing (2024)](https://doi.org/10.3389/fspor.2023.1304403) : fluidité, trajectoire et expertise. Ne pas transposer les seuils de vitesse au club.
- [The Way Up (CVPR Workshops, 2025)](https://openaccess.thecvf.com/content/CVPR2025W/CVSPORTS/html/Maschek_The_Way_Up_A_Dataset_for_Hold_Usage_Detection_in_CVPRW_2025_paper.html) : données annotées d'usage des prises et difficulté de l'estimation de pose spécialisée. La détection réelle de contacts main/pied reste à développer.

## Décisions de cette évolution

- Réutiliser le moteur MediaPipe, les règles du club, les conseils et les enregistrements existants. Aucun service externe d'analyse ni nouvelle dépendance.
- Ajouter un mode fichier local temporaire ; aucun transfert de la vidéo ou sauvegarde de ses mesures dans ce mode.
- Corriger la géométrie 2D pour le rapport largeur/hauteur de la vidéo. Les positions de trajectoire exportées restent normalisées ; le moteur passe à 1.4.0. Ne pas interpréter les différences de versions comme des progrès.
- Exposer la part des pauses reconnues dans le temps analysable et la comparer entre analyses. La durée observée est une approximation ; une pause peut être utile ou nécessaire à la sécurité.
- La composante verticale du bassin est le cumul absolu des déplacements verticaux divisé par la longueur du chemin, non une mesure de déplacement net ou d'efficacité globale. Un dévers ou une traversée peut naturellement donner une valeur faible.
- La couverture d'observation ne valide ni la précision des repères ni l'identité du sujet. Pas de diagnostic, de force estimée, de validation de sécurité ou d'impact CPR.
- Pistes ultérieures : superposition du squelette avec visibilité par articulation, lissage de trajectoire, segmentation d'appuis confirmés, comparaison de la même séquence et validation sur vidéos annotées par les encadrants.
