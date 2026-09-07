-- Le nettoyage des transferts vidéo expirés filtre sur created_at. Cet index
-- évite un parcours complet de la table lorsque des transferts inachevés
-- s'accumulent.
create index if not exists idx_route_video_upload_chunks_created_at
  on route_video_upload_chunks(created_at);
