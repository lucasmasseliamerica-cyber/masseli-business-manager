jsonb_build_object(
 'scope','NATIVE_DISPOSABLE_ONLY',
 'backend_pid',pg_backend_pid(),'backend_start',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),
 'cluster_id',(SELECT system_identifier::text FROM pg_control_system()),'postmaster_start',pg_postmaster_start_time(),
 'database',current_database(),'sql_role',current_user,'session_role',session_user,
 'server_address',inet_server_addr()::text,'server_port',inet_server_port(),
 'read_only',current_setting('transaction_read_only'),
 'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'tls_version',(SELECT version FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'cipher',(SELECT cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'client_dn',(SELECT client_dn FROM pg_stat_ssl WHERE pid=pg_backend_pid()))
