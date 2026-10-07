# NEXALVO migration provenance

The recipe tenant guard was installed and verified on 2026-10-07.
Canonical version in this directory matches PROD: 20261007160955.
TEST recorded the identical guard under version 20261007160823.
The CLI originally generated local draft version 20261007160815.
Function definition MD5 in TEST and PROD: bc71e18c5969965100281266b5d12bf4.

This directory is not a complete baseline of the existing database.
Do not run db push or reapply this CREATE statement against an existing
project before reconciling migration history with its actual installed schema.
No migration-history repair or database deployment runs automatically here.
The SQL protects recipe product/ingredient links and does not rewrite data.

Validation: valid same-tenant recipe insert and RPC upsert/clear passed;
cross-tenant direct INSERT and UPDATE were rejected in TEST and PROD.
Fixtures rolled back. No Auth user or permanent account was changed by this migration.