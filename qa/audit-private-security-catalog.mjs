#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { scanSecrets } from './audit-final-security-catalog.mjs';

export const TEST_PROJECT_REF = 'msinksoilkluooxenecy';
const EVIDENCE_VERSION = 1;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashJson = (value) => sha256(JSON.stringify(value));

export function normalizePrivateCatalogExport(value) {
  let candidate = value;
  if (Array.isArray(candidate)) {
    if (candidate.length !== 1) throw new Error('private catalog export must contain exactly one row');
    [candidate] = candidate;
  }
  if (candidate?.final_private_security_catalog) candidate = candidate.final_private_security_catalog;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('invalid private catalog export envelope');
  }
  return candidate;
}

function functionEvidence(row) {
  const definition = row.definition || '';
  return {
    ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'definition')),
    definition_sha256: sha256(definition),
    definition_length: definition.length,
    security_signals: {
      auth_uid: /auth\.uid\s*\(/i.test(definition),
      fixed_empty_search_path: (row.settings || []).includes('search_path=""'),
      dynamic_execute: /\bEXECUTE\s+(?:format\s*\(|[^;]*\|\|)/i.test(definition),
      set_role: /\bSET\s+(?:LOCAL\s+)?ROLE\b/i.test(definition),
    },
  };
}

function grantMatrix(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const key = `${row.table_schema}\0${row.table_name}\0${row.grantee}`;
    if (!grouped.has(key)) grouped.set(key, {
      schema_name: row.table_schema,
      table_name: row.table_name,
      grantee: row.grantee,
      privileges: [],
    });
    grouped.get(key).privileges.push(row.privilege_type);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    privileges: [...new Set(row.privileges)].sort(),
  })).sort((a, b) => `${a.schema_name}:${a.table_name}:${a.grantee}`
    .localeCompare(`${b.schema_name}:${b.table_name}:${b.grantee}`));
}

function wrapperComparison(publicEvidence, privateFunctions) {
  const mappings = [
    ['nexalvo_backup', 'export_business_data', 'fn_export_business_data'],
    ['nexalvo_platform', 'has_access', 'fn_platform_access'],
    ['nexalvo_platform', 'assign_first_owner', 'fn_platform_assign_first_owner'],
    ['nexalvo_platform', 'company_directory', 'fn_platform_company_directory'],
    ['nexalvo_platform', 'provision_company', 'fn_platform_provision_company'],
  ];
  return mappings.map(([schemaName, privateName, publicName]) => {
    const privateFunction = privateFunctions.find((row) => row.schema_name === schemaName && row.name === privateName);
    const publicFunction = (publicEvidence?.functions || []).find((row) => row.name === publicName);
    return {
      private_function: `${schemaName}.${privateName}(${privateFunction?.arguments || ''})`,
      public_wrapper: `${publicName}(${publicFunction?.arguments || ''})`,
      private_present: Boolean(privateFunction),
      public_present: Boolean(publicFunction),
      arguments_match: privateFunction?.arguments === publicFunction?.arguments,
      public_security_definer: publicFunction?.security_definer ?? null,
      public_authenticated_execute: publicFunction?.authenticated_execute ?? null,
      public_anon_execute: publicFunction?.anon_execute ?? null,
      public_fingerprint: publicFunction?.fingerprint || null,
    };
  });
}

export function buildPrivateSecurityEvidence(input, { sourceBytes, sourceName, publicEvidence }) {
  const catalog = normalizePrivateCatalogExport(input);
  if (catalog.project_ref_expected !== TEST_PROJECT_REF) {
    throw new Error('private catalog is not pinned to the authorized TEST project');
  }
  const secretScan = scanSecrets(input);
  if (!secretScan.passed) throw new Error(`secret/PII scan failed with ${secretScan.findings.length} finding(s)`);

  const functions = catalog.functions || [];
  const relations = catalog.relations || [];
  const policies = catalog.policies || [];
  const tableGrants = catalog.table_grants || [];
  const columnGrants = catalog.column_grants || [];
  const exportFunction = functions.find((row) => row.schema_name === 'nexalvo_backup' && row.name === 'export_business_data');
  const exportDefinition = exportFunction?.definition || '';
  const accessFunction = functions.find((row) => row.schema_name === 'nexalvo_platform' && row.name === 'has_access');
  const accessDefinition = accessFunction?.definition || '';
  const provisionFunction = functions.find((row) => row.schema_name === 'nexalvo_platform' && row.name === 'provision_company');
  const provisionDefinition = provisionFunction?.definition || '';
  const ownerFunction = functions.find((row) => row.schema_name === 'nexalvo_platform' && row.name === 'assign_first_owner');
  const ownerDefinition = ownerFunction?.definition || '';
  const exportedTables = [...new Set([...exportDefinition.matchAll(/from\s+public\."([a-z_]+)"/gi)]
    .map((match) => match[1].toLowerCase()))].sort();

  return {
    evidence_version: EVIDENCE_VERSION,
    target: { project_ref: TEST_PROJECT_REF, branch: 'automation/nexalvo-qa-actions' },
    source: {
      basename: basename(sourceName || 'final_private_security_catalog.json'),
      sha256: sha256(sourceBytes),
      bytes: sourceBytes.length,
      raw_versioned: false,
      secret_scan: secretScan,
    },
    counts: catalog.counts || {},
    exported_array_counts: Object.fromEntries(Object.entries(catalog)
      .filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
    schema_security: catalog.schema_security || [],
    relations,
    policies,
    triggers: catalog.triggers || [],
    functions: functions.map(functionEvidence),
    grants: {
      table_grants_sha256: hashJson(tableGrants),
      table_grants_count: tableGrants.length,
      table_matrix: grantMatrix(tableGrants),
      column_grants_sha256: hashJson(columnGrants),
      column_grants_count: columnGrants.length,
      column_matrix: grantMatrix(columnGrants),
    },
    public_wrapper_comparison: wrapperComparison(publicEvidence, functions),
    audit_facts: {
      confirmed: {
        anon_function_execute_count: functions.filter((row) => row.anon_execute).length,
        authenticated_direct_relation_access_count: relations.filter((row) => row.authenticated_select || row.authenticated_write).length,
        anon_direct_relation_access_count: relations.filter((row) => row.anon_select || row.anon_write).length,
        security_definer_count: functions.filter((row) => row.security_definer).length,
        security_definer_without_empty_search_path: functions.filter((row) => row.security_definer && !(row.settings || []).includes('search_path=""')).map((row) => `${row.schema_name}.${row.name}`),
        authenticated_execute_functions: functions.filter((row) => row.authenticated_execute).map((row) => `${row.schema_name}.${row.name}`).sort(),
        export_owner_and_tenant_guard: /u\.id\s*=\s*auth\.uid\(\)[\s\S]*u\.business_id\s*=\s*p_business_id[\s\S]*u\.role\s*=\s*'OWNER'[\s\S]*u\.active/i.test(exportDefinition),
        export_limits: {
          per_table_rows: /limit\s+10001/i.test(exportDefinition) ? 10000 : null,
          total_rows: /v_total\s*>\s*50000/i.test(exportDefinition) ? 50000 : null,
          serialized_bytes: /octet_length\(v_data::text\)\s*>\s*20971520/i.test(exportDefinition) ? 20971520 : null,
        },
        export_includes_sensitive_tenant_data: /t\."hourly_rate"/i.test(exportDefinition)
          && /t\."amount"/i.test(exportDefinition) && /t\."unit_cost_snapshot"/i.test(exportDefinition),
        exported_tables: exportedTables,
        platform_access_requires_operator_and_active_profile: /from\s+nexalvo_platform\.operators\s+o\s+join\s+public\.users\s+u[\s\S]*o\.user_id\s*=\s*auth\.uid\(\)[\s\S]*o\.active[\s\S]*u\.active/i.test(accessDefinition),
        platform_access_checks_signed_superadmin_claim: /raw_app_meta_data|app_metadata|nexalvo_platform_role|SUPERADMIN/i.test(accessDefinition),
        provisioning_is_operator_gated: /if\s+not\s+nexalvo_platform\.has_access\(\)/i.test(provisionDefinition),
        provisioning_request_uses_advisory_lock: /pg_advisory_xact_lock/i.test(provisionDefinition)
          && /request_id\s*=\s*p_request_id/i.test(provisionDefinition),
        first_owner_is_operator_gated: /if\s+not\s+nexalvo_platform\.has_access\(\)/i.test(ownerDefinition),
        first_owner_uses_business_and_auth_locks: (ownerDefinition.match(/pg_advisory_xact_lock/gi) || []).length >= 2,
        first_owner_requires_confirmed_eligible_auth: /eligible_owner_auth\(p_auth_user_id\)/i.test(ownerDefinition),
      },
      conditional: {
        export_size_limit_is_checked_after_json_materialization: /select\s+jsonb_build_object[\s\S]*octet_length\(v_data::text\)/i.test(exportDefinition),
        deployed_platform_authority_differs_from_prepared_signed_claim_authority: /nexalvo_platform\.operators/i.test(accessDefinition)
          && !/nexalvo_platform_role|SUPERADMIN/i.test(accessDefinition),
      },
      missing_proof: [
        'active operator membership and signed SUPERADMIN claim alignment',
        'private table columns, constraints, indexes and default privileges',
        'versioned reproducible source for the seven deployed private functions',
        'real SUPERADMIN, OWNER and non-operator denial sessions',
      ],
    },
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function main() {
  const inputPath = option('--input');
  const outputPath = option('--output');
  const publicEvidencePath = option('--public-evidence')
    || resolve(new URL('./evidence/final-homologation-security-sanitized-20261017.json', import.meta.url).pathname);
  if (!inputPath || !outputPath) {
    throw new Error('usage: node qa/audit-private-security-catalog.mjs --input <raw.json> --output <sanitized.json> [--public-evidence <sanitized.json>]');
  }
  const sourceBytes = readFileSync(resolve(inputPath));
  const input = JSON.parse(sourceBytes.toString('utf8'));
  const publicEvidence = JSON.parse(readFileSync(resolve(publicEvidencePath), 'utf8'));
  const evidence = buildPrivateSecurityEvidence(input, {
    sourceBytes,
    sourceName: option('--source-name') || inputPath,
    publicEvidence,
  });
  writeFileSync(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    status: 'PASS',
    output: outputPath,
    source_sha256: evidence.source.sha256,
    secret_findings: evidence.source.secret_scan.findings.length,
    functions: evidence.functions.length,
    policies: evidence.policies.length,
    table_grants: evidence.grants.table_grants_count,
    column_grants: evidence.grants.column_grants_count,
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main();
