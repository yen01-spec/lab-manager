-- READ ONLY.
select extname, extversion from pg_extension where extname in ('pgcrypto','uuid-ossp');
