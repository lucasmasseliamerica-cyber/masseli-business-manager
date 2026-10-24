import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const KNOWN_BUILD_PACKAGES=new Set([
 'braces','chokidar','fast-glob','micromatch','postcss-nested','postcss-selector-parser','tailwindcss',
]);
export const KNOWN_ADVISORY_SOURCES=new Set([1240992,1241232]);
// An upstream severity downgrade must not look like a new vulnerability simply
// because it moves a package from the high bucket into the moderate bucket.
// Retain the reviewed ceiling per package, as well as the package/advisory sets.
const BUILD_SEVERITY_CEILINGS=Object.freeze({
 braces:'high',chokidar:'high','fast-glob':'high',micromatch:'high',tailwindcss:'high',
 'postcss-nested':'moderate','postcss-selector-parser':'moderate',
});

export function evaluateAudit(report){
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const severities=['critical','high','moderate','low','info'];
 const metadata=report?.metadata?.vulnerabilities;
 // A registry/network error is not a completed scan, even if npm exits with code 1.
 // Never replace absent data with zero counts or print the service's raw error/URL.
 if(!object(report)||Object.hasOwn(report,'error')||!object(report.vulnerabilities)||!object(metadata)
   ||![...severities,'total'].every(key=>Number.isSafeInteger(metadata[key])&&metadata[key]>=0)){
  return {ok:false,complete:false,reasons:['AUDIT_REPORT_INVALID_OR_UNAVAILABLE'],names:[],advisorySources:[],counts:null};
 }
 const vulnerabilities=report.vulnerabilities;
 if(Object.values(vulnerabilities).some(row=>!object(row)||!Array.isArray(row.via)||row.via.length===0
   ||row.via.some(via=>typeof via!=='string'&&(!object(via)||!Number.isSafeInteger(via.source)||via.source<=0)))){
  return {ok:false,complete:false,reasons:['AUDIT_REPORT_ADVISORY_SCHEMA_INVALID'],names:[],advisorySources:[],counts:null};
 }
 const names=Object.keys(vulnerabilities);
 const unknownPackages=names.filter(name=>!KNOWN_BUILD_PACKAGES.has(name));
 const advisorySources=new Set();
 for(const vulnerability of Object.values(vulnerabilities)){
  for(const via of vulnerability?.via||[]){
   if(via&&typeof via==='object'&&Number.isInteger(via.source))advisorySources.add(via.source);
  }
 }
 const unknownAdvisories=[...advisorySources].filter(source=>!KNOWN_ADVISORY_SOURCES.has(source));
 const counts={
  critical:Number(metadata.critical||0),high:Number(metadata.high||0),moderate:Number(metadata.moderate||0),
  low:Number(metadata.low||0),info:Number(metadata.info||0),total:Number(metadata.total||0),
 };
 const reasons=[];
 let complete=true;
 if(counts.total!==severities.reduce((sum,key)=>sum+counts[key],0)||counts.total!==names.length
   ||Object.values(vulnerabilities).some(row=>!object(row)||!severities.includes(row.severity)||!Array.isArray(row.via))
   ||severities.some(severity=>Object.values(vulnerabilities).filter(row=>row?.severity===severity).length!==counts[severity])){
  reasons.push('AUDIT_REPORT_COUNTS_INCONSISTENT');complete=false;
 }
 if(unknownPackages.length)reasons.push('unknown vulnerable packages: '+unknownPackages.sort().join(', '));
 if(unknownAdvisories.length)reasons.push('unknown advisory sources: '+unknownAdvisories.sort((a,b)=>a-b).join(', '));
 if(counts.critical>0)reasons.push('critical vulnerabilities present');
 // Preserve the remote QA baseline: exactly the reviewed package/advisory sets,
 // at most three moderate build findings, and no increase in per-package severity.
 if(counts.total>7||counts.high>5||counts.moderate>3||counts.low>0||counts.info>0){
  reasons.push('known build-only vulnerability ceiling exceeded');
 }
 if(names.some(name=>BUILD_SEVERITY_CEILINGS[name]
   &&severities.indexOf(vulnerabilities[name].severity)<severities.indexOf(BUILD_SEVERITY_CEILINGS[name]))){
  reasons.push('reviewed package severity ceiling exceeded');
 }
 return {ok:complete&&reasons.length===0,complete,reasons,names:names.sort(),advisorySources:[...advisorySources].sort((a,b)=>a-b),counts};
}

function main(){
 const path=process.argv[2];
 if(!path)throw new Error('Usage: node qa/npm-audit-policy.mjs <npm-audit.json>');
 let report;
 try{report=JSON.parse(readFileSync(path,'utf8'));}
 catch{console.error('npm audit policy: BLOCKED [AUDIT_REPORT_UNAVAILABLE]');process.exitCode=2;return;}
 const result=evaluateAudit(report);
 if(!result.complete){console.error('npm audit policy: BLOCKED [AUDIT_REPORT_INVALID_OR_INCOMPLETE]');process.exitCode=2;return;}
 console.log(`npm audit policy: total=${result.counts.total} high=${result.counts.high} moderate=${result.counts.moderate} critical=${result.counts.critical}`);
 if(!result.ok){
  for(const reason of result.reasons)console.error('npm audit policy violation: '+reason);
  process.exitCode=1;
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
