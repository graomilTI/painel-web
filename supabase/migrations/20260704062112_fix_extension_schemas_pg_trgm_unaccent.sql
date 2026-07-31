drop extension if exists pg_trgm;
drop extension if exists unaccent;
create extension if not exists pg_trgm with schema public;
create extension if not exists unaccent with schema public;;
