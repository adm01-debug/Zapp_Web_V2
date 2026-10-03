import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Run against a scratch checkout: RECONCILIATION_REPO=/path/to/repo node skins_probe.mjs
const repo = process.env.RECONCILIATION_REPO || process.cwd();
const out = process.env.RECONCILIATION_OUTPUT || path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(out,{recursive:true});
const baseline = '2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6';
const presetPath = 'src/components/settings/theme/presets.ts';
const presetSource = fs.readFileSync(`${repo}/${presetPath}`, 'utf8');
const presetModule = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(presetSource)).toString('base64')}`);
const {THEME_PRESETS, CSS_VARS_TO_APPLY, getPresetById, loadThemeConfig, saveThemeConfig, STORAGE_KEY, applyThemePreset, applyRadius, clearThemeOverrides, exportThemeConfig, importThemeConfig} = presetModule;
const outcomes = [];
const record = (id, pass, actual, expected) => outcomes.push({id, pass, actual, expected});
const values = new Map();
let storageWrites = 0, storageFails = false;
globalThis.localStorage = {
  getItem: k => values.get(k) ?? null,
  setItem: (k,v) => { storageWrites++; if(storageFails) throw new Error('simulated quota exhausted'); values.set(k,String(v)); },
  removeItem: k => values.delete(k),
};
const vars = new Map(), classes = new Set();
const root = {
  style: {setProperty:(k,v)=>vars.set(k,String(v)),removeProperty:k=>vars.delete(k)},
  classList: {contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)},
  dataset:{}, setAttribute:(k,v)=>{if(k==='data-preset-id')root.dataset.presetId=v;},
};
globalThis.document = {documentElement:root};
const normalized = s => (s??'').trim().replace(/\s+/g,' ');
record('catalog.count', THEME_PRESETS.length===19, THEME_PRESETS.length, 19);
record('catalog.unique_ids',new Set(THEME_PRESETS.map(p=>p.id)).size===19,new Set(THEME_PRESETS.map(p=>p.id)).size,19);
record('catalog.distinct_primaries',new Set(THEME_PRESETS.map(p=>p.dark.primary)).size===19,new Set(THEME_PRESETS.map(p=>p.dark.primary)).size,19);
record('catalog.categories',presetModule.classicPresets.length===10&&presetModule.gxPresets.length===9,{classic:presetModule.classicPresets.length,gx:presetModule.gxPresets.length},{classic:10,gx:9});
record('catalog.corporate_swatches',new Set(getPresetById('corporate').swatches).size===4,getPresetById('corporate').swatches,4);
const expectedGx = [['gx-classic','347 96% 54%'],['gx-pink-addiction','330 95% 60%'],['gx-purple-haze','265 65% 50%'],['gx-rose-quartz','345 75% 68%'],['gx-ultraviolet','271 76% 53%'],['gx-hackerman','127 65% 46%'],['gx-frutti-di-mare','182 90% 42%'],['gx-cyberpunk','55 100% 51%'],['gx-razer','113 70% 51%']];
for(const [id,primary] of expectedGx){const p=getPresetById(id);record(`gx.${id}`,p.light.primary===primary&&p.dark.primary===primary&&p.category==='gx'&&p.borderRadius===10&&p.font===undefined,{light:p.light.primary,dark:p.dark.primary,category:p.category,radius:p.borderRadius,font:p.font??null},{primary,category:'gx',radius:10,font:null});}
for(const p of THEME_PRESETS) for(const mode of ['light','dark']){
 const keys=Object.keys(p[mode]).sort(); const expected=[...CSS_VARS_TO_APPLY].sort();
 record(`keys.${p.id}.${mode}`,expected.every(k=>keys.includes(k)),{requiredKeys:expected.length,actualKeys:keys.length,extraKeys:keys.filter(k=>!expected.includes(k))},{requiredKeysPresent:true});
}
const css = fs.readFileSync(`${repo}/src/styles/tokens.css`,'utf8');
function block(header){const begin=css.indexOf('{',css.indexOf(header));let d=1,j=begin+1;for(;d&&j<css.length;j++){if(css[j]==='{')d++;if(css[j]==='}')d--;}const map={};for(const m of css.slice(begin+1,j-1).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))map[m[1]]=normalized(m[2]);return map;}
const light=block(':root {'), dark=block('.dark {');
for(const key of CSS_VARS_TO_APPLY)for(const mode of ['light','dark']){const expected=mode==='light'?light[key]:(dark[key]??light[key]);const actual=normalized(getPresetById('corporate')[mode][key]);record(`tokens.${mode}.${key}`,actual===expected,actual,expected);}
function luminance(hsl){let [h,s,l]=hsl.match(/[+-]?[\d.]+/g).map(Number);h=((h%360)+360)%360/360;s/=100;l/=100;const a=s*Math.min(l,1-l);const f=n=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};const rgb=[f(0),f(8),f(4)].map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
for(const p of THEME_PRESETS)for(const mode of ['light','dark'])for(const pair of ['primary','sidebar-primary']){const a=luminance(p[mode][pair]),b=luminance(p[mode][`${pair}-foreground`]);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);record(`contrast.${p.id}.${mode}.${pair}`,ratio>=3,ratio,3);}
for(const [legacy,current] of [['forest','emerald'],['teal','cyber'],['purple','purpure'],['default','corporate']]){values.set(STORAGE_KEY,JSON.stringify({v:5,preset:legacy,borderRadius:8,cssVarsCache:{primary:'old'}}));const cfg=loadThemeConfig();const saved=JSON.parse(values.get(STORAGE_KEY));record(`storage.migrate.${legacy}`,cfg.preset===current&&cfg.borderRadius===8&&saved.v===6&&!saved.cssVarsCache,{config:cfg,saved},{preset:current,radius:8,v:6,oldCache:false});}
for(const [input,expected] of [[999,20],[-3,0],['abc',14],[null,14],[8,8]]){values.set(STORAGE_KEY,JSON.stringify({v:6,preset:'corporate',borderRadius:input}));record(`storage.radius.${String(input)}`,loadThemeConfig().borderRadius===expected,loadThemeConfig().borderRadius,expected);}
values.set(STORAGE_KEY,'{invalid');record('storage.invalid_json',JSON.stringify(loadThemeConfig())===JSON.stringify({preset:'corporate',borderRadius:14}),loadThemeConfig(),{preset:'corporate',borderRadius:14});
values.set(STORAGE_KEY,'null');let nullResult;try{nullResult={config:loadThemeConfig()};}catch(e){nullResult={error:e.message};}record('storage.null_shape',!nullResult.error,nullResult,{config:{preset:'corporate',borderRadius:14}});
values.set(STORAGE_KEY,JSON.stringify({v:6,preset:'corporate',borderRadius:14,cacheMode:'dark',cssVarsCache:{primary:'old'}}));saveThemeConfig({preset:'gx-razer',borderRadius:10});record('storage.merge_preserves_cache',JSON.parse(values.get(STORAGE_KEY)).cssVarsCache.primary==='old',JSON.parse(values.get(STORAGE_KEY)),{cachePreserved:true});
const errors=[];const originalError=console.error;console.error=(...x)=>errors.push(x.map(y=>y instanceof Error?y.message:String(y)).join(' '));
storageFails=true;record('storage.quota_false',saveThemeConfig({preset:'corporate',borderRadius:14})===false,false,false);storageFails=false;
storageWrites=0;applyThemePreset('gx-classic','dark',{persistCache:false});record('apply.no_cache_write',storageWrites===0,storageWrites,0);record('apply.gx_values',vars.get('--background')==='265 22% 8%'&&vars.get('--radius')==='0.625rem',{background:vars.get('--background'),radius:vars.get('--radius')},{background:'265 22% 8%',radius:'0.625rem'});
classes.add('high-contrast');applyThemePreset('gx-razer','dark');const hcColors=CSS_VARS_TO_APPLY.filter(k=>vars.has(`--${k}`));record('apply.high_contrast_priority',hcColors.length===0,{inlineColorCount:hcColors.length,radius:vars.get('--radius'),cachePreset:JSON.parse(values.get(STORAGE_KEY)).cachePreset},{inlineColorCount:0,radius:'0.625rem',cachePreset:'gx-razer'});classes.delete('high-contrast');
applyRadius(Number.NaN);record('apply.radius_nan',vars.get('--radius')==='0.875rem',vars.get('--radius'),'0.875rem');clearThemeOverrides();record('apply.clear',!root.dataset.presetId&&!vars.has('--radius')&&!JSON.parse(values.get(STORAGE_KEY)).cssVarsCache,{dataset:root.dataset,vars:Object.fromEntries(vars),cache:JSON.parse(values.get(STORAGE_KEY))},{emptyOverrides:true});
record('import.roundtrip',JSON.stringify(importThemeConfig(exportThemeConfig({preset:'gx-razer',borderRadius:10})))===JSON.stringify({preset:'gx-razer',borderRadius:10}),importThemeConfig(exportThemeConfig({preset:'gx-razer',borderRadius:10})),{preset:'gx-razer',borderRadius:10});
// Actual hook body, with a minimal synchronous React state harness. Effects are
// intentionally not run: this proves saved-state bookkeeping, not browser paint.
const hookPath='src/components/settings/theme/useThemePreset.ts';
const hookSource=fs.readFileSync(`${repo}/${hookPath}`,'utf8');
let hookJs=stripTypeScriptTypes(hookSource).replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm,'');
const state=[];let cursor=0;const toasts=[];
globalThis.__skinsAuditHarness={...presetModule,useTheme:()=>({resolvedTheme:'dark'}),useState:init=>{const i=cursor++;if(!(i in state))state[i]=typeof init==='function'?init():init;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next;}];},useEffect:()=>{},useCallback:f=>f,useMemo:f=>f(),toast:{success:(...a)=>toasts.push({kind:'success',args:a}),error:(...a)=>toasts.push({kind:'error',args:a})}};
hookJs='const {useState,useEffect,useCallback,useMemo,toast,useTheme,applyThemePreset,applyRadius,loadThemeConfig,saveThemeConfig,clearThemeOverrides,getDefaultConfig,getPresetById}=globalThis.__skinsAuditHarness;\n'+hookJs;
const hookModule=await import(`data:text/javascript;base64,${Buffer.from(hookJs).toString('base64')}`);
values.set(STORAGE_KEY,JSON.stringify({v:6,preset:'corporate',borderRadius:14}));cursor=0;let hook=hookModule.useThemePreset();storageFails=true;hook.applyPreset('gx-hackerman');cursor=0;hook=hookModule.useThemePreset();const autoSave={config:hook.config,hasUnsavedChanges:hook.hasUnsavedChanges,persisted:JSON.parse(values.get(STORAGE_KEY)),toasts:[...toasts]};record('hook.quota_unsaved_indicator',autoSave.hasUnsavedChanges===true&&autoSave.toasts.some(x=>x.kind==='error'),autoSave,{hasUnsavedChanges:true,errorToast:true,persistedPreset:'corporate'});storageFails=false;console.error=originalError;
const bootSource=fs.readFileSync(`${repo}/index.html`,'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
values.clear();values.set('theme','dark');values.set(STORAGE_KEY,JSON.stringify({v:6,preset:'gx-classic',borderRadius:10,cacheMode:'light',cssVarsCache:{background:'WRONG-MODE'}}));vars.clear();vm.runInNewContext(bootSource,{localStorage,document,window:{matchMedia:()=>({matches:true})},console});record('boot.rejects_wrong_mode_cache',!vars.has('--background'),Object.fromEntries(vars),{backgroundCacheAbsent:true});
const report={baseline,executed_at:new Date().toISOString(),runtime:process.version,method:'Actual TypeScript source stripped with Node; in-memory storage/document; synchronous hook state harness; no React renderer, browser, DB, network, provider or deploy.',source_hashes:Object.fromEntries([presetPath,hookPath,'src/styles/tokens.css','index.html'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`${repo}/${p}`)).digest('hex')])),total:outcomes.length,passed:outcomes.filter(x=>x.pass).length,failed:outcomes.filter(x=>!x.pass).length,outcomes,limits:['Static theme ratios cover two solid token pairs at threshold 3:1, not composed UI WCAG AA 4.5:1 or Diversity gradients.','The document mock proves setter/removal choices, not rendered pixels or actual high-contrast output.','The hook harness proves return-value/state bookkeeping without React batching, effects, or browser storage failure.','No historical authenticated Skins QA was rerun.'],captured_expected_storage_errors:errors};
fs.writeFileSync(`${out}/skins_probe_results.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed,failures:outcomes.filter(x=>!x.pass)},null,2));
