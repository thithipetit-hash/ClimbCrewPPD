-- Version historique conservée pour compatibilité avec schema_migrations.
-- Le DDL de l'analyse vidéo est déjà appliqué par 002_video_analysis.sql.
-- Les bases existantes qui ont enregistré 005 ne changent pas ; une base neuve
-- trace toujours cette version sans rejouer le même DDL une seconde fois.
select 1;
