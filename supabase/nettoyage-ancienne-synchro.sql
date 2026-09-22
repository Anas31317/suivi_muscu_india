-- =====================================================================
--  Supprime la table de l'ancienne synchro sans compte (muscu_state).
--
--  Elle était accessible avec la seule clé publique : à supprimer dès que
--  tes données sont bien sur ton compte (après ta 1re connexion, vérifie
--  que ton historique apparaît sur le site), puis "Run".
-- =====================================================================

drop table if exists public.muscu_state;
