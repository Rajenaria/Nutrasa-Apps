import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertLocalEnvironment, localConnection, localDatabase, localFailure, localRoles, nativeWriterCheck,
  parseLocalArguments, verifyWriterOnce, writerResetArguments } from './integration/local-integration-cli.ts';

const require = createRequire(import.meta.url);
const runner = fileURLToPath(new URL('./integration/run-local-integration.ps1', import.meta.url));
const writerUrl = new URL(`postgresql://${localRoles.writer}:SYNTHETIC@127.0.0.1:5433/${localDatabase}`);

test('local runner accepts only explicit actions on the existing approved database', () => {
  for (const action of ['preflight','reset-arguments','check-writer','preflight-run']) {
    assert.equal(parseLocalArguments(['--action',action,'--database',localDatabase]),action);
  }
  for (const args of [[], ['--action','setup','--database',localDatabase],
    ['--action','check-writer','--database','nutrasa_test'],
    ['--action','check-writer','--database','nutrasa_it_cc04120d7d674370ad4e6a0e03afd9de'],
    ['--action','check-writer','--database',localDatabase,'--port','5432']]) assert.throws(() => parseLocalArguments(args));
  assert.ok(Object.values(localRoles).every(role => Buffer.byteLength(role)<=63));
});

test('local credential mapping rejects writer/runtime swaps and connection overrides before connecting', () => {
  assert.equal(localConnection({NUTRASA_IT_WRITER_URL:writerUrl.toString()},'writer').username,localRoles.writer);
  const admin = new URL(writerUrl); admin.username=localRoles.admin;
  assert.equal(localConnection({NUTRASA_IT_ADMIN_URL:admin.toString()},'admin').username,localRoles.admin);
  for (const changes of [{username:localRoles.runtime},{hostname:'localhost'},{port:'5432'},
    {pathname:'/nutrasa_test'},{search:'?user=nutrasa_it_admin'},{hash:'#override'},{password:''}]) {
    const url = new URL(writerUrl);Object.assign(url,changes);
    assert.throws(() => localConnection({NUTRASA_IT_WRITER_URL:url.toString()},'writer'));
  }
  for (const key of ['PGOPTIONS','PGREPLICATION','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSWORD','PGPASSFILE','NODE_OPTIONS']) {
    assert.throws(() => assertLocalEnvironment({[key]:'synthetic'}));
  }
  assert.throws(() => assertLocalEnvironment({PGPORT:'5432'}));
  assert.doesNotThrow(() => assertLocalEnvironment({PGPORT:'5433'}));
});

test('error reporting discards credentials URLs stacks messages and arbitrary error codes', () => {
  const secret = 'SYNTHETIC_DO_NOT_REPORT';
  const error = Object.assign(Error(writerUrl.toString()+secret),{code:secret});
  assert.equal(localFailure('configuration',error),'STOP: configuration failed [CHECK_FAILED]. No retry; integration NOT invoked.');
  assert.ok(!localFailure('configuration',error).includes(secret));
  assert.match(localFailure('node writer login',{code:'28P01',detail:secret}),/\[28P01\]/);
});

test('one captured writer credential reaches native then Node exactly once', async () => {
  const seen: URL[] = []; const statuses: string[] = [];
  await verifyWriterOnce(writerUrl,{native:async url=>{seen.push(url);},node:async url=>{seen.push(url);}},line=>statuses.push(line));
  assert.deepEqual(seen,[writerUrl,writerUrl]);
  assert.deepEqual(statuses,['NATIVE PSQL WRITER LOGIN PASS','NODE WRITER LOGIN PASS']);
});

test('native failure stops Node without retry and redacts the original error', async () => {
  let nativeCalls=0;let nodeCalls=0;
  await assert.rejects(verifyWriterOnce(writerUrl,{
    native:async()=>{nativeCalls++;throw Error('SYNTHETIC_PRIVATE_STDERR');},
    node:async()=>{nodeCalls++;},
  },()=>{}),{message:'STOP: native writer login failed [CHECK_FAILED]. No retry; integration NOT invoked.'});
  assert.equal(nativeCalls,1);assert.equal(nodeCalls,0);
});

test('Node failure stops after one native and one Node call without exposing detail', async () => {
  let nativeCalls=0;let nodeCalls=0;
  await assert.rejects(verifyWriterOnce(writerUrl,{
    native:async()=>{nativeCalls++;},
    node:async()=>{nodeCalls++;throw Object.assign(Error('SYNTHETIC_PRIVATE_DETAIL'),{code:'28P01'});},
  },()=>{}),{message:'STOP: node writer login failed [28P01]. No retry; integration NOT invoked.'});
  assert.equal(nativeCalls,1);assert.equal(nodeCalls,1);
});

test('native reset plan fixes the exact target and only issues one interactive password reset', () => {
  const args=writerResetArguments(); const connection=args[args.indexOf('-d')+1];assert.ok(connection);
  assert.ok(connection.includes('host=127.0.0.1 hostaddr=127.0.0.1 port=5433'));
  assert.ok(connection.includes('user=nutrasa_it_admin'));
  assert.equal(args.filter(value=>value.startsWith('\\password')).length,1);
  assert.equal(args.at(-1),'\\password '+localRoles.writer);
  const guard=args[args.indexOf('-c')+1];assert.ok(guard);
  assert.ok(guard.includes('BEGIN READ ONLY;'));assert.ok(guard.includes('rolvaliduntil'));
  assert.ok(guard.includes('7697229180258678980'));assert.ok(guard.includes('180006'));
  assert.doesNotMatch(args.join('\n'),/rolpassword|pg_authid|ALTER ROLE|CREATE ROLE|CREATE DATABASE|GRANT |DROP |password=/i);
  // Windows PowerShell 5.1 native argument handling strips embedded quotes; the SQL avoids them.
  assert.ok(!args.some(value=>value.includes('"')));
});

test('native writer process gets the same decoded credential only through child environment and discards stderr', async () => {
  const secret='SYNTHETIC@%:/ with spaces';
  const url=new URL(writerUrl);url.password=encodeURIComponent(secret);
  let childEnvironment: NodeJS.ProcessEnv | undefined;let launches=0;
  await nativeWriterCheck(url,(file,args,options,complete)=>{
    launches++;childEnvironment=options.env;
    assert.ok(file.endsWith('psql.exe'));
    assert.ok(args.includes('-w'));assert.ok(args.includes('ON_ERROR_STOP=1'));
    assert.ok(!args.join(' ').includes(secret));assert.ok(!args.join(' ').includes(url.toString()));
    assert.ok(args.some(arg=>arg.includes('BEGIN READ ONLY;')));
    assert.ok(args.some(arg=>arg.includes('hostaddr=127.0.0.1 port=5433')));
    assert.equal(options.env.PGPASSWORD,secret);assert.equal(options.windowsHide,true);
    assert.ok(!('PGSERVICE' in options.env));
    complete(null,'t\r\n');
  });
  assert.equal(launches,1);assert.equal(childEnvironment?.PGPASSWORD,undefined);
  await assert.rejects(nativeWriterCheck(url,(_file,_args,_options,complete)=>{
    complete(Error('SYNTHETIC_PRIVATE_STDERR'),'t');
  }),{message:'Native writer check failed.'});
});

test('PowerShell parses offline and its actual encoder survives pg parsing for every role and special characters', () => {
  const script=String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$tokens=$null; $errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($env:NUTRASA_TEST_RUNNER,[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) { throw 'PowerShell parse failed.' }
$definition=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'ConvertTo-LocalConnection'},$true)
if (-not $definition) { throw 'Encoder missing.' }
# Evaluate only this trusted pure function definition, never the runner body or any connection stage.
& ([scriptblock]::Create($definition.Extent.Text))
`;
  // Dot-source the pure definition so it is visible for the following synthetic calls.
  const testScript=script.replace('& ([scriptblock]::Create($definition.Extent.Text))','. ([scriptblock]::Create($definition.Extent.Text))')+String.raw`
$database='nutrasa_it_419e5962579e4d22a83a8ff1ecea417f'
$roles=@('nutrasa_it_admin',($database+'_migrator'),($database+'_runtime'),($database+'_writer'))
$samples=@('SYNTHETIC',(-join (33..126 | ForEach-Object {[char]$_})),'  synthetic spaces  ',('Synthetic'+[char]0x00E9+[char]0x0301+[char]::ConvertFromUtf32(0x1F34E)))
$cases=@(foreach($role in $roles){foreach($sample in $samples){$url=ConvertTo-LocalConnection -TargetDatabase $database -Role $role -Password $sample;[pscustomobject]@{role=$role;expected=$sample;url=$url;native=([Uri]::UnescapeDataString((([Uri]$url).UserInfo -split ':',2)[1]))}}})
$rejected=0
foreach($bad in @('',('bad'+[char]0),('bad'+[char]10),('bad'+[char]13))){try{ConvertTo-LocalConnection -TargetDatabase $database -Role ($database+'_writer') -Password $bad | Out-Null}catch{$rejected++}}
if($rejected -ne 4){throw 'Invalid synthetic credential accepted.'}
try{ConvertTo-LocalConnection -TargetDatabase 'nutrasa_test' -Role 'nutrasa_test_migrator' -Password 'synthetic' | Out-Null;throw 'Unexpected target accepted.'}catch{if($_.Exception.Message -eq 'Unexpected target accepted.'){throw}}
$node=$env:NUTRASA_TEST_NODE
$cli=$env:NUTRASA_TEST_CLI
$Database=$database
$invokeDefinition=$ast.Find({param($entry) $entry -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $entry.Name -eq 'Invoke-LocalNode'},$true)
. ([scriptblock]::Create($invokeDefinition.Extent.Text))
$resetPlan=Invoke-LocalNode -Action 'reset-arguments' | ConvertFrom-Json
$resetArguments=@($resetPlan | ForEach-Object { $_ })
[pscustomobject]@{cases=$cases;resetArguments=$resetArguments} | ConvertTo-Json -Depth 4 -Compress
`;
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(testScript,'utf16le').toString('base64')],{
    encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,ComSpec:process.env.ComSpec,
      PATHEXT:process.env.PATHEXT,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,TMP:process.env.TMP,
      USERPROFILE:process.env.USERPROFILE,LOCALAPPDATA:process.env.LOCALAPPDATA,APPDATA:process.env.APPDATA,NUTRASA_TEST_RUNNER:runner,
      NUTRASA_TEST_NODE:process.execPath,NUTRASA_TEST_CLI:fileURLToPath(new URL('./integration/local-integration-cli.ts',import.meta.url))},windowsHide:true,
  });
  const result: {cases:{role:string;expected:string;url:string;native:string}[];resetArguments:string[]}=JSON.parse(output.trim());
  assert.deepEqual(result.resetArguments,writerResetArguments());
  const cases=result.cases;
  const ConnectionParameters: new(config:{connectionString:string;ssl:boolean})=>{
    user:string;password:string;host:string;port:number;database:string;
  }=require('pg/lib/connection-parameters.js');
  assert.equal(cases.length,16);
  for(const sample of cases){
    const parsed=new ConnectionParameters({connectionString:sample.url,ssl:false});
    assert.equal(parsed.user,sample.role);assert.equal(parsed.password,sample.expected);
    assert.equal(sample.native,sample.expected);
    assert.equal(parsed.host,'127.0.0.1');assert.equal(parsed.port,5433);assert.equal(parsed.database,localDatabase);
    if(sample.role===localRoles.admin || sample.role===localRoles.writer){
      assert.equal(localConnection({[sample.role===localRoles.admin?'NUTRASA_IT_ADMIN_URL':'NUTRASA_IT_WRITER_URL']:sample.url},sample.role===localRoles.admin?'admin':'writer').username,sample.role);
    }
  }
});

test('PowerShell recovery stops before Run, delegates the existing suite and clears temporary environment', async () => {
  const source=await readFile(runner,'utf8');
  assert.ok(source.includes("if ($Phase -eq 'Setup')"));
  assert.ok(source.includes("if ($Phase -eq 'Diagnose')"));
  assert.ok(source.indexOf("Invoke-LocalNode -Action 'preflight'")<source.indexOf('& $psql @resetArguments'));
  assert.ok(source.indexOf('& $psql @resetArguments')<source.indexOf("Invoke-LocalNode -Action 'check-writer'"));
  assert.match(source,/Invoke-LocalNode -Action 'check-writer'\s+return/);
  assert.ok(source.includes('npm.cmd run test:integration:catalog-lineage'));
  assert.ok(source.includes("[Environment]::SetEnvironmentVariable($name, $null, 'Process')"));
  assert.doesNotMatch(source,/Invoke-Expression|Write-Host\s+\$(?:plain|encoded|secret|env:)/);
});
