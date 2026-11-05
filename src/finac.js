import Decimal from 'decimal.js';
import {matchesMixing} from './calculation.js';
import {machineLabel} from './opname.js';
Decimal.set({precision:80,rounding:Decimal.ROUND_HALF_UP});
const numberPattern=/^-?\d+(?:\.\d+)?$/;
function decimal(value,{required=false,nonnegative=false}={}){
 const str=typeof value==='number'&&Number.isFinite(value)?new Decimal(value).toFixed():String(value??'').trim(); if(!str){if(required)throw Error('Angka wajib diisi');return null}
 if(!numberPattern.test(str)||str.replace('-', '').split('.')[0].length>18||(str.split('.')[1]??'').length>18)throw Error('Angka tidak valid');
 const d=new Decimal(str);if(nonnegative&&d.isNegative())throw Error('Angka tidak boleh negatif');return d.toFixed();
}
export function previewFinac(rows){
 const valid=[],duplicates=[],errors=[],seen=new Set();
 rows.forEach((r,i)=>{if(!matchesMixing(r.name))return;const code=String(r.code??'').trim();try{
 if(!code)throw Error('Kode kosong');
 if(seen.has(code)){duplicates.push({line:i+2,code});return}seen.add(code);
 const system_qty=decimal(r.qty,{required:true}),average_cost=decimal(r.average,{nonnegative:true}),total_value=decimal(r.total);
 valid.push({code,name:r.name,system_qty,average_cost,total_value});
 }catch(e){errors.push({line:i+2,reason:e.message})}});return {valid,duplicates,errors};
}
export function rowsFromFinacSheet(all){const headers=Array.from(all[0]??[],x=>String(x??'').trim().toLowerCase());for(const k of ['code','name','qty','average','total'])if(!headers.includes(k))throw Error('Kolom '+k+' tidak ditemukan');return all.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))}
export function parseCsv(text){const rows=[];let row=[],cell='',quoted=false,started=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"'&&!started){quoted=true;started=true}else if(c===','){row.push(cell);cell='';started=false}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';started=false}else if(c==='"')throw Error('CSV tidak valid');else{cell+=c;started=true}}if(quoted)throw Error('CSV tidak valid');row.push(cell);if(row.some(v=>v!==''))rows.push(row);if(rows[0]?.[0])rows[0][0]=rows[0][0].replace(/^\ufeff/,'');return rows}
const plus=(a,b)=>new Decimal(a).plus(b).toFixed();
export function reconcile(report){
 const complete=report.machines.length>0&&report.machines.every(m=>m.status==='COMPLETED'), snap=report.snapshot, result=new Map();const selected=new Map((report.price_selection?.items??[]).map(x=>[x.code,x]));
 for(const f of snap?.items??[])result.set(f.code,{code:f.code,name:f.name,system:f.system_qty,cost:f.average_cost,totalValue:f.total_value,actual:'0',whole:0,open:'0',hopper:'0',standards:new Set(),locations:[],hasPhysical:false});
 for(const i of report.items){let r=result.get(i.code);if(!r){r={code:i.code,name:i.name,system:null,cost:null,totalValue:null,actual:'0',whole:0,open:'0',hopper:'0',standards:new Set(),locations:[],hasPhysical:false};result.set(i.code,r)}r.hasPhysical=true;r.actual=plus(r.actual,i.actual);r.whole+=Number(i.whole);r.open=plus(r.open,i.open);r.hopper=plus(r.hopper,i.hopper);if(i.standard!=null)r.standards.add(new Decimal(i.standard).toFixed());else if(Number(i.whole)>0)r.standards.add('belum tersedia');r.locations.push(i)}
 const rows=[...result.values()].sort((a,b)=>a.code.localeCompare(b.code)).map(r=>{const actualKnown=complete||r.hasPhysical;const delta=snap?.qty_is_kg&&r.system!==null&&complete?new Decimal(r.system).minus(r.actual).toFixed():null;const finacCost=snap?.cost_per_kg?r.cost:null,choice=selected.get(r.code),cost=choice?.price??null;const differenceValue=delta!==null&&cost!==null?new Decimal(delta).times(cost).toDecimalPlaces(2).toFixed(2):null;const totalPrice=cost!==null&&actualKnown?new Decimal(cost).times(r.actual).toDecimalPlaces(2).toFixed(2):null;return {...r,actualKnown,delta,cost,finacCost,finacAverage:r.cost,priceSource:report.price_selection?.source??null,priceVersion:choice?.price_version??null,priceVersionId:choice?.price_version_id??null,differenceValue,totalPrice,standard:r.standards.size===1?[...r.standards][0]:null,mixedStandards:r.standards.size>1,status:r.system===null?'Tidak ditemukan di FINAC':!complete?'Belum final':!snap?.qty_is_kg?'Satuan belum dikonfirmasi':new Decimal(delta).isZero()?'Cocok':'Selisih'}});
 return {rows,complete,missingMachines:report.machines.filter(m=>m.status!=='COMPLETED').length,ready:Boolean(snap&&snap.qty_is_kg&&complete&&!rows.some(r=>r.mixedStandards)),mixedStandards:rows.filter(r=>r.mixedStandards).length};
}
export function machineName(i){return machineLabel(i.machine_number)}
