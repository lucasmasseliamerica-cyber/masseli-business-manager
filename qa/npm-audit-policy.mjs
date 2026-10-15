import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const KNOWN_BUILD_PACKAGES=new Set([
 'braces','chokidar','fast-glob','micromatch','postcss-nested','postcss-selector-parser','tailwindcss',
]);
export const KNOWN_ADVISORY_SOURCES=new Set([1240992,1241232]);

export function evaluateAudit(report){
 const vulnerabilities=report?.vulnerabilities&&typeof report.vulnerabilities==='object'
  ? report.vulnerabilities:{};
 const metadata=report?.metadata?.vulnerabilities||{};
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
 if(unknownPackages.length)reasons.push('unknown vulnerable packages: '+unknownPackages.sort().join(', '));
 if(unknownAdvisories.length)reasons.push('unknown advisory sources: '+unknownAdvisories.sort((a,b)=>a-b).join(', '));
 if(counts.critical>0)reasons.push('critical vulnerabilities present');
 if(counts.total>7||counts.high>5||counts.moderate>2||counts.low>0||counts.info>0){
  reasons.push('known build-only vulnerability ceiling exceeded');
 }
 return {ok:reasons.length===0,reasons,names:names.sort(),advisorySources:[...advisorySources].sort((a,b)=>a-b),counts};
}

function main(){
 const path=process.argv[2];
 if(!path)throw new Error('Usage: node qa/npm-audit-policy.mjs <npm-audit.json>');
 const report=JSON.parse(readFileSync(path,'utf8'));
 const result=evaluateAudit(report);
 console.log(`npm audit policy: total=${result.counts.total} high=${result.counts.high} moderate=${result.counts.moderate} critical=${result.counts.critical}`);
 if(!result.ok){
  for(const reason of result.reasons)console.error('npm audit policy violation: '+reason);
  process.exitCode=1;
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
